-- Keep the existing verified JWT/session/profile read boundary aligned with
-- operational RPCs when an Auth session has an explicit time limit.
create or replace function private.is_active_admin()
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
        and (session.not_after is null or session.not_after > statement_timestamp())
    );
$$;

revoke all on function private.is_active_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_active_admin() to authenticated;
