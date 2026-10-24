-- A local sign-out failure is a committed failed handoff, not an exception that
-- rolls back the required Paused state. Device binding is checked first.
create or replace function private.package_issue_handoff(p_handoff_id uuid,p_device_hash text,p_operation_id uuid,p_grant_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.booth_handoffs%rowtype; g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
begin
  if p_handoff_id is null or p_operation_id is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$'
    or p_grant_hash is null or p_grant_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into h from public.booth_handoffs where id=p_handoff_id;
  if h.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=h.event_id for update;
  select * into r from public.booth_runs where id=h.run_id and event_id=e.id for update;
  select * into g from public.booth_grants where id=h.grant_id for update;
  select * into h from public.booth_handoffs where id=p_handoff_id for update;
  if e.state<>'Live' or r.id is null or h.state<>'Prepared' or h.expires_at<=clock_timestamp()
    or h.device_token_hash is distinct from p_device_hash or g.device_hash is distinct from p_device_hash
    or g.revoked_at is not null or g.state<>'Inactive'
    or (h.purpose='initial' and r.state<>'Prepared')
    or (h.purpose='recovery' and r.state<>'Paused') then
    -- Already issued handoffs retain the post-issue replay authority checks.
    if h.state in ('Issued','Confirmed') then
      if e.state<>'Live' or r.id is null or h.expires_at<=clock_timestamp()
        or h.device_token_hash is distinct from p_device_hash or g.device_hash is distinct from p_device_hash
        or g.revoked_at is not null or g.state not in ('Inactive','Active')
        or (h.purpose='initial' and r.state not in ('Prepared','Active'))
        or (h.purpose='recovery' and r.state not in ('Paused','Active'))
        or exists(select 1 from auth.sessions where id=h.admin_session_id) then raise exception 'access_required'; end if;
      return private.package_issue_handoff_core(p_handoff_id,p_device_hash,p_operation_id,p_grant_hash);
    end if;
    raise exception 'access_required';
  end if;
  if exists(select 1 from auth.sessions where id=h.admin_session_id) then
    if h.purpose='initial' then
      update public.booth_runs set state='Paused',revision=revision+1 where id=r.id;
    else
      update public.booth_grants set state='Revoked',revoked_at=clock_timestamp() where id=g.id;
      update public.booth_handoffs set state='Failed' where id=h.id;
    end if;
    update public.events set revision=revision+1 where id=e.id and revision<2147483647;
    if not found then raise exception 'operation_unavailable'; end if;
    return jsonb_build_object('error','access_required');
  end if;
  return private.package_issue_handoff_core(p_handoff_id,p_device_hash,p_operation_id,p_grant_hash);
end $$;
