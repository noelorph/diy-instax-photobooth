alter function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) rename to package_terminal_replay_admin_operation;
create function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.operation_receipts%rowtype; e public.events%rowtype;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  perform 1 from private.booth_contract_guard where id for update;
  select * into r from public.operation_receipts where accounting_version=2 and actor_scope='admin:'||p_admin_user_id and operation_key=p_operation_id;
  if r.id is not null then
    select * into e from public.events where id=r.event_id for update;
    if r.operation_kind is distinct from p_operation then raise exception 'operation_conflict'; end if;
    if p_operation in ('start','pause','resume','finish','complete','cancel','recover_access','begin_delete_draft','complete_delete_draft') then
      return private.package_receipt('admin:'||p_admin_user_id,p_operation_id,p_operation,private.package_normalize_readiness_payload(p_payload),e.revision);
    end if;
  end if;
  return private.package_terminal_replay_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload);
end $$;
create or replace function public.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload) $$;
revoke all on function private.package_terminal_replay_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_admin_operation(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) to service_role;
