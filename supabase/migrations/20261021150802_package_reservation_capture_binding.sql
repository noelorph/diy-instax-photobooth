create or replace function private.package_reserve(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  s public.guest_sessions%rowtype; c public.captures%rowtype; session_id uuid; capture_id uuid;
  attempt_id uuid; actor text; replay jsonb; result jsonb; expected numeric;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['sessionId','captureId','expectedRevision'])
    or (p_payload-array['sessionId','captureId','expectedRevision'])<>'{}'
    or jsonb_typeof(p_payload->'sessionId')<>'string'
    or jsonb_typeof(p_payload->'captureId')<>'string'
    or jsonb_typeof(p_payload->'expectedRevision')<>'number' then raise exception 'invalid_input'; end if;
  begin session_id:=(p_payload->>'sessionId')::uuid; capture_id:=(p_payload->>'captureId')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_input'; end;
  expected:=(p_payload->>'expectedRevision')::numeric;
  if session_id is null or capture_id is null or expected<>trunc(expected) or expected not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(p_payload,'{expectedRevision}',to_jsonb(expected::integer));
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'reserve');
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'reserve',p_payload,e.revision);
  if replay is not null then return replay; end if;
  if expected::integer<>e.revision then raise exception 'stale_revision'; end if;
  select * into s from public.guest_sessions where id=session_id and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  if s.id is null or s.state<>'Open' then raise exception 'invalid_transition'; end if;
  select * into c from public.captures where id=capture_id and session_id=s.id and run_id=r.id and accounting_version=2;
  if c.id is null or c.id is distinct from (select id from public.captures where public.captures.session_id=s.id and accounting_version=2 order by created_at desc,id desc limit 1) then raise exception 'invalid_transition'; end if;
  if not (private.package_readiness(e.id,'reserve')->>'ready')::boolean then raise exception 'not_ready'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id,printer_id,connection_generation)
    values(e.id,r.id,s.id,c.id,2,'Guest','Reserved',p_operation_id,gen_random_uuid(),r.printer_id,r.connection_generation) returning id into attempt_id;
  insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state) values(attempt_id,2,actor,'Reserved');
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('attemptId',attempt_id,'state','Reserved');
  insert into public.activity_events(event_id,attempt_id,accounting_version,actor_scope,operation_kind) values(e.id,attempt_id,2,actor,'reserve');
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,'reserve',p_payload,e.revision,result);
end $$;

