-- A downgrade could strand v2 children on v1 parents and resume legacy accounting.
create function private.prevent_package_version_downgrade()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.accounting_version<old.accounting_version then
    raise check_violation using message='Accounting versions cannot be downgraded.';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_package_version_downgrade() from public,anon,authenticated,service_role;
do $$
declare t text;
begin
  foreach t in array array['events','booth_runs','booth_grants','booth_handoffs','guest_sessions','captures','print_attempts','print_attempt_events','operation_receipts','activity_events','additional_film_package_entries','booth_reload_requests'] loop
    execute format('create trigger package_version_before_update before update of accounting_version on public.%I for each row execute function private.prevent_package_version_downgrade()',t);
  end loop;
end;
$$;
