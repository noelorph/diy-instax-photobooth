alter function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) rename to package_run_access_guard_operation;
create function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; eid uuid; expected numeric;
begin
  if p_operation='start' then
    perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
    begin eid:=(p_payload->>'eventId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
    perform 1 from private.booth_contract_guard where id for update;
    select * into e from public.events where id=eid for update;
    if e.id is null or e.accounting_version<>2 then raise exception 'operation_unavailable'; end if;
    if not exists(select 1 from public.operation_receipts where accounting_version=2 and actor_scope='admin:'||p_admin_user_id and operation_key=p_operation_id) then
      if jsonb_typeof(p_payload->'expectedRevision')<>'number' then raise exception 'invalid_input'; end if;
      expected:=(p_payload->>'expectedRevision')::numeric;
      if expected<>trunc(expected) or expected not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
      if expected::integer<>e.revision then raise exception 'stale_revision'; end if;
    end if;
  end if;
  return private.package_run_access_guard_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload);
end $$;
create or replace function public.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload) $$;
revoke all on function private.package_run_access_guard_operation(uuid,uuid,text,uuid,jsonb),private.package_admin_operation(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) to service_role;
