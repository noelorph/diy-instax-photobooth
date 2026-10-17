create table public.events (
  id uuid primary key default gen_random_uuid(),
  state text not null default 'Draft' check (state = 'Draft'),
  title text not null check (title ~ '[^[:space:]]'),
  client_name text not null check (client_name ~ '[^[:space:]]'),
  client_email text not null check (client_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  client_phone text not null check (client_phone ~ '[^[:space:]]'),
  venue_address text not null check (venue_address ~ '[^[:space:]]'),
  time_zone text not null,
  starts_at timestamptz not null check (isfinite(starts_at)),
  ends_at timestamptz not null check (isfinite(ends_at)),
  film_package_count integer not null check (film_package_count >= 0),
  original_print_allowance integer not null check (original_print_allowance >= 0),
  revision integer not null default 1 check (revision > 0),
  constraint events_schedule_order check (ends_at > starts_at)
);

-- Stable ordering for the Draft list, including bookings with the same start.
create index events_draft_schedule_idx on public.events (starts_at, id) where state = 'Draft';

alter table public.events enable row level security;
revoke all on table public.events from public, anon, authenticated, service_role;
grant select, insert on table public.events to authenticated;
grant update (
  state, title, client_name, client_email, client_phone, venue_address,
  time_zone, starts_at, ends_at, film_package_count, original_print_allowance, revision
) on table public.events to authenticated;
-- Trusted maintenance only; no browser/client DELETE grant or policy exists.
grant select, insert, update, delete on table public.events to service_role;

create policy events_admin_read on public.events for select to authenticated
using ((select private.is_active_admin()));

create policy events_admin_create on public.events for insert to authenticated
with check ((select private.is_active_admin()));

create policy events_admin_update on public.events for update to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

-- The API accepts UTC instants, so DST disambiguation happens before persistence.
-- Validate the retained venue zone against PostgreSQL's time-zone database.
create function private.validate_draft_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names
    where name = new.time_zone
      and name not like 'posix/%'
      and name not like 'right/%'
  ) then
    raise check_violation using message = 'A valid venue time zone is required.';
  end if;

  if tg_op = 'INSERT' then
    if new.revision is distinct from 1 then
      raise check_violation using message = 'A new Draft must start at revision 1.';
    end if;
  elsif new.revision::bigint is distinct from old.revision::bigint + 1 then
    raise check_violation using message = 'A Draft update must increment the current revision by one.';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_draft_event() from public, anon, authenticated, service_role;

create trigger validate_draft_event_before_save
before insert or update on public.events
for each row execute function private.validate_draft_event();
