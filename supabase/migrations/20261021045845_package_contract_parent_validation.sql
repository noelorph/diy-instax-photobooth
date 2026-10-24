-- Shared row triggers must read only fields present on their current table.
create or replace function private.validate_package_parent() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_event uuid; v_run uuid; v_version integer; v_row jsonb := to_jsonb(new);
begin
  v_version := coalesce((to_jsonb(new)->>'accounting_version')::integer,2);
  if v_version<>2 then return new; end if;
  if tg_table_name='print_attempt_events' then
    if not exists(select 1 from public.print_attempts a where a.id=(v_row->>'attempt_id')::uuid and a.accounting_version=2) then
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
  if tg_table_name='captures' and not exists(select 1 from public.guest_sessions s where s.id=(v_row->>'session_id')::uuid and s.accounting_version=2) then
    raise check_violation using message='Version 2 captures require a version 2 session.';
  end if;
  if tg_table_name='print_attempts' and not exists(select 1 from public.captures c where c.id=(v_row->>'capture_id')::uuid and c.accounting_version=2) then
    raise check_violation using message='Version 2 attempts require a version 2 capture.';
  end if;
  return new;
end;
$$;
