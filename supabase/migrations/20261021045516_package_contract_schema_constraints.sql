-- Preserve legacy state vocabulary while making v2 states and bindings explicit.
alter table public.booth_runs drop constraint booth_runs_state_check;
alter table public.booth_runs add constraint booth_runs_version_state_check check (
  (accounting_version=1 and state in ('Prepared','Active','PauseRequested','Paused','Ended')) or
  (accounting_version=2 and state in ('Prepared','Active','Paused','Finishing','Finished'))
);
alter table public.booth_runs
  add column device_hash text check (device_hash ~ '^[0-9a-f]{64}$'),
  add column printer_id text check (printer_id ~ '[^[:space:]]'),
  add column connection_generation integer not null default 0 check(connection_generation>=0),
  add column revision integer not null default 1 check(revision>0),
  add column readiness_observation jsonb not null default '{}' check(jsonb_typeof(readiness_observation)='object'),
  add column observed_at timestamptz,
  add column received_at timestamptz,
  add column blockers text[] not null default '{}',
  add column film_loaded_confirmed boolean not null default false,
  add column power_confirmed boolean not null default false,
  add column guided_access_confirmed boolean not null default false,
  add column finish_requested_at timestamptz,
  add column finished_at timestamptz;
drop index public.booth_runs_one_running_idx;
create unique index booth_runs_one_running_idx on public.booth_runs(event_id)
where (accounting_version=1 and state in ('Prepared','Active','PauseRequested'))
   or (accounting_version=2 and state in ('Prepared','Active','Paused','Finishing'));

alter table public.booth_grants
  add column device_hash text check(device_hash ~ '^[0-9a-f]{64}$'),
  add column last_seen_at timestamptz not null default now(),
  add column capabilities text[] not null default array['read','readiness','session','capture','reserve','dispatch','observe','reconcile'];
alter table public.booth_grants add constraint booth_grants_v2_device_check check(accounting_version=1 or (device_hash is not null and secret_hash is null or accounting_version=2 and device_hash is not null and secret_hash ~ '^[0-9a-f]{64}$'));
alter table public.captures add column shutter_operation_id uuid;
create unique index captures_shutter_operation_idx on public.captures(run_id,shutter_operation_id) where accounting_version=2;
alter table public.print_attempts drop constraint print_attempts_state_check;
alter table public.print_attempts add constraint print_attempts_version_state_check check (
  (accounting_version=1 and state in ('Reserved','Accepted','RejectedUnused','Confirmed','Uncertain','AdminResolvedEjected','AdminResolvedUnused','WastedFilm')) or
  (accounting_version=2 and kind='Guest' and state in ('Reserved','Dispatching','Accepted','Pending','Printed','NotPrinted'))
);
alter table public.print_attempts
  add column dispatch_id uuid unique,
  add column printer_id text,
  add column connection_generation integer check(connection_generation>=0),
  add column dispatched_at timestamptz,
  add column evidence_policy_version text;
alter table public.print_attempt_events drop constraint print_attempt_events_state_check;
alter table public.print_attempt_events add constraint print_attempt_events_version_state_check check (
  (accounting_version=1 and state in ('Reserved','Accepted','RejectedUnused','Confirmed','Uncertain','AdminResolvedEjected','AdminResolvedUnused','WastedFilm','Diagnostic')) or
  (accounting_version=2 and state in ('Reserved','Dispatching','Accepted','Pending','Printed','NotPrinted','Diagnostic','Discrepancy'))
);
alter table public.print_attempt_events add column evidence_policy_version text, add column actor_id uuid;
drop index public.print_attempts_one_printer_idx;
create unique index print_attempts_one_printer_idx on public.print_attempts((true))
where state in ('Reserved','Dispatching','Accepted','Pending','Uncertain');
drop index public.print_attempts_one_unresolved_session_idx;
create unique index print_attempts_one_unresolved_session_idx on public.print_attempts(session_id)
where kind='Guest' and state in ('Reserved','Dispatching','Accepted','Pending','Uncertain');
create unique index operation_receipts_v2_actor_key_idx on public.operation_receipts(actor_scope,operation_key) where accounting_version=2;
alter table public.operation_receipts add column committed_revision integer check(committed_revision>0);

create table public.additional_film_package_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  accounting_version integer not null default 2 check(accounting_version=2),
  packages integer not null check(packages>0 and packages<=214748364),
  client_request_note text not null check(client_request_note ~ '[^[:space:]]'),
  actor_id uuid not null,
  operation_key uuid not null,
  created_at timestamptz not null default now(),
  unique(actor_id,operation_key)
);
create index additional_film_package_entries_event_idx on public.additional_film_package_entries(event_id);
create table public.booth_reload_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  run_id uuid not null,
  accounting_version integer not null default 2 check(accounting_version=2),
  printer_id text not null check(printer_id ~ '[^[:space:]]'),
  connection_generation integer not null check(connection_generation>=0),
  trigger text not null check(trigger in ('admin_request','no_film','cover_open','load_change')),
  state text not null default 'Open' check(state in ('Open','Confirmed','Superseded')),
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid,
  confirmation_source text,
  foreign key(run_id,event_id) references public.booth_runs(id,event_id),
  check(state<>'Confirmed' or (confirmed_at is not null and confirmed_by is not null and confirmation_source is not null))
);
create index booth_reload_requests_event_idx on public.booth_reload_requests(event_id);
create index booth_reload_requests_run_idx on public.booth_reload_requests(run_id,event_id);
create unique index booth_reload_requests_one_open_idx on public.booth_reload_requests(run_id) where state='Open';
create table private.package_readiness_windows (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  run_id uuid,
  admin_user_id uuid not null,
  admin_session_id uuid not null,
  device_hash text not null check(device_hash ~ '^[0-9a-f]{64}$'),
  printer_id text not null check(printer_id ~ '[^[:space:]]'),
  connection_generation integer not null check(connection_generation>=0),
  observation jsonb not null check(jsonb_typeof(observation)='object'),
  received_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key(run_id,event_id) references public.booth_runs(id,event_id),
  check(isfinite(expires_at) and expires_at>received_at and expires_at<=received_at+interval '5 seconds')
);
create index package_readiness_windows_event_idx on private.package_readiness_windows(event_id);
create index package_readiness_windows_run_idx on private.package_readiness_windows(run_id,event_id);
alter table private.package_readiness_windows enable row level security;
revoke all on private.package_readiness_windows from public,anon,authenticated,service_role;

-- One-way checks permit converted Drafts to retain immutable v1 terminal audits.
create function private.validate_package_parent() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_event uuid; v_run uuid; v_version integer;
begin
  v_version := coalesce((to_jsonb(new)->>'accounting_version')::integer,2);
  if v_version<>2 then return new; end if;
  if tg_table_name='print_attempt_events' then
    if not exists(select 1 from public.print_attempts a where a.id=new.attempt_id and a.accounting_version=2) then
      raise check_violation using message='Version 2 evidence requires a version 2 attempt.';
    end if;
    return new;
  end if;
  v_event := (to_jsonb(new)->>'event_id')::uuid;
  v_run := (to_jsonb(new)->>'run_id')::uuid;
  if v_event is not null and not exists(select 1 from public.events e where e.id=v_event and e.accounting_version=2) then
    raise check_violation using message='Version 2 records require a version 2 Event.';
  end if;
  if v_run is not null and not exists(select 1 from public.booth_runs r where r.id=v_run and r.event_id=v_event and r.accounting_version=2) then
    raise check_violation using message='Version 2 records require a matching version 2 run.';
  end if;
  if tg_table_name='captures' and not exists(select 1 from public.guest_sessions s where s.id=new.session_id and s.accounting_version=2) then
    raise check_violation using message='Version 2 captures require a version 2 session.';
  end if;
  if tg_table_name='print_attempts' and not exists(select 1 from public.captures c where c.id=new.capture_id and c.accounting_version=2) then
    raise check_violation using message='Version 2 attempts require a version 2 capture.';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_package_parent() from public,anon,authenticated,service_role;
do $$
declare t text;
begin
  foreach t in array array['booth_runs','booth_grants','booth_handoffs','guest_sessions','captures','print_attempts','print_attempt_events','operation_receipts','activity_events','additional_film_package_entries','booth_reload_requests'] loop
    execute format('create trigger package_parent_before_save before insert or update on public.%I for each row execute function private.validate_package_parent()',t);
  end loop;
end;
$$;
create trigger package_parent_before_save before insert or update on private.package_readiness_windows for each row execute function private.validate_package_parent();

-- These narrow checks are called by future private operation implementations.
create function private.package_require_admin(p_admin_user_id uuid,p_admin_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id
    where p.id=p_admin_user_id and s.id=p_admin_session_id and (s.not_after is null or s.not_after>statement_timestamp())) then
    raise exception 'access_required' using errcode='42501';
  end if;
end;
$$;
create function private.package_require_booth(p_grant_hash text,p_capability text default 'read')
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
  if p_capability is null or not (p_capability=any(g.capabilities)) then
    raise exception 'operation_forbidden' using errcode='42501';
  end if;
  return g;
end;
$$;
revoke all on function private.package_require_admin(uuid,uuid), private.package_require_booth(text,text) from public,anon,authenticated,service_role;

-- Supabase inherited/global defaults must not reintroduce application writes.
alter default privileges for role postgres revoke execute on functions from public,anon,authenticated,service_role;
alter default privileges for role postgres in schema public revoke all on tables from public,anon,authenticated,service_role;
alter default privileges for role postgres in schema private revoke all on tables from public,anon,authenticated,service_role;
alter default privileges for role postgres in schema private revoke execute on functions from public,anon,authenticated,service_role;
do $$
declare t text;
begin
  foreach t in array array['booth_runs','booth_grants','booth_handoffs','guest_sessions','captures','print_attempts','print_attempt_events','additional_print_entries','film_stock_entries','film_stock_balance','activity_events','operation_receipts','additional_film_package_entries','booth_reload_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role',t);
    if t not in ('booth_grants','booth_handoffs','operation_receipts') then
      execute format('grant select on public.%I to authenticated',t);
      if t in ('additional_film_package_entries','booth_reload_requests') then
        execute format('create policy operational_admin_read on public.%I for select to authenticated using ((select private.is_active_admin()))',t);
      end if;
    end if;
  end loop;
end;
$$;
revoke all on public.events from service_role;
grant select on public.events to service_role;
-- Replacing table-level INSERT with a column allowlist protects future columns too.
revoke insert on public.events from authenticated;
grant insert(id,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance,revision) on public.events to authenticated;
