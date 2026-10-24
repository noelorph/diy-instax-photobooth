-- A session can expire while a statement waits on the package guard. Compare
-- against wall time when authority is checked, not the statement start time.
create or replace function private.package_require_admin(p_admin_user_id uuid,p_admin_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id
    where p.id=p_admin_user_id and s.id=p_admin_session_id and (s.not_after is null or s.not_after>clock_timestamp())) then
    raise exception 'access_required' using errcode='42501';
  end if;
end $$;

-- Receipt replay and deleted Draft receipt reads must recheck after the locks.
create or replace function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.operation_receipts%rowtype; e public.events%rowtype; result jsonb;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  perform 1 from private.booth_contract_guard where id for update;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  select * into r from public.operation_receipts where accounting_version=2 and actor_scope='admin:'||p_admin_user_id and operation_key=p_operation_id;
  if r.id is not null then
    select * into e from public.events where id=r.event_id for update;
    perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
    if r.operation_kind is distinct from p_operation then raise exception 'operation_conflict'; end if;
    if p_operation in ('start','pause','resume','finish','complete','cancel','recover_access','begin_delete_draft','complete_delete_draft') then
      return private.package_receipt('admin:'||p_admin_user_id,p_operation_id,p_operation,private.package_normalize_readiness_payload(p_payload),e.revision);
    end if;
  end if;
  result:=private.package_terminal_replay_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload);
  if p_operation='finish' and result->>'replayed'='false' then
    insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind)
      values((p_payload->>'eventId')::uuid,2,'admin:'||p_admin_user_id,'finish');
  end if;
  return result;
end $$;

create or replace function private.package_admin_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; receipt jsonb;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=p_event_id for update;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if e.id is null or e.accounting_version<>2 then raise exception 'operation_unavailable'; end if;
  if e.deleted_at is not null then
    select jsonb_build_object('operationId',operation_key,'kind',operation_kind,'committedRevision',committed_revision,'result',result) into receipt
      from public.operation_receipts where accounting_version=2 and event_id=e.id and actor_scope='admin:'||p_admin_user_id and operation_key=p_operation_id;
    return jsonb_build_object('revision',e.revision,'mediaRemovalState',e.media_removal_state,'receipt',receipt);
  end if;
  perform private.package_expire_initial_handoff(p_event_id);
  return private.package_readiness_admin_read(p_admin_user_id,p_admin_session_id,p_event_id,p_operation_id);
end $$;
