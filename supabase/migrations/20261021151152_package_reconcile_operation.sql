-- Call only while holding guard, Event, run, then attempt locks.
create function private.package_reconcile_locked(p_attempt_id uuid,p_actor text) returns text
language plpgsql security definer set search_path='' as $$
declare a public.print_attempts%rowtype; next_state text;
begin
  select * into a from public.print_attempts where id=p_attempt_id;
  next_state:=case when a.state='Reserved' and a.dispatch_id is null then 'NotPrinted'
    when a.state in ('Reserved','Dispatching','Accepted') then 'Pending' else a.state end;
  update public.guest_sessions set state='Abandoned',closed_at=clock_timestamp() where id=a.session_id and state='Open';
  if next_state<>a.state then
    update public.print_attempts set state=next_state,resolved_at=case when next_state='NotPrinted' then clock_timestamp() else resolved_at end where id=a.id;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state) values(a.id,2,p_actor,next_state);
  end if;
  return next_state;
end $$;

create function private.package_reconcile(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  a public.print_attempts%rowtype; s public.guest_sessions%rowtype; attempt_id uuid; actor text;
  replay jsonb; result jsonb; next_state text;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['attemptId','reason'])
    or (p_payload-array['attemptId','reason'])<>'{}'
    or jsonb_typeof(p_payload->'attemptId')<>'string'
    or jsonb_typeof(p_payload->'reason')<>'string'
    or length(btrim(p_payload->>'reason')) not between 1 and 500 then raise exception 'invalid_input'; end if;
  begin attempt_id:=(p_payload->>'attemptId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  if attempt_id is null then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(p_payload,'{reason}',to_jsonb(btrim(p_payload->>'reason')));
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'reconcile');
  select * into a from public.print_attempts where id=attempt_id and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  if a.id is null then raise exception 'invalid_transition'; end if;
  select * into s from public.guest_sessions where id=a.session_id for update;
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'reconcile',p_payload,e.revision);
  if replay is not null then return replay; end if;
  next_state:=private.package_reconcile_locked(a.id,actor);
  if next_state<>a.state or s.state='Open' then
    if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
    update public.events set revision=revision+1 where id=e.id returning * into e;
  end if;
  result:=jsonb_build_object('attemptId',a.id,'state',next_state);
  insert into public.activity_events(event_id,attempt_id,accounting_version,actor_scope,operation_kind) values(e.id,a.id,2,actor,'reconcile');
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,'reconcile',p_payload,e.revision,result);
end $$;

create or replace function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_operation='start_session' then return private.package_start_session(p_grant_hash,p_operation,p_operation_id,p_payload); end if;
  if p_operation='record_capture' then return private.package_record_capture(p_grant_hash,p_operation_id,p_payload); end if;
  if p_operation='end_session' then return private.package_end_session(p_grant_hash,p_operation_id,p_payload); end if;
  if p_operation='reserve' then return private.package_reserve(p_grant_hash,p_operation_id,p_payload); end if;
  if p_operation='dispatch' then return private.package_dispatch(p_grant_hash,p_operation_id,p_payload); end if;
  if p_operation='reconcile' then return private.package_reconcile(p_grant_hash,p_operation_id,p_payload); end if;
  return private.package_before_guest_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
end $$;

revoke all on function private.package_reconcile_locked(uuid,text),private.package_reconcile(text,uuid,jsonb),private.package_booth_operation(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_booth_operation(text,text,uuid,jsonb) to service_role;
