create or replace function private.package_admin_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; receipt jsonb;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=p_event_id for update;
  if e.id is null or e.accounting_version<>2 then raise exception 'operation_unavailable'; end if;
  if e.deleted_at is not null then
    select jsonb_build_object('operationId',operation_key,'kind',operation_kind,'committedRevision',committed_revision,'result',result) into receipt
      from public.operation_receipts where accounting_version=2 and event_id=e.id and actor_scope='admin:'||p_admin_user_id and operation_key=p_operation_id;
    return jsonb_build_object('revision',e.revision,'mediaRemovalState',e.media_removal_state,'receipt',receipt);
  end if;
  perform private.package_expire_initial_handoff(p_event_id);
  return private.package_readiness_admin_read(p_admin_user_id,p_admin_session_id,p_event_id,p_operation_id);
end $$;
