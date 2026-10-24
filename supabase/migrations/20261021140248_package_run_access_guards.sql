alter table private.package_readiness_windows add column consumed_at timestamptz;

-- A failed initial receipt cannot remain Prepared indefinitely.
create function private.package_expire_initial_handoff(p_event uuid) returns void
language plpgsql set search_path='' as $$
declare h public.booth_handoffs%rowtype; r public.booth_runs%rowtype;
begin
  select * into h from public.booth_handoffs where event_id=p_event and purpose='initial' and state in ('Prepared','Issued') and expires_at<=clock_timestamp() order by created_at desc limit 1;
  if h.id is null then return; end if;
  select * into r from public.booth_runs where id=h.run_id for update;
  select * into h from public.booth_handoffs where id=h.id for update;
  if r.state='Prepared' then
    update public.booth_runs set state='Paused',revision=revision+1 where id=r.id;
    update public.events set revision=revision+1 where id=p_event and revision<2147483647;
    if not found then raise exception 'operation_unavailable'; end if;
  end if;
  update public.booth_grants set state='Revoked',revoked_at=clock_timestamp() where id=h.grant_id and state<>'Revoked';
  update public.booth_handoffs set state='Failed' where id=h.id;
end $$;

alter function private.package_admin_read(uuid,uuid,uuid,uuid) rename to package_readiness_admin_read;
create function private.package_admin_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  perform 1 from private.booth_contract_guard where id for update;
  perform 1 from public.events where id=p_event_id for update;
  perform private.package_expire_initial_handoff(p_event_id);
  return private.package_readiness_admin_read(p_admin_user_id,p_admin_session_id,p_event_id,p_operation_id);
end $$;

alter function private.package_setup_read(uuid,uuid,uuid,text,text,integer) rename to package_readiness_setup_read;
create function private.package_setup_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_device_hash text,p_printer_id text,p_connection_generation integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=p_event_id for update;
  if e.id is null or e.accounting_version<>2 or e.deleted_at is not null then raise exception 'operation_unavailable'; end if;
  if e.state not in ('Draft','Live') then raise exception 'invalid_transition'; end if;
  return private.package_readiness_setup_read(p_admin_user_id,p_admin_session_id,p_event_id,p_device_hash,p_printer_id,p_connection_generation);
end $$;

alter function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) rename to package_lifecycle_admin_operation;
create function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; w private.package_readiness_windows%rowtype; result jsonb; eid uuid; wid uuid;
begin
  if p_operation not in ('start','report_setup_readiness') then
    return private.package_lifecycle_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload);
  end if;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  begin eid:=(p_payload->>'eventId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  if eid is null then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=eid for update;
  if e.id is null or e.accounting_version<>2 or e.deleted_at is not null then raise exception 'operation_unavailable'; end if;
  if e.state not in ('Draft','Live') then raise exception 'invalid_transition'; end if;
  if p_operation='start' then
    begin wid:=(p_payload->>'readinessWindowId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
    select * into w from private.package_readiness_windows where id=wid for update;
    if w.consumed_at is not null and not exists(select 1 from public.operation_receipts where accounting_version=2 and actor_scope='admin:'||p_admin_user_id and operation_key=p_operation_id) then raise exception 'not_ready'; end if;
  end if;
  result:=private.package_lifecycle_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload);
  if p_operation='start' and result->>'replayed'='false' then
    update private.package_readiness_windows set consumed_at=clock_timestamp() where id=wid;
  end if;
  return result;
end $$;

create function private.package_pause_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.accounting_version=2 and old.state='Prepared' and new.state='Paused' then
    update public.booth_grants set state='Revoked',revoked_at=clock_timestamp() where run_id=new.id and state='Inactive';
    update public.booth_handoffs set state='Failed' where run_id=new.id and state in ('Prepared','Issued');
  end if;
  return new;
end $$;
create trigger package_pause_cleanup after update of state on public.booth_runs for each row execute function private.package_pause_cleanup();

create or replace function public.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload) $$;
create or replace function public.package_admin_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_operation_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_admin_read(p_admin_user_id,p_admin_session_id,p_event_id,p_operation_id) $$;
create or replace function public.package_setup_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_device_hash text,p_printer_id text,p_connection_generation integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_setup_read(p_admin_user_id,p_admin_session_id,p_event_id,p_device_hash,p_printer_id,p_connection_generation) $$;
revoke all on function private.package_expire_initial_handoff(uuid),private.package_readiness_admin_read(uuid,uuid,uuid,uuid),private.package_admin_read(uuid,uuid,uuid,uuid),private.package_readiness_setup_read(uuid,uuid,uuid,text,text,integer),private.package_setup_read(uuid,uuid,uuid,text,text,integer),private.package_lifecycle_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_pause_cleanup() from public,anon,authenticated,service_role;
grant execute on function private.package_admin_read(uuid,uuid,uuid,uuid),private.package_setup_read(uuid,uuid,uuid,text,text,integer),private.package_admin_operation(uuid,uuid,text,uuid,jsonb) to service_role;
