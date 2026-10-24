-- UPDATE OF also rejects explicitly setting the v2 legacy column to NULL.
create function private.reject_package_allowance_edit()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.accounting_version=2 and current_user in ('anon','authenticated','service_role') then
    raise insufficient_privilege using message='Version 2 Events have no editable independent allowance.';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_package_allowance_edit() from public,anon,authenticated,service_role;
create trigger package_allowance_before_update
before update of original_print_allowance on public.events
for each row execute function private.reject_package_allowance_edit();
