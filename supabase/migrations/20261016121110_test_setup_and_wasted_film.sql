-- Test setup and Guest Wasted Film correction. Only local simulator policy may
-- reserve Tests; production physical completion remains gated by ADR-0021.
-- Admin inspection is immutable per ejected Test and scoped to its connection.
SET local check_function_bodies = off;

ALTER TABLE "public"."print_attempts"
  ADD COLUMN "test_output_usable" boolean;

CREATE OR REPLACE FUNCTION private.guest_operation (
  p_kind        text,
  p_hash        text,
  p_run         uuid,
  p_session     uuid,
  p_capture     uuid,
  p_key         uuid,
  p_captured_at timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_grant public.booth_grants%rowtype;
  v_event public.events%rowtype;
  v_run public.booth_runs%rowtype;
  v_session public.guest_sessions%rowtype;
  v_receipt public.operation_receipts%rowtype;
  v_actor text;
  v_digest text;
  v_result jsonb;
  v_availability jsonb;
  v_id uuid;
begin
  if p_key is null or p_kind not in ('open_guest_session','record_capture','abandon_guest_session','reserve_guest_attempt') then raise exception 'validation_error'; end if;
  select * into v_grant from public.booth_grants where secret_hash=p_hash;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  v_actor:='booth:'||v_grant.id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':'||p_kind||':'||p_key::text,0));
  -- Pause and all accounting transitions also lock this Event first.
  select * into v_event from public.events where id=v_grant.event_id for update;
  select * into v_grant from public.booth_grants where id=v_grant.id;
  if v_grant.state<>'Active' or v_grant.revoked_at is not null or v_grant.secret_hash is distinct from p_hash then raise exception 'forbidden' using errcode='42501'; end if;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'grant_expired' using errcode='42501'; end if;
  if p_run is not null and p_run<>v_grant.run_id then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_run from public.booth_runs where id=v_grant.run_id and event_id=v_grant.event_id;
  if not found or v_event.state<>'Live' or v_event.deleted_at is not null or v_run.state<>'Active' then raise exception 'state_conflict'; end if;
  if p_kind in ('open_guest_session','reserve_guest_attempt') and p_run is null then raise exception 'validation_error'; end if;
  if p_kind<>'open_guest_session' and p_session is null then raise exception 'validation_error'; end if;
  if p_kind='reserve_guest_attempt' and p_capture is null then raise exception 'validation_error'; end if;
  if p_kind='record_capture' and (p_captured_at is null or not isfinite(p_captured_at)) then raise exception 'validation_error'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('run_id',p_run,'session_id',p_session,'capture_id',p_capture,
    'captured_at',extract(epoch from p_captured_at))::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts where actor_scope=v_actor and operation_kind=p_kind and operation_key=p_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  perform 1 from public.film_stock_balance where id='00000000-0000-0000-0000-000000000001' for update;
  if p_kind<>'open_guest_session' then
    select * into v_session from public.guest_sessions where id=p_session and event_id=v_event.id and run_id=v_run.id for update;
    if not found then raise exception 'forbidden' using errcode='42501'; end if;
    if v_session.state<>'Open' then raise exception 'state_conflict'; end if;
  end if;
  v_availability:=private.guest_availability(v_event.id);
  if p_kind in ('open_guest_session','reserve_guest_attempt') then
    if (v_availability->>'remaining_allowance')::bigint<=0 then raise exception 'allowance_exhausted'; end if;
    if (v_availability->>'available_stock')::bigint<=0 then raise exception 'stock_exhausted'; end if;
    if (v_availability->>'printer_busy')::boolean then raise exception 'printer_busy'; end if;
  elsif exists(select 1 from public.print_attempts where session_id=p_session and state in ('Reserved','Accepted','Uncertain')) then
    raise exception 'pending_attempt';
  end if;
  if p_kind='open_guest_session' then
    if exists(select 1 from public.guest_sessions where run_id=v_run.id and state='Open') then raise exception 'state_conflict'; end if;
    insert into public.guest_sessions(event_id,run_id) values(v_event.id,v_run.id) returning id into v_id;
    v_result:=jsonb_build_object('session_id',v_id,'state','Open','availability',v_availability);
  elsif p_kind='record_capture' then
    insert into public.captures(event_id,run_id,session_id,captured_at) values(v_event.id,v_run.id,p_session,p_captured_at) returning id into v_id;
    v_result:=jsonb_build_object('session_id',p_session,'capture_id',v_id,'capture_count',(select count(*) from public.captures where session_id=p_session));
  elsif p_kind='abandon_guest_session' then
    update public.guest_sessions set state='Abandoned',closed_at=statement_timestamp() where id=p_session;
    v_result:=jsonb_build_object('session_id',p_session,'state','Abandoned','availability',v_availability);
  else
    -- Only a Capture committed and acknowledged by record_capture supplies this
    -- opaque identifier. Bytes, a shutter claim, or a client-chosen ID cannot reserve.
    if not exists(select 1 from public.captures where id=p_capture and session_id=p_session and event_id=v_event.id and run_id=v_run.id) then raise exception 'state_conflict'; end if;
    if v_run.connection_id is null or not exists(select 1 from public.print_attempts a where a.event_id=v_event.id and a.connection_id=v_run.connection_id and a.kind='Test' and a.test_output_usable is true and a.state in ('Confirmed','AdminResolvedEjected') and not exists(select 1 from public.print_attempt_events h where h.attempt_id=a.id and h.state='WastedFilm')) then raise exception 'not_ready'; end if;
    -- Holds are exactly one Guest attempt, not independent counters. Generate an
    -- internal request key: external keys are scoped to the actor/operation receipt.
    insert into public.print_attempts(event_id,run_id,session_id,capture_id,kind,request_key,connection_id)
      values(v_event.id,v_run.id,p_session,p_capture,'Guest',gen_random_uuid(),v_run.connection_id) returning id into v_id;
    insert into public.print_attempt_events(attempt_id,actor_scope,state) values(v_id,v_actor,'Reserved');
    v_result:=jsonb_build_object('attempt_id',v_id,'session_id',p_session,'state','Reserved','allowance_hold',1,'film_hold',1,'availability',private.guest_availability(v_event.id));
  end if;
  insert into public.activity_events(event_id,attempt_id,actor_scope,operation_kind)
    values(v_event.id,case when p_kind='reserve_guest_attempt' then v_id else null end,v_actor,p_kind);
  insert into public.operation_receipts(event_id,actor_scope,operation_kind,operation_key,input_digest,result)
    values(v_event.id,v_actor,p_kind,p_key,v_digest,v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.test_and_waste_operation (
  p_operation     text,
  p_admin         uuid,
  p_admin_session uuid,
  p_event         uuid,
  p_attempt       uuid,
  p_key           uuid,
  p_connection    uuid,
  p_usable        boolean,
  p_reason        text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_actor text := 'admin:'||p_admin::text;
  v_reason text := nullif(btrim(p_reason,E' \t\n\r'),'');
  v_event public.events%rowtype;
  v_attempt public.print_attempts%rowtype;
  v_receipt public.operation_receipts%rowtype;
  v_digest text;
  v_result jsonb;
  v_availability jsonb;
  v_id uuid;
begin
  if p_key is null or p_operation is null or p_operation not in ('reserve_test_attempt','confirm_test_output','mark_wasted_film') then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':'||p_operation||':'||p_key::text,0));
  -- A service credential alone is insufficient. Recheck live Admin authority,
  -- including session revocation, before returning any cached operation receipt.
  if not exists(select 1 from public.admin_profiles a join auth.sessions s on s.user_id=a.id
    where a.id=p_admin and s.id=p_admin_session and (s.not_after is null or s.not_after>statement_timestamp())) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_operation='reserve_test_attempt' then
    if p_event is null or p_connection is null then raise exception 'validation_error'; end if;
  else
    if p_attempt is null then raise exception 'validation_error'; end if;
    if p_operation='confirm_test_output' and p_usable is null then raise exception 'validation_error'; end if;
    if p_operation='mark_wasted_film' and (v_reason is null or length(v_reason)>1000) then raise exception 'validation_error'; end if;
  end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('event_id',p_event,'attempt_id',p_attempt,
    'connection_id',p_connection,'usable',p_usable,'reason',v_reason,
    'initiating_admin_session_id',case when p_operation='reserve_test_attempt' then p_admin_session else null end)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts where actor_scope=v_actor and operation_kind=p_operation and operation_key=p_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  if p_operation<>'reserve_test_attempt' then
    select * into v_attempt from public.print_attempts where id=p_attempt;
    if not found then raise exception 'state_conflict'; end if;
    p_event:=v_attempt.event_id;
  end if;
  -- Every mutation shares the global accounting lock order. The early attempt
  -- lookup only identifies its immutable Event; the row is locked after stock.
  select * into v_event from public.events where id=p_event for update;
  if not found then raise exception 'state_conflict'; end if;
  perform 1 from public.film_stock_balance where id='00000000-0000-0000-0000-000000000001' for update;
  if p_operation='reserve_test_attempt' then
    -- Check global run exclusion under the same stock lock as handoff preparation.
    if v_event.deleted_at is not null or v_event.state not in ('Draft','Live')
      or exists(select 1 from public.booth_runs where state in ('Prepared','Active','PauseRequested')) then raise exception 'state_conflict'; end if;
    -- This policy has no production-enabled value. Only privileged local fixture
    -- SQL can enable simulation; a browser cannot attest to physical readiness.
    if not exists(select 1 from public.printer_completion_policy where id and mode='simulated') then raise exception 'not_ready'; end if;
    v_availability:=private.guest_availability(p_event);
    if (v_availability->>'available_stock')::bigint<=0 then raise exception 'stock_exhausted'; end if;
    if (v_availability->>'printer_busy')::boolean then raise exception 'printer_busy'; end if;
    insert into public.print_attempts(event_id,kind,request_key,connection_id,initiating_admin_session_id)
      values(p_event,'Test',gen_random_uuid(),p_connection,p_admin_session) returning id into v_id;
    insert into public.print_attempt_events(attempt_id,actor_scope,state) values(v_id,v_actor,'Reserved');
    v_result:=jsonb_build_object('attempt_id',v_id,'state','Reserved','connection_id',p_connection,
      'allowance_hold',0,'film_hold',1,'availability',private.guest_availability(p_event));
  else
    select * into strict v_attempt from public.print_attempts where id=p_attempt for update;
    v_id:=p_attempt;
    if p_operation='confirm_test_output' then
      if v_attempt.kind<>'Test' or v_attempt.state not in ('Confirmed','AdminResolvedEjected') then raise exception 'state_conflict'; end if;
      if v_attempt.test_output_usable is not null and v_attempt.test_output_usable is distinct from p_usable then raise exception 'state_conflict'; end if;
      if v_attempt.test_output_usable is null then
        update public.print_attempts set test_output_usable=p_usable where id=p_attempt;
        insert into public.print_attempt_events(attempt_id,actor_scope,state,evidence_kind)
          values(p_attempt,v_actor,'Diagnostic',case when p_usable then 'admin_output_usable' else 'admin_output_unusable' end);
      end if;
      v_result:=jsonb_build_object('attempt_id',p_attempt,'state',v_attempt.state,'connection_id',v_attempt.connection_id,'usable',p_usable);
    else
      if v_attempt.kind<>'Guest' or v_attempt.state not in ('Confirmed','AdminResolvedEjected')
        or exists(select 1 from public.print_attempt_events where attempt_id=p_attempt and state='WastedFilm') then raise exception 'state_conflict'; end if;
      update public.print_attempts set state='WastedFilm' where id=p_attempt;
      insert into public.print_attempt_events(attempt_id,actor_scope,state,evidence_kind,reason)
        values(p_attempt,v_actor,'WastedFilm','admin_inspection',v_reason);
      -- The original ejection journal, -1 ledger entry, and closed Guest Session
      -- are deliberately preserved. Only allowance classification changes.
      v_result:=jsonb_build_object('attempt_id',p_attempt,'state','WastedFilm','allowance_hold',0,'film_hold',0,
        'availability',private.guest_availability(p_event),'on_hand',(select on_hand from public.film_stock_balance));
    end if;
  end if;
  insert into public.activity_events(event_id,attempt_id,actor_scope,operation_kind) values(p_event,v_id,v_actor,p_operation);
  insert into public.operation_receipts(event_id,actor_scope,operation_kind,operation_key,input_digest,result) values(p_event,v_actor,p_operation,p_key,v_digest,v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_test_output (
  admin_user_id    uuid,
  admin_session_id uuid,
  attempt_id       uuid,
  operation_key    uuid,
  usable           boolean
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.test_and_waste_operation('confirm_test_output',admin_user_id,admin_session_id,null,attempt_id,operation_key,null,usable,null);
$function$;

REVOKE ALL ON FUNCTION "public"."confirm_test_output"(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.mark_wasted_film (
  admin_user_id    uuid,
  admin_session_id uuid,
  attempt_id       uuid,
  operation_key    uuid,
  reason           text
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.test_and_waste_operation('mark_wasted_film',admin_user_id,admin_session_id,null,attempt_id,operation_key,null,null,reason);
$function$;

REVOKE ALL ON FUNCTION "public"."mark_wasted_film"(uuid, uuid, uuid, uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.prepare_booth_handoff (
  admin_user_id     uuid,
  admin_session_id  uuid,
  event_id          uuid,
  expected_revision integer,
  operation_key     uuid,
  connection_id     uuid,
  setup_evidence    jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor text := 'admin:'||admin_user_id::text;
  v_digest text;
  v_receipt public.operation_receipts%rowtype;
  v_event public.events%rowtype;
  v_stock bigint;
  v_allowance bigint;
  v_run uuid;
  v_grant uuid;
  v_handoff uuid;
  v_result jsonb;
begin
  if operation_key is null then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':prepare_booth_handoff:'||operation_key::text,0));
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id where p.id=admin_user_id and s.id=admin_session_id and (s.not_after is null or s.not_after>statement_timestamp())) then raise exception 'forbidden' using errcode='42501'; end if;
  if event_id is null or expected_revision is null or connection_id is null then raise exception 'validation_error'; end if;
  if setup_evidence is null or jsonb_typeof(setup_evidence)<>'object' then raise exception 'not_ready'; end if;
  if setup_evidence - array['device_token_hash','camera_ready','printer_ready','guided_access_ready','printer_mode'] <> '{}'::jsonb
    or (setup_evidence->>'device_token_hash' ~ '^[0-9a-f]{64}$') is not true
    or setup_evidence->'camera_ready' is distinct from 'true'::jsonb
    or setup_evidence->'printer_ready' is distinct from 'true'::jsonb
    or setup_evidence->'guided_access_ready' is distinct from 'true'::jsonb
    -- #17 still gates every real-printer route. This contract is simulation only.
    or setup_evidence->>'printer_mode' is distinct from 'simulated' then raise exception 'not_ready'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('event_id',event_id,'expected_revision',expected_revision,'admin_session_id',admin_session_id,'connection_id',connection_id,'setup_evidence',setup_evidence)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='prepare_booth_handoff' and r.operation_key=prepare_booth_handoff.operation_key;
  if found then if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if; return v_receipt.result; end if;
  select * into v_event from public.events e where e.id=prepare_booth_handoff.event_id for update;
  if not found or v_event.deleted_at is not null or v_event.state not in ('Draft','Live') or v_event.revision<>expected_revision then raise exception 'state_conflict'; end if;
  if exists(select 1 from public.booth_runs r where r.event_id=v_event.id and r.state in ('Prepared','Active','PauseRequested')) then raise exception 'state_conflict'; end if;
  select on_hand into strict v_stock from public.film_stock_balance where id='00000000-0000-0000-0000-000000000001' for update;
  -- The stock lock serializes starts of different Events before the Live index.
  if exists(select 1 from public.events e where e.state='Live' and e.id<>v_event.id) then raise exception 'state_conflict'; end if;
  if exists(select 1 from public.print_attempts where state in ('Reserved','Accepted','Uncertain')) then raise exception 'pending_attempt'; end if;
  if v_stock<=0 or not exists(select 1 from public.print_attempts a where a.event_id=v_event.id and a.connection_id=prepare_booth_handoff.connection_id and a.kind='Test' and a.test_output_usable is true and a.state in ('Confirmed','AdminResolvedEjected') and not exists(select 1 from public.print_attempt_events h where h.attempt_id=a.id and h.state='WastedFilm')) then raise exception 'not_ready'; end if;
  select v_event.original_print_allowance+coalesce((select sum(quantity) from public.additional_print_entries x where x.event_id=v_event.id),0)-count(*) into v_allowance from public.print_attempts a where a.event_id=v_event.id and a.kind='Guest' and a.state in ('Confirmed','AdminResolvedEjected') and not exists(select 1 from public.print_attempt_events h where h.attempt_id=a.id and h.state='WastedFilm');
  if v_allowance<=0 then raise exception 'not_ready'; end if;
  insert into public.booth_runs(event_id,state,connection_id) values(v_event.id,'Prepared',prepare_booth_handoff.connection_id) returning id into v_run;
  insert into public.booth_grants(event_id,run_id,expires_at) values(v_event.id,v_run,statement_timestamp()+interval '5 minutes') returning id into v_grant;
  insert into public.booth_handoffs(event_id,run_id,grant_id,admin_user_id,admin_session_id,device_token_hash,expires_at) values(v_event.id,v_run,v_grant,admin_user_id,admin_session_id,setup_evidence->>'device_token_hash',statement_timestamp()+interval '5 minutes') returning id into v_handoff;
  update public.events set state='Live',revision=revision+1 where id=v_event.id returning * into v_event;
  v_result:=jsonb_build_object('event_id',v_event.id,'event_state',v_event.state,'run_id',v_run,'run_state','Prepared','revision',v_event.revision,'handoff_id',v_handoff);
  return private.record_run_operation(v_event.id,v_actor,'prepare_booth_handoff',operation_key,v_digest,v_result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_test_attempt (
  admin_user_id    uuid,
  admin_session_id uuid,
  event_id         uuid,
  operation_key    uuid,
  connection_id    uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.test_and_waste_operation('reserve_test_attempt',admin_user_id,admin_session_id,event_id,null,operation_key,connection_id,null,null);
$function$;

REVOKE ALL ON FUNCTION "public"."reserve_test_attempt"(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "public"."print_attempts"
  ADD CONSTRAINT "print_attempts_test_output_only" CHECK (((kind = 'Test'::text) OR (test_output_usable IS NULL)));

REVOKE ALL ON FUNCTION "private"."test_and_waste_operation"(text, uuid, uuid, uuid, uuid, uuid, uuid, boolean, text) FROM PUBLIC, "anon", "authenticated", "service_role";

GRANT EXECUTE ON FUNCTION "public"."confirm_test_output"(uuid, uuid, uuid, uuid, boolean) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."mark_wasted_film"(uuid, uuid, uuid, uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."reserve_test_attempt"(uuid, uuid, uuid, uuid, uuid) TO "service_role";
