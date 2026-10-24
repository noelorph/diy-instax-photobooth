-- Pause preserves a valid confirmed grant and its immutable confirmation
-- receipt. A Prepared run paused before confirmation still loses its proof.
create or replace function private.package_pause_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.accounting_version=2 and old.state='Prepared' and new.state='Paused' then
    update public.booth_grants set state='Revoked',revoked_at=clock_timestamp() where run_id=new.id and state='Inactive';
    update public.booth_handoffs set state='Failed' where run_id=new.id and state in ('Prepared','Issued');
  end if;
  return new;
end $$;

create or replace function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype; h public.booth_handoffs%rowtype; handoff_id uuid; checked_at timestamptz;
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
    checked_at:=clock_timestamp();
    if e.state<>'Live' or r.id is null or r.event_id<>e.id or r.device_hash is distinct from g.device_hash
      or g.state not in ('Inactive','Active') or g.revoked_at is not null or g.expires_at<=checked_at
      or h.id is null or h.state not in ('Issued','Confirmed')
      or (h.state='Issued' and h.expires_at<=checked_at)
      or (h.state='Confirmed' and (g.state<>'Active' or g.last_seen_at<=checked_at-interval '24 hours'))
      or h.device_token_hash is distinct from p_payload->>'deviceHash' or g.device_hash is distinct from p_payload->>'deviceHash'
      or (h.purpose='initial' and r.state not in ('Prepared','Active','Paused'))
      or (h.purpose='initial' and r.state='Paused' and h.state<>'Confirmed')
      or (h.purpose='recovery' and r.state not in ('Paused','Active')) then raise exception 'access_required'; end if;
  end if;
  return private.package_run_access_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
end $$;
