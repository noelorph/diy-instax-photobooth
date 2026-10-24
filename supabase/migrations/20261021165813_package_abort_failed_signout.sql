-- The trusted handler calls this only when local sign-out reports failure.
-- It must be safe whether the Admin session was revoked or remained live.
create function private.package_fail_handoff(p_handoff_id uuid,p_device_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.booth_handoffs%rowtype; r public.booth_runs%rowtype; e public.events%rowtype; g public.booth_grants%rowtype;
begin
  if p_handoff_id is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into h from public.booth_handoffs where id=p_handoff_id;
  if h.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=h.event_id for update;
  select * into r from public.booth_runs where id=h.run_id and event_id=e.id for update;
  select * into g from public.booth_grants where id=h.grant_id for update;
  select * into h from public.booth_handoffs where id=h.id for update;
  if e.state<>'Live' or r.id is null or h.state not in ('Prepared','Issued')
    or h.device_token_hash is distinct from p_device_hash or g.device_hash is distinct from p_device_hash
    or (h.purpose='initial' and r.state<>'Prepared')
    or (h.purpose='recovery' and r.state<>'Paused') then raise exception 'access_required'; end if;
  if r.state='Prepared' then
    update public.booth_runs set state='Paused',revision=revision+1 where id=r.id;
  end if;
  update public.booth_grants set state='Revoked',revoked_at=clock_timestamp() where id=g.id and state<>'Revoked';
  update public.booth_handoffs set state='Failed' where id=h.id;
  update public.events set revision=revision+1 where id=e.id and revision<2147483647;
  if not found then raise exception 'operation_unavailable'; end if;
  return jsonb_build_object('state','Paused');
end $$;

create function public.package_fail_handoff(p_handoff_id uuid,p_device_hash text) returns jsonb
language sql security invoker set search_path='' as $$
  select private.package_fail_handoff(p_handoff_id,p_device_hash)
$$;
revoke all on function private.package_fail_handoff(uuid,text), public.package_fail_handoff(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.package_fail_handoff(uuid,text), public.package_fail_handoff(uuid,text) to service_role;
