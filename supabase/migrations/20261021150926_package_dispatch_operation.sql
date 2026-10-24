create function private.package_dispatch(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  a public.print_attempts%rowtype; attempt_id uuid; v_dispatch_id uuid; actor text; replay jsonb;
  result jsonb; expected numeric; generation numeric;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['attemptId','printerId','connectionGeneration','expectedRevision'])
    or (p_payload-array['attemptId','printerId','connectionGeneration','expectedRevision'])<>'{}'
    or jsonb_typeof(p_payload->'attemptId')<>'string'
    or jsonb_typeof(p_payload->'printerId')<>'string'
    or length(p_payload->>'printerId') not between 1 and 128
    or p_payload->>'printerId' !~ '[^[:space:]]'
    or jsonb_typeof(p_payload->'connectionGeneration')<>'number'
    or jsonb_typeof(p_payload->'expectedRevision')<>'number' then raise exception 'invalid_input'; end if;
  begin attempt_id:=(p_payload->>'attemptId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  expected:=(p_payload->>'expectedRevision')::numeric;
  generation:=(p_payload->>'connectionGeneration')::numeric;
  if attempt_id is null or expected<>trunc(expected) or expected not between 1 and 2147483647
    or generation<>trunc(generation) or generation not between 0 and 2147483647 then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(jsonb_set(p_payload,'{expectedRevision}',to_jsonb(expected::integer)),'{connectionGeneration}',to_jsonb(generation::integer));
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'dispatch');
  select * into a from public.print_attempts where id=attempt_id and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  if a.id is null then raise exception 'invalid_transition'; end if;
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'dispatch',p_payload,e.revision);
  if replay is not null then return replay||jsonb_build_object('sendAllowed',false); end if;
  if expected::integer<>e.revision then raise exception 'stale_revision'; end if;
  if a.state<>'Reserved' or a.dispatch_id is not null or a.printer_id is distinct from p_payload->>'printerId'
    or a.connection_generation is distinct from generation::integer
    or r.printer_id is distinct from p_payload->>'printerId' or r.connection_generation<>generation::integer
    or a.capture_id is distinct from (select c.id from public.captures c where c.session_id=a.session_id and c.accounting_version=2 order by c.created_at desc,c.id desc limit 1) then raise exception 'invalid_transition'; end if;
  if not (private.package_readiness(e.id,'dispatch',a.id)->>'ready')::boolean then raise exception 'not_ready'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  v_dispatch_id:=gen_random_uuid();
  update public.print_attempts set state='Dispatching',dispatch_id=v_dispatch_id,dispatched_at=clock_timestamp() where id=a.id;
  insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state) values(a.id,2,actor,'Dispatching');
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('attemptId',a.id,'state','Dispatching','dispatchId',v_dispatch_id);
  insert into public.activity_events(event_id,attempt_id,accounting_version,actor_scope,operation_kind) values(e.id,a.id,2,actor,'dispatch');
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,'dispatch',p_payload,e.revision,result)
    ||jsonb_build_object('sendAllowed',true,'authorization',jsonb_build_object('attemptId',a.id,'dispatchId',v_dispatch_id,'printerId',r.printer_id,'connectionGeneration',r.connection_generation));
end $$;

create or replace function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_operation='start_session' then return private.package_start_session(p_grant_hash,p_operation,p_operation_id,p_payload); end if;
  if p_operation='record_capture' then return private.package_record_capture(p_grant_hash,p_operation_id,p_payload); end if;
  if p_operation='reserve' then return private.package_reserve(p_grant_hash,p_operation_id,p_payload); end if;
  if p_operation='dispatch' then return private.package_dispatch(p_grant_hash,p_operation_id,p_payload); end if;
  return private.package_before_guest_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
end $$;

revoke all on function private.package_dispatch(text,uuid,jsonb),private.package_booth_operation(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_booth_operation(text,text,uuid,jsonb) to service_role;
