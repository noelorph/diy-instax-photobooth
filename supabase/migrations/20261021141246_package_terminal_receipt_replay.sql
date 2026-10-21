create or replace function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; eid uuid; expected numeric; replay jsonb;
begin
  if p_operation in ('start','report_setup_readiness') then
    perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
    begin eid:=(p_payload->>'eventId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
    perform 1 from private.booth_contract_guard where id for update;
    select * into e from public.events where id=eid for update;
    if e.id is null or e.accounting_version<>2 then raise exception 'operation_unavailable'; end if;
    if exists(select 1 from public.operation_receipts where accounting_version=2 and actor_scope='admin:'||p_admin_user_id and operation_key=p_operation_id) then
      replay:=private.package_receipt('admin:'||p_admin_user_id,p_operation_id,p_operation,private.package_normalize_readiness_payload(p_payload),e.revision);
      if replay is not null then return replay; end if;
    end if;
    if p_operation='start' then
      if jsonb_typeof(p_payload->'expectedRevision')<>'number' then raise exception 'invalid_input'; end if;
      expected:=(p_payload->>'expectedRevision')::numeric;
      if expected<>trunc(expected) or expected not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
      if expected::integer<>e.revision then raise exception 'stale_revision'; end if;
    end if;
  end if;
  return private.package_run_access_guard_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload);
end $$;
