-- Nullable legacy metadata must not weaken the v2 record contract.
alter table public.captures add constraint captures_v2_shutter_operation_check
  check(accounting_version=1 or shutter_operation_id is not null);
alter table public.operation_receipts add constraint operation_receipts_v2_revision_check
  check(accounting_version=1 or committed_revision is not null);

-- NULL array elements must never grant an absent capability.
create or replace function private.package_require_booth(p_grant_hash text,p_capability text default 'read')
returns public.booth_grants language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype;
begin
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if not found or g.accounting_version<>2 or g.state<>'Active' or g.revoked_at is not null
    or g.expires_at<=statement_timestamp() or g.last_seen_at<=statement_timestamp()-interval '24 hours'
    or g.device_hash is null or not exists(select 1 from public.booth_runs r join public.events e on e.id=r.event_id
      where r.id=g.run_id and r.event_id=g.event_id and r.accounting_version=2 and e.accounting_version=2
        and r.device_hash=g.device_hash and r.state in ('Active','Paused','Finishing') and e.state='Live') then
    raise exception 'access_required' using errcode='42501';
  end if;
  if p_capability is null or not coalesce(p_capability=any(g.capabilities),false) then
    raise exception 'operation_forbidden' using errcode='42501';
  end if;
  return g;
end;
$$;
revoke all on function private.package_require_booth(text,text) from public,anon,authenticated,service_role;
