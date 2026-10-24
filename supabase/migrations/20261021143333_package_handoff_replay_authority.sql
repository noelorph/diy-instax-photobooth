alter function private.package_issue_handoff(uuid,text,uuid,text) rename to package_issue_handoff_core;
create function private.package_issue_handoff(p_handoff_id uuid,p_device_hash text,p_operation_id uuid,p_grant_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.booth_handoffs%rowtype; g public.booth_grants%rowtype; e public.events%rowtype;
begin
  if p_handoff_id is null or p_operation_id is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' or p_grant_hash is null or p_grant_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into h from public.booth_handoffs where id=p_handoff_id;
  if h.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=h.event_id for update;
  perform 1 from public.booth_runs where id=h.run_id and event_id=e.id for update;
  select * into g from public.booth_grants where id=h.grant_id for update;
  select * into h from public.booth_handoffs where id=p_handoff_id for update;
  if e.state<>'Live' or h.state not in ('Prepared','Issued','Confirmed') or h.expires_at<=clock_timestamp()
    or h.device_token_hash is distinct from p_device_hash or g.device_hash is distinct from p_device_hash
    or g.revoked_at is not null or g.state not in ('Inactive','Active')
    or exists(select 1 from auth.sessions where id=h.admin_session_id) then raise exception 'access_required'; end if;
  return private.package_issue_handoff_core(p_handoff_id,p_device_hash,p_operation_id,p_grant_hash);
end $$;
create or replace function public.package_issue_handoff(p_handoff_id uuid,p_device_hash text,p_operation_id uuid,p_grant_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_issue_handoff(p_handoff_id,p_device_hash,p_operation_id,p_grant_hash) $$;
revoke all on function private.package_issue_handoff_core(uuid,text,uuid,text),private.package_issue_handoff(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.package_issue_handoff(uuid,text,uuid,text) to service_role;
