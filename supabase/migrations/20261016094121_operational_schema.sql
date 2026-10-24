-- Operational rows contain opaque references and accounting metadata, never photos.
-- Explicit grants are required for all future application tables and functions.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
-- Future exposed RPCs must also explicitly revoke PUBLIC EXECUTE on each function.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

alter table public.events drop constraint events_state_check;
alter table public.events add constraint events_state_check check (state in ('Draft','Live','Completed','Cancelled'));
alter table public.events add column deleted_at timestamptz;
alter table public.events
  alter column title drop not null, alter column client_name drop not null,
  alter column client_email drop not null, alter column client_phone drop not null,
  alter column venue_address drop not null, alter column time_zone drop not null,
  alter column starts_at drop not null, alter column ends_at drop not null;
alter table public.events add constraint events_identity_lifecycle check (
  (deleted_at is null and title is not null and client_name is not null and client_email is not null and client_phone is not null and venue_address is not null and time_zone is not null and starts_at is not null and ends_at is not null)
  or (deleted_at is not null and isfinite(deleted_at) and state = 'Draft' and title is null and client_name is null and client_email is null and client_phone is null and venue_address is null and time_zone is null and starts_at is null and ends_at is null)
);
create unique index events_one_live_idx on public.events ((true)) where state = 'Live';
revoke update (state) on public.events from authenticated;

alter policy events_admin_read on public.events using (deleted_at is null and (select private.is_active_admin()));
alter policy events_admin_create on public.events with check (state = 'Draft' and deleted_at is null and (select private.is_active_admin()));
alter policy events_admin_update on public.events
  using (state = 'Draft' and deleted_at is null and (select private.is_active_admin()))
  with check (state = 'Draft' and deleted_at is null and (select private.is_active_admin()));

create or replace function private.validate_draft_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Preserve the established browser Draft validation and SQLSTATEs.
  if current_user in ('anon', 'authenticated') and new.state <> 'Draft' then
    raise check_violation using message = 'Direct Event writes require Draft state.';
  end if;
  if new.deleted_at is null then
    if new.title is null or new.client_name is null or new.client_email is null or new.client_phone is null or new.venue_address is null or new.time_zone is null or new.starts_at is null or new.ends_at is null then
      raise not_null_violation using message = 'Visible Events require all identifying fields.';
    end if;
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone and name not like 'posix/%' and name not like 'right/%') then
      raise check_violation using message = 'A valid venue time zone is required.';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.revision is distinct from 1 then
      raise check_violation using message = 'A new Event must start at revision 1.';
    end if;
  elsif new.revision::bigint is distinct from old.revision::bigint + 1 then
    raise check_violation using message = 'An Event update must increment the current revision by one.';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_draft_event() from public, anon, authenticated, service_role;

create table public.booth_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  state text not null check (state in ('Prepared','Active','PauseRequested','Paused','Ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (id, event_id)
);
create index booth_runs_event_idx on public.booth_runs(event_id);
create table public.booth_grants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  run_id uuid not null,
  secret_hash text unique,
  state text not null default 'Inactive' check (state in ('Inactive','Active','Revoked')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (run_id, event_id) references public.booth_runs(id, event_id),
  check (expires_at > created_at and isfinite(expires_at)),
  check (state <> 'Active' or (secret_hash is not null and revoked_at is null)),
  check ((state = 'Revoked') = (revoked_at is not null))
);
create index booth_grants_event_idx on public.booth_grants(event_id);
create index booth_grants_run_idx on public.booth_grants(run_id, event_id);
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  run_id uuid not null,
  state text not null default 'Open' check (state in ('Open','Printed','Abandoned')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  foreign key (run_id, event_id) references public.booth_runs(id, event_id),
  unique (id, event_id, run_id)
);
create index guest_sessions_event_idx on public.guest_sessions(event_id);
create index guest_sessions_run_idx on public.guest_sessions(run_id, event_id);
create unique index guest_sessions_one_open_idx on public.guest_sessions(run_id) where state = 'Open';
create table public.captures (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  run_id uuid not null,
  session_id uuid not null,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (session_id, event_id, run_id) references public.guest_sessions(id, event_id, run_id),
  unique (id, session_id, event_id, run_id)
);
create index captures_event_idx on public.captures(event_id);
create index captures_session_idx on public.captures(session_id, event_id, run_id);
create table public.print_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  run_id uuid,
  session_id uuid,
  capture_id uuid,
  kind text not null check (kind in ('Guest','Test')),
  state text not null default 'Reserved' check (state in ('Reserved','Accepted','RejectedUnused','Confirmed','Uncertain','AdminResolvedEjected','AdminResolvedUnused','WastedFilm')),
  request_key uuid not null unique,
  connection_id uuid not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  resolved_at timestamptz,
  foreign key (capture_id, session_id, event_id, run_id) references public.captures(id, session_id, event_id, run_id),
  check ((kind = 'Guest' and run_id is not null and session_id is not null and capture_id is not null) or (kind = 'Test' and run_id is null and session_id is null and capture_id is null)),
  unique (id, event_id)
);
create index print_attempts_event_idx on public.print_attempts(event_id);
create index print_attempts_capture_idx on public.print_attempts(capture_id, session_id, event_id, run_id);
create unique index print_attempts_one_printer_idx on public.print_attempts((true)) where state in ('Reserved','Accepted','Uncertain');
create unique index print_attempts_one_unresolved_session_idx on public.print_attempts(session_id) where kind = 'Guest' and state in ('Reserved','Accepted','Uncertain');
create table public.print_attempt_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.print_attempts(id),
  actor_scope text not null,
  state text not null check (state in ('Reserved','Accepted','RejectedUnused','Confirmed','Uncertain','AdminResolvedEjected','AdminResolvedUnused','WastedFilm','Diagnostic')),
  evidence_kind text,
  reason text,
  created_at timestamptz not null default now(),
  check (state not in ('AdminResolvedEjected','AdminResolvedUnused','WastedFilm') or (reason is not null and reason ~ '[^[:space:]]'))
);
create index print_attempt_events_attempt_idx on public.print_attempt_events(attempt_id);
create unique index print_attempt_events_one_waste_idx on public.print_attempt_events(attempt_id) where state = 'WastedFilm';
create table public.additional_print_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  quantity integer not null check (quantity > 0),
  actor_id uuid not null,
  created_at timestamptz not null default now()
);
create index additional_print_entries_event_idx on public.additional_print_entries(event_id);
create table public.film_stock_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id),
  attempt_id uuid unique,
  kind text not null check (kind in ('Addition','Reconciliation','Consumption')),
  signed_sheets integer not null,
  observed_sheets integer check (observed_sheets >= 0),
  actor_scope text not null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (attempt_id, event_id) references public.print_attempts(id, event_id),
  check ((kind = 'Addition' and signed_sheets > 0 and attempt_id is null and observed_sheets is null) or (kind = 'Reconciliation' and attempt_id is null and observed_sheets is not null and reason is not null and reason ~ '[^[:space:]]') or (kind = 'Consumption' and signed_sheets = -1 and attempt_id is not null and event_id is not null and observed_sheets is null))
);
create index film_stock_entries_event_idx on public.film_stock_entries(event_id);
create table public.film_stock_balance (
  id uuid primary key default '00000000-0000-0000-0000-000000000001' check (id = '00000000-0000-0000-0000-000000000001'),
  on_hand bigint not null default 0 check (on_hand >= 0),
  revision bigint not null default 1 check (revision > 0)
);
insert into public.film_stock_balance default values;
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id),
  attempt_id uuid references public.print_attempts(id),
  actor_scope text not null,
  operation_kind text not null,
  created_at timestamptz not null default now()
);
create index activity_events_event_idx on public.activity_events(event_id);
create index activity_events_attempt_idx on public.activity_events(attempt_id);
create table public.operation_receipts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id),
  actor_scope text not null,
  operation_kind text not null,
  operation_key uuid not null,
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  -- Only narrow server operations may construct this non-photo result.
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  unique (actor_scope, operation_kind, operation_key)
);
create index operation_receipts_event_idx on public.operation_receipts(event_id);

do $$
declare table_name text;
begin
  foreach table_name in array array['booth_runs','booth_grants','guest_sessions','captures','print_attempts','print_attempt_events','additional_print_entries','film_stock_entries','film_stock_balance','activity_events','operation_receipts'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    -- Grant hashes and idempotency receipts stay behind the server boundary.
    if table_name not in ('booth_grants','operation_receipts') then
      execute format('grant select on table public.%I to authenticated', table_name);
      execute format('create policy operational_admin_read on public.%I for select to authenticated using ((select private.is_active_admin()))', table_name);
    end if;
  end loop;
end;
$$;
