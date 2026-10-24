-- This migration installs the cutover. It does not activate it.
alter table public.events add column booking_review_original_allowance integer;
alter table public.events add column booking_review_proposed_capacity bigint;

create table private.legacy_accounting_snapshots (
  event_id uuid primary key references public.events(id),
  captured_at timestamptz not null default now(),
  accounting jsonb not null
);
alter table private.legacy_accounting_snapshots enable row level security;
revoke all on private.legacy_accounting_snapshots from public, anon, authenticated, service_role;

create function private.package_cutover_preflight() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare work jsonb; history jsonb; drafts jsonb; active integer;
begin
  if current_user <> 'postgres' then raise insufficient_privilege using message='Owner-only cutover.'; end if;
  select active_creation_version into active from private.booth_contract_guard where id;
  select jsonb_build_object(
    'unresolvedAttempts', count(*) filter(where accounting_version=1 and state in ('Reserved','Accepted','Uncertain')),
    'unfinishedRuns', (select count(*) from public.booth_runs where accounting_version=1 and state<>'Ended'),
    'liveEvents', (select count(*) from public.events where accounting_version=1 and state='Live')
  ) into work from public.print_attempts;
  select jsonb_build_object(
    'terminalEvents',count(*) filter(where state in ('Completed','Cancelled')),
    'redactedEvents',count(*) filter(where redacted_at is not null),
    'deletedDrafts',count(*) filter(where deleted_at is not null),
    'stockRows',(select count(*) from public.film_stock_entries),
    'additionalPrintRows',(select count(*) from public.additional_print_entries),
    'testAttempts',(select count(*) from public.print_attempts where accounting_version=1 and kind='Test'),
    'wastedEvidence',(select count(*) from public.print_attempt_events where accounting_version=1 and state='WastedFilm'),
    'auditRows',(select count(*) from public.activity_events where accounting_version=1),
    'receiptRows',(select count(*) from public.operation_receipts where accounting_version=1)
  ) into history from public.events where accounting_version=1;
  select jsonb_build_object(
    'eligible',count(*) filter(where deleted_at is null and film_package_count between 0 and 214748364 and revision<2147483647),
    'requiresBookingReview',count(*) filter(where deleted_at is null and film_package_count between 0 and 214748364 and original_print_allowance is distinct from film_package_count::bigint*10),
    'requiresCorrection',count(*) filter(where deleted_at is null and (film_package_count not between 0 and 214748364 or revision=2147483647)),
    'startedDrafts',count(*) filter(where deleted_at is null and exists(select 1 from public.booth_runs r where r.event_id=events.id))
  ) into drafts from public.events where accounting_version=1 and state='Draft';
  return jsonb_build_object('ready',active=1 and (work->>'unresolvedAttempts')::bigint=0
    and (work->>'unfinishedRuns')::bigint=0 and (work->>'liveEvents')::bigint=0
    and (drafts->>'requiresCorrection')::bigint=0 and (drafts->>'startedDrafts')::bigint=0,
    'activeCreationVersion',active,'blockingLegacyWork',work,'immutableHistory',history,'drafts',drafts);
end $$;
revoke all on function private.package_cutover_preflight() from public,anon,authenticated,service_role;

create function private.activate_package_accounting() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare report jsonb; f record;
begin
  if current_user <> 'postgres' then raise insufficient_privilege using message='Owner-only cutover.'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  -- Drain in-flight legacy writes before the final preflight, including Test and stock operations.
  lock table public.events,public.booth_runs,public.print_attempts,public.print_attempt_events,
    public.film_stock_entries,public.additional_print_entries,public.activity_events,
    public.operation_receipts in share row exclusive mode;
  report:=private.package_cutover_preflight();
  if not (report->>'ready')::boolean then raise exception 'package_cutover_blocked: %',report; end if;
  insert into private.legacy_accounting_snapshots(event_id,accounting)
  select e.id,jsonb_build_object('state',e.state,'originalPackages',e.film_package_count,
    'originalPrintAllowance',e.original_print_allowance,
    'additionalPrints',(select coalesce(sum(quantity),0) from public.additional_print_entries x where x.event_id=e.id),
    'stockRows',(select count(*) from public.film_stock_entries x where x.event_id=e.id),
    'testAttempts',(select count(*) from public.print_attempts x where x.event_id=e.id and x.kind='Test'),
    'guestAttempts',(select count(*) from public.print_attempts x where x.event_id=e.id and x.kind='Guest'),
    'wastedEvidence',(select count(*) from public.print_attempt_events x join public.print_attempts a on a.id=x.attempt_id where a.event_id=e.id and x.state='WastedFilm'),
    'auditRows',(select count(*) from public.activity_events x where x.event_id=e.id),
    'receiptRows',(select count(*) from public.operation_receipts x where x.event_id=e.id))
  from public.events e where e.accounting_version=1 and e.state in ('Completed','Cancelled');
  update public.events e set accounting_version=2,original_print_allowance=null,
    booking_review_original_allowance=e.original_print_allowance,
    booking_review_proposed_capacity=e.film_package_count::bigint*10,
    booking_review_required=e.original_print_allowance is distinct from e.film_package_count::bigint*10,
    revision=e.revision+1
  where e.accounting_version=1 and e.state='Draft' and e.deleted_at is null;
  update private.booth_contract_guard set active_creation_version=2,activated_at=clock_timestamp() where id;
  alter table public.events alter column accounting_version set default 2;
  revoke insert(original_print_allowance),update(original_print_allowance) on public.events from authenticated;
  -- Retire exposed v1 mutations while keeping their historical read functions and rows.
  for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname=any(array[
        'add_film_stock','reconcile_film_stock','add_event_prints','begin_event_redaction','complete_event_redaction',
        'change_event_run','confirm_booth_handoff','finish_booth_handoff','prepare_booth_handoff',
        'abandon_guest_session','open_guest_session','record_capture','reserve_guest_attempt','reserve_test_attempt',
        'confirm_test_output','mark_wasted_film','report_booth_observation','report_test_observation',
        'resolve_uncertain_print','recover_interrupted_print','pause_booth_for_reconnect','request_booth_pause'])
  loop
    execute pg_catalog.format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
  return report || jsonb_build_object('activated',true);
end $$;
revoke all on function private.activate_package_accounting() from public,anon,authenticated,service_role;

-- A stale direct write cannot restore v1 accounting or bypass booking review.
create function private.package_cutover_row_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare active integer; old_version integer; new_version integer;
begin
  select active_creation_version into active from private.booth_contract_guard where id;
  if active<>2 then return coalesce(new,old); end if;
  old_version:=case when tg_op='INSERT' then null else (to_jsonb(old)->>'accounting_version')::integer end;
  new_version:=case when tg_op='DELETE' then null else (to_jsonb(new)->>'accounting_version')::integer end;
  if tg_table_name in ('film_stock_entries','additional_print_entries','film_stock_balance')
    or old_version=1 or new_version=1 then
    raise insufficient_privilege using message='Legacy accounting writes are retired.';
  end if;
  return coalesce(new,old);
end $$;
revoke all on function private.package_cutover_row_guard() from public,anon,authenticated,service_role;
do $$ declare t text; begin
  foreach t in array array['events','booth_runs','booth_grants','booth_handoffs','guest_sessions','captures',
    'print_attempts','print_attempt_events','operation_receipts','activity_events','additional_print_entries',
    'film_stock_entries','film_stock_balance'] loop
    execute pg_catalog.format('create trigger package_cutover_row_guard before insert or update or delete on public.%I for each row execute function private.package_cutover_row_guard()',t);
  end loop;
end $$;

create function private.package_booking_edit_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.accounting_version=2 and old.booking_review_original_allowance is not null
    and new.film_package_count is distinct from old.film_package_count then
    new.booking_review_required:=true;
    new.booking_review_proposed_capacity:=new.film_package_count::bigint*10;
  end if;
  return new;
end $$;
revoke all on function private.package_booking_edit_guard() from public,anon,authenticated,service_role;
create trigger package_booking_edit_guard before update of film_package_count on public.events
for each row execute function private.package_booking_edit_guard();

alter function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) rename to package_before_booking_review_admin_operation;
create function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; eid uuid; expected numeric; packages numeric; actor text:='admin:'||p_admin_user_id; replay jsonb; result jsonb;
begin
  if p_operation<>'review_draft_booking' then
    return private.package_before_booking_review_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload);
  end if;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['eventId','expectedRevision','acknowledgedPackages'])
    or p_payload-array['eventId','expectedRevision','acknowledgedPackages']<>'{}'::jsonb
    or jsonb_typeof(p_payload->'eventId')<>'string'
    or jsonb_typeof(p_payload->'expectedRevision')<>'number'
    or jsonb_typeof(p_payload->'acknowledgedPackages')<>'number' then raise exception 'invalid_input'; end if;
  begin eid:=(p_payload->>'eventId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  expected:=(p_payload->>'expectedRevision')::numeric;
  packages:=(p_payload->>'acknowledgedPackages')::numeric;
  if expected<>trunc(expected) or expected not between 1 and 2147483647
    or packages<>trunc(packages) or packages not between 0 and 214748364 then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(jsonb_set(p_payload,'{expectedRevision}',to_jsonb(expected::integer)),
    '{acknowledgedPackages}',to_jsonb(packages::integer));
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=eid for update;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  replay:=private.package_receipt(actor,p_operation_id,p_operation,p_payload,e.revision);
  if replay is not null then return replay; end if;
  if e.id is null or e.accounting_version<>2 or e.state<>'Draft' or e.deleted_at is not null
    or e.booking_review_original_allowance is null
    or exists(select 1 from public.booth_runs where event_id=eid) then raise exception 'invalid_transition'; end if;
  if e.revision<>expected::integer then raise exception 'stale_revision'; end if;
  if e.film_package_count<>packages::integer or e.revision=2147483647 then raise exception 'stale_revision'; end if;
  if not e.booking_review_required then raise exception 'invalid_transition'; end if;
  update public.events set booking_review_required=false,revision=revision+1 where id=eid returning * into e;
  result:=jsonb_build_object('acknowledgedPackages',e.film_package_count,
    'proposedCapacity',e.film_package_count::bigint*10,
    'originalAllowance',e.booking_review_original_allowance,'actor',actor);
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind)
    values(eid,2,actor,'review_draft_booking');
  return private.package_commit_receipt(eid,actor,p_operation_id,p_operation,p_payload,e.revision,result);
end $$;
revoke all on function private.package_before_booking_review_admin_operation(uuid,uuid,text,uuid,jsonb),
  private.package_admin_operation(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) to service_role;
create or replace function public.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$
  select private.package_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload)
$$;
