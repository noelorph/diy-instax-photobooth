create function private.package_end_session(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  s public.guest_sessions%rowtype; session_id uuid; actor text; replay jsonb; result jsonb;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['sessionId','reason'])
    or (p_payload-array['sessionId','reason'])<>'{}'
    or jsonb_typeof(p_payload->'sessionId')<>'string'
    or jsonb_typeof(p_payload->'reason')<>'string'
    or length(btrim(p_payload->>'reason')) not between 1 and 500 then raise exception 'invalid_input'; end if;
  begin session_id:=(p_payload->>'sessionId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  if session_id is null then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(p_payload,'{reason}',to_jsonb(btrim(p_payload->>'reason')));
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'session');
  select * into s from public.guest_sessions where id=session_id and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  if s.id is null then raise exception 'invalid_transition'; end if;
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'end_session',p_payload,e.revision);
  if replay is not null then return replay; end if;
  if s.state='Open' then
    if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
    update public.guest_sessions set state='Abandoned',closed_at=clock_timestamp() where id=s.id;
    update public.events set revision=revision+1 where id=e.id returning * into e;
  end if;
  result:=jsonb_build_object('sessionId',s.id,'state','Ended');
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(e.id,2,actor,'end_session');
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,'end_session',p_payload,e.revision,result);
end $$;

create or replace function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_operation='start_session' then return private.package_start_session(p_grant_hash,p_operation,p_operation_id,p_payload); end if;
  if p_operation='record_capture' then return private.package_record_capture(p_grant_hash,p_operation_id,p_payload); end if;
  if p_operation='end_session' then return private.package_end_session(p_grant_hash,p_operation_id,p_payload); end if;
  if p_operation='reserve' then return private.package_reserve(p_grant_hash,p_operation_id,p_payload); end if;
  if p_operation='dispatch' then return private.package_dispatch(p_grant_hash,p_operation_id,p_payload); end if;
  return private.package_before_guest_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
end $$;

revoke all on function private.package_end_session(text,uuid,jsonb),private.package_booth_operation(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_booth_operation(text,text,uuid,jsonb) to service_role;
