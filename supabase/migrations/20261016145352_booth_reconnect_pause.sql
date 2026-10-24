-- Reconnect is a stop-only Booth operation. Pending Guest attempts retain
-- their holds as Uncertain; only Admin inspection may subsequently settle them.
-- PauseRequested reporting accepts final/uncertain evidence under the Event lock.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.print_outcome_operation (
  p_operation     text,
  p_hash          text,
  p_admin         uuid,
  p_admin_session uuid,
  p_attempt       uuid,
  p_key           uuid,
  p_observation   text,
  p_evidence      text,
  p_observed_at   timestamp with time zone,
  p_outcome       text,
  p_reason        text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_attempt public.print_attempts%rowtype;
  v_event public.events%rowtype;
  v_grant public.booth_grants%rowtype;
  v_run public.booth_runs%rowtype;
  v_receipt public.operation_receipts%rowtype;
  v_actor text;
  v_digest text;
  v_target text;
  v_reason text := nullif(btrim(p_reason,E' \t\n\r'),'');
  v_diagnostic boolean := false;
  v_changed boolean := false;
  v_result jsonb;
begin
  if p_key is null or p_attempt is null or p_operation is null or p_operation not in ('report_booth_observation','report_test_observation','resolve_uncertain_print') then raise exception 'validation_error'; end if;
  if p_operation='report_booth_observation' then
    select * into v_grant from public.booth_grants where secret_hash=p_hash;
    if not found then raise exception 'forbidden' using errcode='42501'; end if;
    v_actor:='booth:'||v_grant.id::text;
  else
    v_actor:='admin:'||p_admin::text;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':'||p_operation||':'||p_key::text,0));
  -- Initial lookup discovers the Event only. No attempt row lock before stock.
  select * into v_attempt from public.print_attempts where id=p_attempt;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  select * into strict v_event from public.events where id=v_attempt.event_id for update;
  if p_operation='report_booth_observation' then
    select * into v_grant from public.booth_grants where id=v_grant.id;
    if v_grant.state<>'Active' or v_grant.revoked_at is not null or v_grant.secret_hash is distinct from p_hash then raise exception 'forbidden' using errcode='42501'; end if;
    if v_grant.expires_at<=clock_timestamp() then raise exception 'grant_expired' using errcode='42501'; end if;
    if v_attempt.kind<>'Guest' or v_attempt.event_id<>v_grant.event_id or v_attempt.run_id<>v_grant.run_id then raise exception 'forbidden' using errcode='42501'; end if;
    select * into strict v_run from public.booth_runs where id=v_grant.run_id and event_id=v_event.id;
    if v_event.state<>'Live' or v_event.deleted_at is not null or v_run.state not in ('Active','PauseRequested') then raise exception 'state_conflict'; end if;
  else
    -- Check current Admin authority after Event locking and before receipt replay.
    if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id where p.id=p_admin and s.id=p_admin_session and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception 'forbidden' using errcode='42501'; end if;
    if p_operation='report_test_observation' and v_attempt.kind<>'Test' then raise exception 'forbidden' using errcode='42501'; end if;
  end if;
  perform 1 from public.film_stock_balance where id='00000000-0000-0000-0000-000000000001' for update;
  select * into strict v_attempt from public.print_attempts where id=p_attempt for update;
  if v_attempt.session_id is not null then perform 1 from public.guest_sessions where id=v_attempt.session_id for update; end if;
  if p_operation='report_booth_observation' and v_run.state='PauseRequested' and (v_attempt.state not in ('Reserved','Accepted') or p_observation='commandAccepted') then raise exception 'state_conflict'; end if;
  if p_operation='report_test_observation' and v_attempt.state in ('Reserved','Accepted','Uncertain') and v_attempt.initiating_admin_session_id is distinct from p_admin_session then raise exception 'forbidden' using errcode='42501'; end if;

  if p_operation='resolve_uncertain_print' then
    if p_outcome is null or p_outcome not in ('ejected','unused') or v_reason is null or length(v_reason)>1000 then raise exception 'validation_error'; end if;
    v_target:=case p_outcome when 'ejected' then 'AdminResolvedEjected' else 'AdminResolvedUnused' end;
  else
    if p_observation is null or p_observed_at is null or not isfinite(p_observed_at) then raise exception 'validation_error'; end if;
    -- Codes are a narrow vocabulary, never arbitrary status payloads or photo data.
    if p_evidence is null or p_evidence is distinct from (case p_observation
      when 'commandAccepted' then 'command_acknowledged'
      when 'preFilmRejected' then 'pre_film_rejection'
      when 'knownUnsent' then 'command_not_started'
      when 'uncertain' then 'ambiguous_outcome'
      when 'physicalEjectionVerified' then 'simulator_ejection'
      else null end) then raise exception 'invalid_evidence'; end if;
    v_target:=case p_observation when 'commandAccepted' then 'Accepted'
      when 'preFilmRejected' then 'RejectedUnused' when 'knownUnsent' then 'RejectedUnused'
      when 'uncertain' then 'Uncertain' when 'physicalEjectionVerified' then 'Confirmed' end;
  end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('attempt_id',p_attempt,'observation',p_observation,'evidence',p_evidence,
    'observed_at',extract(epoch from p_observed_at),'outcome',p_outcome,'reason',v_reason)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts where actor_scope=v_actor and operation_kind=p_operation and operation_key=p_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;

  if v_attempt.state=v_target then
    -- Matching repeated transition under a new key cannot duplicate its effect.
    null;
  elsif p_operation='resolve_uncertain_print' then
    if v_attempt.state<>'Uncertain' then raise exception 'state_conflict'; end if;
    v_changed:=true;
  elsif v_attempt.state in ('RejectedUnused','Confirmed','AdminResolvedEjected','AdminResolvedUnused','WastedFilm') then
    v_diagnostic:=true;
  elsif v_attempt.state='Uncertain' then
    -- Once uncertain, only physical inspection by an Admin can settle the hold.
    raise exception 'state_conflict';
  elsif v_attempt.state in ('Reserved','Accepted') then
    if v_target='Confirmed' and not exists(select 1 from public.printer_completion_policy where id and mode='simulated') then raise exception 'invalid_evidence'; end if;
    v_changed:=true;
  else
    raise exception 'state_conflict';
  end if;
  if v_changed then
    if v_target in ('Confirmed','AdminResolvedEjected') then
      insert into public.film_stock_entries(event_id,attempt_id,kind,signed_sheets,actor_scope)
        values(v_event.id,p_attempt,'Consumption',-1,v_actor);
      update public.film_stock_balance set on_hand=on_hand-1,revision=revision+1 where id='00000000-0000-0000-0000-000000000001';
    end if;
    update public.print_attempts set state=v_target,
      accepted_at=case when v_target='Accepted' then p_observed_at else accepted_at end,
      resolved_at=case when v_target in ('RejectedUnused','Confirmed','AdminResolvedEjected','AdminResolvedUnused') then statement_timestamp() else resolved_at end
      where id=p_attempt;
    if v_attempt.kind='Guest' then
      if v_target in ('Confirmed','AdminResolvedEjected') then
        update public.guest_sessions set state='Printed',closed_at=statement_timestamp() where id=v_attempt.session_id;
      elsif v_target='AdminResolvedUnused' then
        update public.guest_sessions set state='Abandoned',closed_at=statement_timestamp() where id=v_attempt.session_id;
      elsif v_target='Uncertain' then
        update public.booth_runs set state='PauseRequested' where id=v_attempt.run_id and state='Active';
      end if;
    end if;
    insert into public.print_attempt_events(attempt_id,actor_scope,state,evidence_kind,reason,observed_at)
      values(p_attempt,v_actor,v_target,case when p_operation='resolve_uncertain_print' then 'admin_inspection' else p_evidence end,v_reason,p_observed_at);
    perform private.settle_booth_pause(v_event.id);
  elsif v_diagnostic then
    insert into public.print_attempt_events(attempt_id,actor_scope,state,evidence_kind,observed_at)
      values(p_attempt,v_actor,'Diagnostic',p_evidence,p_observed_at);
  end if;
  v_result:=jsonb_build_object('attempt_id',p_attempt,'state',case when v_changed then v_target else v_attempt.state end,
    'diagnostic',v_diagnostic,'allowance_hold',case when (case when v_changed then v_target else v_attempt.state end) in ('Reserved','Accepted','Uncertain') and v_attempt.kind='Guest' then 1 else 0 end,
    'film_hold',case when (case when v_changed then v_target else v_attempt.state end) in ('Reserved','Accepted','Uncertain') then 1 else 0 end,
    'availability',private.guest_availability(v_event.id),'on_hand',(select on_hand from public.film_stock_balance),
    'revision',(select revision from public.events where id=v_event.id));
  insert into public.activity_events(event_id,attempt_id,actor_scope,operation_kind) values(v_event.id,p_attempt,v_actor,p_operation);
  insert into public.operation_receipts(event_id,actor_scope,operation_kind,operation_key,input_digest,result) values(v_event.id,v_actor,p_operation,p_key,v_digest,v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pause_booth_for_reconnect (
  grant_hash    text,
  run_id        uuid,
  operation_key uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_grant public.booth_grants%rowtype;
  v_event public.events%rowtype;
  v_run public.booth_runs%rowtype;
  v_attempt public.print_attempts%rowtype;
  v_actor text;
  v_digest text;
  v_result jsonb;
begin
  if operation_key is null or run_id is null then raise exception 'validation_error'; end if;
  select * into v_grant from public.booth_grants g where g.secret_hash=grant_hash;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  v_actor:='booth:'||v_grant.id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':pause_booth_for_reconnect:'||operation_key::text,0));
  -- Revalidate all proof after the Event lock. A revoked-grant retry fails closed.
  select * into strict v_event from public.events e where e.id=v_grant.event_id for update;
  select * into v_grant from public.booth_grants g where g.id=v_grant.id;
  if v_grant.state<>'Active' or v_grant.revoked_at is not null or v_grant.secret_hash is distinct from grant_hash or v_grant.run_id<>run_id then raise exception 'forbidden' using errcode='42501'; end if;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'grant_expired' using errcode='42501'; end if;
  select * into v_run from public.booth_runs r where r.id=v_grant.run_id and r.event_id=v_event.id;
  if not found or v_run.state<>'Active' or v_event.state<>'Live' or v_event.deleted_at is not null then raise exception 'state_conflict'; end if;
  -- Use the same Event -> stock -> attempt -> Session order as reservation/outcomes.
  perform 1 from public.film_stock_balance where id='00000000-0000-0000-0000-000000000001' for update;
  select * into v_attempt from public.print_attempts a where a.run_id=v_run.id and a.event_id=v_event.id and a.kind='Guest' and a.state in ('Reserved','Accepted','Uncertain') for update;
  if found and v_attempt.state in ('Reserved','Accepted') then
    perform 1 from public.guest_sessions where id=v_attempt.session_id for update;
    update public.print_attempts set state='Uncertain' where id=v_attempt.id;
    insert into public.print_attempt_events(attempt_id,actor_scope,state,evidence_kind,observed_at)
      values(v_attempt.id,v_actor,'Uncertain','connection_changed',statement_timestamp());
    v_attempt.state:='Uncertain';
  end if;
  update public.booth_runs set state='PauseRequested' where id=v_run.id;
  perform private.settle_booth_pause(v_event.id);
  v_digest:=encode(sha256(convert_to(jsonb_build_object('run_id',run_id)::text,'UTF8')),'hex');
  v_result:=jsonb_build_object('run_id',v_run.id,'state','Paused','attempt_id',v_attempt.id,'attempt_state',v_attempt.state,
    'revision',(select revision from public.events where id=v_event.id),'availability',private.guest_availability(v_event.id));
  return private.record_run_operation(v_event.id,v_actor,'pause_booth_for_reconnect',operation_key,v_digest,v_result);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."pause_booth_for_reconnect"(text, uuid, uuid) FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."pause_booth_for_reconnect"(text, uuid, uuid) TO "service_role";
