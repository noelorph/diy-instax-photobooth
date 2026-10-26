-- Creation uses the same actor/key receipts and guard order as current package operations.
create function private.create_event_draft(
  p_admin_user_id uuid, p_admin_session_id uuid, p_operation_id uuid, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor text := 'admin:' || p_admin_user_id;
  e public.events%rowtype;
  receipt public.operation_receipts%rowtype;
  normalized jsonb;
  replay jsonb;
  packages numeric;
  starts timestamptz;
  ends timestamptz;
  creation_default text;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['title','client_name','client_email','client_phone','venue_address','time_zone','starts_at','ends_at','film_package_count'])
    or p_payload-array['title','client_name','client_email','client_phone','venue_address','time_zone','starts_at','ends_at','film_package_count']<>'{}'::jsonb
    or exists(select 1 from jsonb_each(p_payload) x where x.key<>'film_package_count' and jsonb_typeof(x.value)<>'string')
    or jsonb_typeof(p_payload->'film_package_count') is distinct from 'number' then raise exception 'invalid_input'; end if;
  packages := (p_payload->>'film_package_count')::numeric;
  if packages<>trunc(packages) or packages not between 0 and 214748364
    or exists(select 1 from jsonb_each_text(p_payload) x where x.key<>'film_package_count' and x.value !~ '[^[:space:]]')
    or (p_payload->>'client_email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_input'; end if;
  begin
    starts := (p_payload->>'starts_at')::timestamptz;
    ends := (p_payload->>'ends_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'invalid_input'; end;
  if not isfinite(starts) or not isfinite(ends) or ends<=starts then raise exception 'invalid_input'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=btrim(p_payload->>'time_zone')
    and name not like 'posix/%' and name not like 'right/%') then
    raise check_violation using message='A valid venue time zone is required.';
  end if;
  normalized := jsonb_build_object(
    'title',btrim(p_payload->>'title'),'client_name',btrim(p_payload->>'client_name'),
    'client_email',btrim(p_payload->>'client_email'),'client_phone',btrim(p_payload->>'client_phone'),
    'venue_address',btrim(p_payload->>'venue_address'),'time_zone',btrim(p_payload->>'time_zone'),
    'starts_at',starts at time zone 'UTC','ends_at',ends at time zone 'UTC','film_package_count',packages::integer);

  perform 1 from private.booth_contract_guard where id for update;
  select * into receipt from public.operation_receipts where accounting_version=2
    and actor_scope=actor and operation_key=p_operation_id;
  if receipt.id is not null then
    select * into e from public.events where id=receipt.event_id for update;
  end if;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  replay := private.package_receipt(actor,p_operation_id,'create_draft',normalized,e.revision);
  if replay is not null then return replay; end if;

  -- Transitional only: tests may select the v2 creation default without activating old-data conversion.
  select pg_catalog.pg_get_expr(d.adbin,d.adrelid) into creation_default
    from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
    where d.adrelid='public.events'::regclass and a.attname='accounting_version';
  if creation_default is distinct from '2' then raise exception 'operation_unavailable'; end if;
  insert into public.events(title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count)
    values(normalized->>'title',normalized->>'client_name',normalized->>'client_email',normalized->>'client_phone',
      normalized->>'venue_address',normalized->>'time_zone',starts,ends,packages::integer)
    returning * into e;
  if e.accounting_version<>2 then raise exception 'operation_unavailable'; end if;
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind)
    values(e.id,2,actor,'create_draft');
  return private.package_commit_receipt(e.id,actor,p_operation_id,'create_draft',normalized,e.revision,jsonb_build_object('eventId',e.id));
end $$;
revoke all on function private.create_event_draft(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.create_event_draft(uuid,uuid,uuid,jsonb) to service_role;

create function public.create_event_draft(
  p_admin_user_id uuid, p_admin_session_id uuid, p_operation_id uuid, p_payload jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.create_event_draft(p_admin_user_id,p_admin_session_id,p_operation_id,p_payload)
$$;
revoke all on function public.create_event_draft(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.create_event_draft(uuid,uuid,uuid,jsonb) to service_role;

-- Direct revision-checked Draft updates retain one metadata-only audit in their own transaction.
create function private.audit_draft_booking_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.accounting_version=2 and old.state='Draft' and new.state='Draft'
    and old.deleted_at is null and new.deleted_at is null then
    insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind)
      values(new.id,2,coalesce('admin:'||auth.uid()::text,'system'),'update_draft');
  end if;
  return new;
end $$;
revoke all on function private.audit_draft_booking_update() from public,anon,authenticated,service_role;
create trigger audit_draft_booking_update after update of title,client_name,client_email,client_phone,
  venue_address,time_zone,starts_at,ends_at,film_package_count on public.events
for each row execute function private.audit_draft_booking_update();

-- Every browser creation must atomically write its receipt and creation audit.
revoke insert on public.events from authenticated;
revoke insert(id,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,
  film_package_count,original_print_allowance,revision) on public.events from authenticated;
drop policy events_admin_create on public.events;
