-- A confirmed handoff is no longer a current handoff after Admin pauses an
-- active run. The grant remains available for device observation while Paused.
create or replace function private.package_pause_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.accounting_version=2 and old.state='Prepared' and new.state='Paused' then
    update public.booth_grants set state='Revoked',revoked_at=clock_timestamp() where run_id=new.id and state='Inactive';
    update public.booth_handoffs set state='Failed' where run_id=new.id and state in ('Prepared','Issued');
  elsif new.accounting_version=2 and old.state='Active' and new.state='Paused' then
    update public.booth_handoffs set state='Failed' where run_id=new.id and state='Confirmed';
  end if;
  return new;
end $$;

create or replace function private.package_issue_handoff(p_handoff_id uuid,p_device_hash text,p_operation_id uuid,p_grant_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.booth_handoffs%rowtype; g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
begin
  if p_handoff_id is null or p_operation_id is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' or p_grant_hash is null or p_grant_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into h from public.booth_handoffs where id=p_handoff_id;
  if h.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=h.event_id for update;
  select * into r from public.booth_runs where id=h.run_id and event_id=e.id for update;
  select * into g from public.booth_grants where id=h.grant_id for update;
  select * into h from public.booth_handoffs where id=p_handoff_id for update;
  if e.state<>'Live' or r.id is null or h.state not in ('Prepared','Issued','Confirmed') or h.expires_at<=clock_timestamp()
    or h.device_token_hash is distinct from p_device_hash or g.device_hash is distinct from p_device_hash
    or g.revoked_at is not null or g.state not in ('Inactive','Active')
    or (h.purpose='initial' and r.state not in ('Prepared','Active'))
    or (h.purpose='recovery' and r.state not in ('Paused','Active'))
    or exists(select 1 from auth.sessions where id=h.admin_session_id) then raise exception 'access_required'; end if;
  return private.package_issue_handoff_core(p_handoff_id,p_device_hash,p_operation_id,p_grant_hash);
end $$;
