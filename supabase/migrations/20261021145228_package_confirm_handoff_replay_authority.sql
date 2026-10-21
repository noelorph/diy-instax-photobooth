-- Confirmation receipts are useful for retries while the handoff is current,
-- but cannot restore proof after Admin has paused or finished the run.
alter function private.package_booth_operation(text,text,uuid,jsonb) rename to package_run_access_booth_operation;
create function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype; h public.booth_handoffs%rowtype; handoff_id uuid;
begin
  if p_operation='confirm_handoff' then
    if jsonb_typeof(p_payload->'handoffId')<>'string' then raise exception 'invalid_input'; end if;
    begin handoff_id:=(p_payload->>'handoffId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
    perform 1 from private.booth_contract_guard where id for update;
    select * into g from public.booth_grants where secret_hash=p_grant_hash;
    if g.id is null then raise exception 'access_required'; end if;
    select * into e from public.events where id=g.event_id for update;
    select * into r from public.booth_runs where id=g.run_id for update;
    select * into g from public.booth_grants where id=g.id for update;
    select * into h from public.booth_handoffs where id=handoff_id and grant_id=g.id for update;
    if e.state<>'Live' or r.id is null or g.state not in ('Inactive','Active') or g.revoked_at is not null
      or g.expires_at<=clock_timestamp() or h.id is null or h.state not in ('Issued','Confirmed') or h.expires_at<=clock_timestamp()
      or h.device_token_hash is distinct from p_payload->>'deviceHash' or g.device_hash is distinct from p_payload->>'deviceHash'
      or (h.purpose='initial' and r.state not in ('Prepared','Active'))
      or (h.purpose='recovery' and r.state not in ('Paused','Active')) then raise exception 'access_required'; end if;
  end if;
  return private.package_run_access_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
end $$;
revoke all on function private.package_run_access_booth_operation(text,text,uuid,jsonb),private.package_booth_operation(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_booth_operation(text,text,uuid,jsonb) to service_role;
