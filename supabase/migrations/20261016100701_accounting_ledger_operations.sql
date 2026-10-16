-- Narrow server RPCs own ledger writes. SECURITY DEFINER is required for the
-- live auth.sessions check; browser EXECUTE is explicitly revoked below.
-- Application callers cannot rewrite accounting history or forge entries.
revoke insert, update, delete on public.film_stock_entries, public.additional_print_entries from service_role;

create function public.add_film_stock(admin_user_id uuid, admin_session_id uuid, operation_key uuid, sheets integer, reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := 'admin:' || admin_user_id::text;
  v_reason text := nullif(btrim(reason, E' \t\n\r'), '');
  v_digest text;
  v_receipt public.operation_receipts%rowtype;
  v_entry uuid;
  v_result jsonb;
  v_on_hand bigint;
  v_reserved bigint;
  v_difference bigint;
begin
  if operation_key is null then raise exception 'validation_error'; end if;
  -- The actor/kind/key lock also serializes changed-input retries across Events.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor || ':add_film_stock:' || operation_key::text, 0));
  if not exists (
    select 1 from public.admin_profiles p join auth.sessions s on s.user_id = p.id
    where p.id = admin_user_id and s.id = admin_session_id
      and (s.not_after is null or s.not_after > statement_timestamp())
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  if sheets is null or sheets <= 0 then raise exception 'validation_error'; end if;
  v_digest := encode(sha256(convert_to(jsonb_build_object('sheets', sheets, 'reason', v_reason)::text, 'UTF8')), 'hex');
  select * into v_receipt from public.operation_receipts r
    where r.actor_scope = v_actor and r.operation_kind = 'add_film_stock' and r.operation_key = add_film_stock.operation_key;
  if found then
    if v_receipt.input_digest <> v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  select on_hand into strict v_on_hand from public.film_stock_balance where id = '00000000-0000-0000-0000-000000000001' for update;
  select count(*) into v_reserved from public.print_attempts where state in ('Reserved','Accepted','Uncertain');
  v_difference := sheets;
  insert into public.film_stock_entries(kind, signed_sheets, observed_sheets, actor_scope, reason)
    values ('Addition', v_difference, null, v_actor, v_reason) returning id into v_entry;
  update public.film_stock_balance set on_hand = v_on_hand + v_difference, revision = revision + 1 where id = '00000000-0000-0000-0000-000000000001';
  v_result := jsonb_build_object('entry_id', v_entry, 'previous_on_hand', v_on_hand,
    'signed_sheets', v_difference, 'on_hand', v_on_hand + v_difference,
    'available_stock', v_on_hand + v_difference - v_reserved);
  insert into public.activity_events(event_id, actor_scope, operation_kind) values (null, v_actor, 'add_film_stock');
  insert into public.operation_receipts(event_id, actor_scope, operation_kind, operation_key, input_digest, result)
    values (null, v_actor, 'add_film_stock', operation_key, v_digest, v_result);
  return v_result;
end;
$$;
revoke all on function public.add_film_stock(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.add_film_stock(uuid, uuid, uuid, integer, text) to service_role;

create function public.reconcile_film_stock(admin_user_id uuid, admin_session_id uuid, operation_key uuid, observed_sheets integer, reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := 'admin:' || admin_user_id::text;
  v_reason text := nullif(btrim(reason, E' \t\n\r'), '');
  v_digest text;
  v_receipt public.operation_receipts%rowtype;
  v_entry uuid;
  v_result jsonb;
  v_on_hand bigint;
  v_reserved bigint;
  v_difference bigint;
begin
  if operation_key is null then raise exception 'validation_error'; end if;
  -- The actor/kind/key lock also serializes changed-input retries across Events.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor || ':reconcile_film_stock:' || operation_key::text, 0));
  if not exists (
    select 1 from public.admin_profiles p join auth.sessions s on s.user_id = p.id
    where p.id = admin_user_id and s.id = admin_session_id
      and (s.not_after is null or s.not_after > statement_timestamp())
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  if observed_sheets is null or observed_sheets < 0 or v_reason is null then raise exception 'validation_error'; end if;
  v_digest := encode(sha256(convert_to(jsonb_build_object('observed_sheets', observed_sheets, 'reason', v_reason)::text, 'UTF8')), 'hex');
  select * into v_receipt from public.operation_receipts r
    where r.actor_scope = v_actor and r.operation_kind = 'reconcile_film_stock' and r.operation_key = reconcile_film_stock.operation_key;
  if found then
    if v_receipt.input_digest <> v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  select on_hand into strict v_on_hand from public.film_stock_balance where id = '00000000-0000-0000-0000-000000000001' for update;
  select count(*) into v_reserved from public.print_attempts where state in ('Reserved','Accepted','Uncertain');
  if v_reserved > 0 then raise exception 'pending_attempt'; end if;
  v_difference := observed_sheets::bigint - v_on_hand;
  if v_difference < -2147483648 or v_difference > 2147483647 then raise exception 'validation_error'; end if;
  insert into public.film_stock_entries(kind, signed_sheets, observed_sheets, actor_scope, reason)
    values ('Reconciliation', v_difference, observed_sheets, v_actor, v_reason) returning id into v_entry;
  update public.film_stock_balance set on_hand = v_on_hand + v_difference, revision = revision + 1 where id = '00000000-0000-0000-0000-000000000001';
  v_result := jsonb_build_object('entry_id', v_entry, 'previous_on_hand', v_on_hand,
    'signed_sheets', v_difference, 'on_hand', v_on_hand + v_difference,
    'available_stock', v_on_hand + v_difference - v_reserved);
  insert into public.activity_events(event_id, actor_scope, operation_kind) values (null, v_actor, 'reconcile_film_stock');
  insert into public.operation_receipts(event_id, actor_scope, operation_kind, operation_key, input_digest, result)
    values (null, v_actor, 'reconcile_film_stock', operation_key, v_digest, v_result);
  return v_result;
end;
$$;
revoke all on function public.reconcile_film_stock(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.reconcile_film_stock(uuid, uuid, uuid, integer, text) to service_role;

create function public.add_event_prints(admin_user_id uuid, admin_session_id uuid, event_id uuid, operation_key uuid, quantity integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := 'admin:' || admin_user_id::text;
  v_digest text;
  v_receipt public.operation_receipts%rowtype;
  v_entry uuid;
  v_result jsonb;
  v_on_hand bigint;
  v_reserved bigint;
  v_event public.events%rowtype;
  v_additional bigint;
  v_confirmed bigint;
begin
  if operation_key is null then raise exception 'validation_error'; end if;
  -- The actor/kind/key lock also serializes changed-input retries across Events.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor || ':add_event_prints:' || operation_key::text, 0));
  if not exists (
    select 1 from public.admin_profiles p join auth.sessions s on s.user_id = p.id
    where p.id = admin_user_id and s.id = admin_session_id
      and (s.not_after is null or s.not_after > statement_timestamp())
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  if quantity is null or quantity <= 0 or event_id is null then raise exception 'validation_error'; end if;
  v_digest := encode(sha256(convert_to(jsonb_build_object('event_id', event_id, 'quantity', quantity)::text, 'UTF8')), 'hex');
  select * into v_receipt from public.operation_receipts r
    where r.actor_scope = v_actor and r.operation_kind = 'add_event_prints' and r.operation_key = add_event_prints.operation_key;
  if found then
    if v_receipt.input_digest <> v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  select * into v_event from public.events e where e.id = add_event_prints.event_id for update;
  if not found or v_event.deleted_at is not null or v_event.state not in ('Draft', 'Live') then
    raise exception 'state_conflict';
  end if;
  select on_hand into strict v_on_hand from public.film_stock_balance where id = '00000000-0000-0000-0000-000000000001' for update;
  insert into public.additional_print_entries(event_id, quantity, actor_id)
    values (event_id, quantity, admin_user_id) returning id into v_entry;
  select coalesce(sum(a.quantity), 0) into v_additional from public.additional_print_entries a where a.event_id = v_event.id;
  select count(*) filter (where a.state in ('Reserved','Accepted','Uncertain')),
    count(*) filter (where a.state in ('Confirmed','AdminResolvedEjected') and not exists (
      select 1 from public.print_attempt_events h where h.attempt_id = a.id and h.state = 'WastedFilm'
    )) into v_reserved, v_confirmed
    from public.print_attempts a where a.event_id = v_event.id and a.kind = 'Guest';
  v_result := jsonb_build_object('entry_id', v_entry, 'original_print_allowance', v_event.original_print_allowance,
    'additional_prints', v_additional, 'confirmed_prints', v_confirmed, 'reserved_prints', v_reserved,
    'remaining_allowance', v_event.original_print_allowance + v_additional - v_confirmed - v_reserved);
  insert into public.activity_events(event_id, actor_scope, operation_kind) values (event_id, v_actor, 'add_event_prints');
  insert into public.operation_receipts(event_id, actor_scope, operation_kind, operation_key, input_digest, result)
    values (event_id, v_actor, 'add_event_prints', operation_key, v_digest, v_result);
  return v_result;
end;
$$;
revoke all on function public.add_event_prints(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.add_event_prints(uuid, uuid, uuid, uuid, integer) to service_role;
