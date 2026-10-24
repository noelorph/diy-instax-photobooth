-- Pending legacy media cleanup must finish before v1 redaction RPCs are retired.
create or replace function private.package_cutover_preflight() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare work jsonb; history jsonb; drafts jsonb; active integer;
begin
  if current_user <> 'postgres' then raise insufficient_privilege using message='Owner-only cutover.'; end if;
  select active_creation_version into active from private.booth_contract_guard where id;
  select jsonb_build_object(
    'unresolvedAttempts', count(*) filter(where accounting_version=1 and state in ('Reserved','Accepted','Uncertain')),
    'unfinishedRuns', (select count(*) from public.booth_runs where accounting_version=1 and state<>'Ended'),
    'liveEvents', (select count(*) from public.events where accounting_version=1 and state='Live'),
    'pendingMediaCleanup', (select count(*) from public.events where accounting_version=1 and media_removal_state='pending')
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
    and (work->>'pendingMediaCleanup')::bigint=0
    and (drafts->>'requiresCorrection')::bigint=0 and (drafts->>'startedDrafts')::bigint=0,
    'activeCreationVersion',active,'blockingLegacyWork',work,'immutableHistory',history,'drafts',drafts);
end $$;
revoke all on function private.package_cutover_preflight() from public,anon,authenticated,service_role;
