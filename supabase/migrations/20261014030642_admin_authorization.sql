create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

create table public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  theme text not null default 'light' check (theme in ('light', 'dark'))
);

alter table public.admin_profiles enable row level security;
revoke all on table public.admin_profiles from public, anon, authenticated;
grant select on table public.admin_profiles to authenticated;
grant update (phone, theme) on table public.admin_profiles to authenticated;
-- Only trusted provisioning operations may add/remove an Admin allowlist entry.
grant select, insert, update, delete on table public.admin_profiles to service_role;

-- RLS callers cannot read auth.sessions themselves. This narrow internal lookup
-- also avoids recursively evaluating the Profile policies for the allowlist check.
create function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.admin_profiles as profile
      join auth.sessions as session on session.user_id = profile.id
      where profile.id = (select auth.uid())
        and session.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
    );
$$;

revoke all on function private.is_active_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_active_admin() to authenticated;

create policy admin_profile_read
on public.admin_profiles for select to authenticated
using (id = (select auth.uid()) and (select private.is_active_admin()));

create policy admin_profile_update
on public.admin_profiles for update to authenticated
using (id = (select auth.uid()) and (select private.is_active_admin()))
with check (id = (select auth.uid()) and (select private.is_active_admin()));
