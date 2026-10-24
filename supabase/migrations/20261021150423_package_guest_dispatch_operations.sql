alter function private.package_booth_operation(text,text,uuid,jsonb) rename to package_before_guest_booth_operation;

create function private.package_guest_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
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
  insert into public.guest_sessions(event_id,run_id,accounting_version) values(e.id,r.id,2) returning id into session_id;
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('sessionId',session_id);
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(e.id,2,actor,p_operation);
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,p_operation,p_payload,e.revision,result);
end $$;

create function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_operation='start_session' then
    return private.package_guest_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
  end if;
  return private.package_before_guest_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
end $$;

revoke all on function private.package_before_guest_booth_operation(text,text,uuid,jsonb),private.package_guest_operation(text,text,uuid,jsonb),private.package_booth_operation(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_booth_operation(text,text,uuid,jsonb) to service_role;
