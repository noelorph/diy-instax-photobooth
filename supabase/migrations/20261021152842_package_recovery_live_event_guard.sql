create or replace function private.package_recover_attempt(p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; r public.booth_runs%rowtype; a public.print_attempts%rowtype;
  s public.guest_sessions%rowtype; eid uuid; attempt_id uuid; actor text; replay jsonb;
  expected numeric; next_state text; result jsonb;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['eventId','attemptId','reason','expectedRevision'])
    or (p_payload-array['eventId','attemptId','reason','expectedRevision'])<>'{}'
    or jsonb_typeof(p_payload->'eventId')<>'string'
    or jsonb_typeof(p_payload->'attemptId')<>'string'
    or jsonb_typeof(p_payload->'reason')<>'string'
    or length(btrim(p_payload->>'reason')) not between 1 and 500
    or jsonb_typeof(p_payload->'expectedRevision')<>'number' then raise exception 'invalid_input'; end if;
  begin eid:=(p_payload->>'eventId')::uuid; attempt_id:=(p_payload->>'attemptId')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_input'; end;
  expected:=(p_payload->>'expectedRevision')::numeric;
  if eid is null or attempt_id is null or expected<>trunc(expected) or expected not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(jsonb_set(p_payload,'{reason}',to_jsonb(btrim(p_payload->>'reason'))),'{expectedRevision}',to_jsonb(expected::integer));
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=eid for update;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if e.id is null or e.accounting_version<>2 then raise exception 'operation_unavailable'; end if;
  actor:='admin:'||p_admin_user_id;
  replay:=private.package_receipt(actor,p_operation_id,'recover_attempt',p_payload,e.revision);
  if replay is not null then return replay; end if;
  if e.state<>'Live' then raise exception 'invalid_transition'; end if;
  if expected::integer<>e.revision then raise exception 'stale_revision'; end if;
  select * into a from public.print_attempts where id=attempt_id and event_id=e.id and accounting_version=2;
  if a.id is null then raise exception 'invalid_transition'; end if;
  select * into r from public.booth_runs where id=a.run_id and event_id=e.id and accounting_version=2 for update;
  select * into a from public.print_attempts where id=attempt_id and event_id=e.id and accounting_version=2 for update;
  select * into s from public.guest_sessions where id=a.session_id for update;
  next_state:=private.package_reconcile_locked(a.id,actor);
  if next_state<>a.state or s.state='Open' then
    if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
    update public.events set revision=revision+1 where id=e.id returning * into e;
  end if;
  result:=jsonb_build_object('attemptId',a.id,'state',next_state);
  insert into public.activity_events(event_id,attempt_id,accounting_version,actor_scope,operation_kind) values(e.id,a.id,2,actor,'recover_attempt');
  return private.package_commit_receipt(e.id,actor,p_operation_id,'recover_attempt',p_payload,e.revision,result);
end $$;

