alter table public.guest_sessions add column grant_id uuid references public.booth_grants(id);

create or replace function private.package_start_session(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  actor text; replay jsonb; result jsonb; session_id uuid;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'session');
  actor:='booth:'||g.id;
  if p_operation='start_session' then
    if not (p_payload ?& array['expectedRevision']) or (p_payload-array['expectedRevision'])<>'{}'
      or jsonb_typeof(p_payload->'expectedRevision')<>'number'
      or (p_payload->>'expectedRevision')::numeric<>trunc((p_payload->>'expectedRevision')::numeric)
      or (p_payload->>'expectedRevision')::numeric not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
    p_payload:=jsonb_set(p_payload,'{expectedRevision}',to_jsonb((p_payload->>'expectedRevision')::numeric::integer));
  else raise exception 'operation_forbidden'; end if;
  replay:=private.package_receipt(actor,p_operation_id,p_operation,p_payload,e.revision);
  if replay is not null then return replay; end if;
  if (p_payload->>'expectedRevision')::integer<>e.revision then raise exception 'stale_revision'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  if not (private.package_readiness(e.id,'guest')->>'ready')::boolean then raise exception 'not_ready'; end if;
  insert into public.guest_sessions(event_id,run_id,accounting_version,grant_id) values(e.id,r.id,2,g.id) returning id into session_id;
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('sessionId',session_id);
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(e.id,2,actor,p_operation);
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,p_operation,p_payload,e.revision,result);
end $$;

create or replace function private.package_record_capture(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  s public.guest_sessions%rowtype; existing public.captures%rowtype; session_id uuid; capture_id uuid;
  captured timestamptz; actor text; replay jsonb; result jsonb; checked_at timestamptz; late boolean;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['sessionId','captureId','capturedAt'])
    or (p_payload-array['sessionId','captureId','capturedAt'])<>'{}'
    or jsonb_typeof(p_payload->'sessionId')<>'string'
    or jsonb_typeof(p_payload->'captureId')<>'string'
    or jsonb_typeof(p_payload->'capturedAt')<>'string' then raise exception 'invalid_input'; end if;
  begin
    session_id:=(p_payload->>'sessionId')::uuid;
    capture_id:=(p_payload->>'captureId')::uuid;
    captured:=(p_payload->>'capturedAt')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'invalid_input'; end;
  if session_id is null or capture_id is null or captured is null or not isfinite(captured) then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  select * into s from public.guest_sessions where id=session_id and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  checked_at:=clock_timestamp();
  if s.id is null or s.grant_id is distinct from g.id then raise exception 'invalid_transition'; end if;
  late:=g.accounting_version=2 and g.expires_at>checked_at and g.last_seen_at>checked_at-interval '24 hours'
    and coalesce('capture'=any(g.capabilities),false) and e.state='Live'
    and (g.state='Revoked' or r.state='Finished') and s.state<>'Open'
    and s.closed_at between checked_at-interval '2 minutes' and checked_at and captured<=s.closed_at;
  if not late then g:=private.package_require_booth(p_grant_hash,'capture'); end if;
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'record_capture',p_payload,e.revision);
  if replay is not null then return replay; end if;
  if not late and (r.state not in ('Active','Paused','Finishing') or captured>checked_at
    or (s.state<>'Open' and (s.closed_at is null or captured>s.closed_at))) then raise exception 'invalid_transition'; end if;
  select * into existing from public.captures where id=capture_id or run_id=r.id and shutter_operation_id=p_operation_id;
  if existing.id is not null then raise exception 'operation_conflict'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  insert into public.captures(id,event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id)
    values(capture_id,e.id,r.id,s.id,2,captured,p_operation_id);
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('captureId',capture_id,'sessionId',session_id);
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(e.id,2,actor,'record_capture');
  if not late then update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id; end if;
  return private.package_commit_receipt(e.id,actor,p_operation_id,'record_capture',p_payload,e.revision,result);
end $$;

