-- Version 1 remains the creation default until the owner-only cutover.
alter table public.events add column accounting_version integer not null default 1 check (accounting_version in (1,2));
alter table public.events add column booking_review_required boolean not null default false;
alter table public.events alter column original_print_allowance drop not null;
alter table public.events add constraint events_version_allowance_check check (
  (accounting_version=1 and original_print_allowance is not null) or
  (accounting_version=2 and original_print_allowance is null and film_package_count<=214748364)
);
do $$
declare t text;
begin
  foreach t in array array['booth_runs','booth_grants','booth_handoffs','guest_sessions','captures','print_attempts','print_attempt_events','operation_receipts','activity_events'] loop
    execute format('alter table public.%I add column accounting_version integer not null default 1 check (accounting_version in (1,2))',t);
  end loop;
end;
$$;

create table private.booth_contract_guard (
  id boolean primary key default true check(id),
  active_creation_version integer not null default 1 check(active_creation_version in (1,2)),
  activated_at timestamptz,
  check ((active_creation_version=1 and activated_at is null) or (active_creation_version=2 and activated_at is not null and isfinite(activated_at)))
);
insert into private.booth_contract_guard default values;
alter table private.booth_contract_guard enable row level security;
revoke all on private.booth_contract_guard from public,anon,authenticated,service_role;
