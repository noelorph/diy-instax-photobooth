-- Terminal attempts end reservation eligibility for their Guest Session; original receipts still replay.
create or replace function private.package_reserve(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  s public.guest_sessions%rowtype; c public.captures%rowtype; session_id uuid; capture_id uuid;
  attempt_id uuid; actor text; replay jsonb; result jsonb; expected numeric;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['sessionId','captureId','expectedRevision'])
    or (p_payload-array['sessionId','captureId','expectedRevision'])<>'{}'
    or jsonb_typeof(p_payload->'sessionId')<>'string'
    or jsonb_typeof(p_payload->'captureId')<>'string'
    or jsonb_typeof(p_payload->'expectedRevision')<>'number' then raise exception 'invalid_input'; end if;
  begin session_id:=(p_payload->>'sessionId')::uuid; capture_id:=(p_payload->>'captureId')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_input'; end;
  expected:=(p_payload->>'expectedRevision')::numeric;
  if session_id is null or capture_id is null or expected<>trunc(expected) or expected not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(p_payload,'{expectedRevision}',to_jsonb(expected::integer));
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'reserve');
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'reserve',p_payload,e.revision);
  if replay is not null then return replay; end if;
  if expected::integer<>e.revision then raise exception 'stale_revision'; end if;
  select * into s from public.guest_sessions where id=session_id and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  if s.id is null or s.state<>'Open' or exists(select 1 from public.print_attempts where public.print_attempts.session_id=s.id and accounting_version=2 and state in ('Printed','NotPrinted')) then raise exception 'invalid_transition'; end if;
  select * into c from public.captures where id=capture_id and public.captures.session_id=s.id and run_id=r.id and accounting_version=2;
  if c.id is null or c.id is distinct from (select id from public.captures where public.captures.session_id=s.id and accounting_version=2 order by created_at desc,id desc limit 1) then raise exception 'invalid_transition'; end if;
  if not (private.package_readiness(e.id,'reserve')->>'ready')::boolean then raise exception 'not_ready'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id,printer_id,connection_generation)
    values(e.id,r.id,s.id,c.id,2,'Guest','Reserved',p_operation_id,gen_random_uuid(),r.printer_id,r.connection_generation) returning id into attempt_id;
  insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state) values(attempt_id,2,actor,'Reserved');
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('attemptId',attempt_id,'state','Reserved');
  insert into public.activity_events(event_id,attempt_id,accounting_version,actor_scope,operation_kind) values(e.id,attempt_id,2,actor,'reserve');
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,'reserve',p_payload,e.revision,result);
end $$;


-- Preserve concurrently arriving evidence after one actor settles the attempt.
create or replace function private.package_resolve_attempt(p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; r public.booth_runs%rowtype; a public.print_attempts%rowtype;
  eid uuid; aid uuid; actor text; replay jsonb; result jsonb; expected numeric; outcome text; reason text; target text; discrepancy boolean:=false;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['eventId','attemptId','outcome','inspectionReason','oldJobCleared','expectedRevision'])
    or (p_payload-array['eventId','attemptId','outcome','inspectionReason','oldJobCleared','expectedRevision'])<>'{}'
    or jsonb_typeof(p_payload->'eventId')<>'string' or jsonb_typeof(p_payload->'attemptId')<>'string'
    or jsonb_typeof(p_payload->'outcome')<>'string' or jsonb_typeof(p_payload->'inspectionReason')<>'string'
    or jsonb_typeof(p_payload->'oldJobCleared')<>'boolean' or jsonb_typeof(p_payload->'expectedRevision')<>'number' then raise exception 'invalid_input'; end if;
  begin eid:=(p_payload->>'eventId')::uuid; aid:=(p_payload->>'attemptId')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_input'; end;
  expected:=(p_payload->>'expectedRevision')::numeric; outcome:=p_payload->>'outcome'; reason:=btrim(p_payload->>'inspectionReason');
  if eid is null or aid is null or expected<>trunc(expected) or expected not between 1 and 2147483647
    or outcome not in ('printed','not_printed') or length(reason) not between 1 and 500 then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(jsonb_set(p_payload,'{expectedRevision}',to_jsonb(expected::integer)),'{inspectionReason}',to_jsonb(reason));
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=eid for update;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if e.id is null or e.accounting_version<>2 then raise exception 'operation_unavailable'; end if;
  actor:='admin:'||p_admin_user_id;
  replay:=private.package_receipt(actor,p_operation_id,'resolve_attempt',p_payload,e.revision);
  if replay is not null then return replay; end if;
  if e.state<>'Live' then raise exception 'operation_unavailable'; end if;
  select * into a from public.print_attempts where id=aid and event_id=e.id and accounting_version=2;
  if a.id is null then raise exception 'invalid_transition'; end if;
  select * into r from public.booth_runs where id=a.run_id and event_id=e.id and accounting_version=2 for update;
  select * into a from public.print_attempts where id=aid and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  if expected::integer<>e.revision and a.state not in ('Printed','NotPrinted') then raise exception 'stale_revision'; end if;
  if r.state not in ('Active','Paused','Finishing') then raise exception 'invalid_transition'; end if;
  if not exists(select 1 from public.printer_completion_policy where id and mode='simulated') then raise exception 'qualification_required'; end if;
  target:=case outcome when 'printed' then 'Printed' else 'NotPrinted' end;
  if a.state in ('Printed','NotPrinted') then
    discrepancy:=a.state<>target;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,actor_id,state,evidence_kind,evidence_policy_version,reason)
      values(a.id,2,actor,p_admin_user_id,case when discrepancy then 'Discrepancy' else 'Diagnostic' end,'inspection','simulator-v1',reason);
    if discrepancy then update public.booth_runs set blockers=array_append(blockers,'evidence_discrepancy') where id=r.id and not ('evidence_discrepancy'=any(blockers)); end if;
  elsif a.state='Pending' then
    if target='NotPrinted' and p_payload->>'oldJobCleared'<>'true' then raise exception 'not_ready'; end if;
    update public.print_attempts set state=target,resolved_at=clock_timestamp(),evidence_policy_version='simulator-v1' where id=a.id;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,actor_id,state,evidence_kind,evidence_policy_version,reason)
      values(a.id,2,actor,p_admin_user_id,target,'inspection','simulator-v1',reason);
    update public.booth_runs set old_job_safety_confirmed=(target='NotPrinted') where id=r.id;
  else raise exception 'invalid_transition'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  update public.events set revision=revision+1 where id=e.id returning * into e;
  if a.state='Pending' then
    perform private.package_finish_if_clear(e.id,r.id);
    select * into e from public.events where id=e.id;
  end if;
  result:=jsonb_build_object('attemptId',a.id,'state',(select state from public.print_attempts where id=a.id),'discrepancy',discrepancy);
  insert into public.activity_events(event_id,attempt_id,accounting_version,actor_scope,operation_kind) values(e.id,a.id,2,actor,'resolve_attempt');
  return private.package_commit_receipt(e.id,actor,p_operation_id,'resolve_attempt',p_payload,e.revision,result);
end $$;

-- Legacy RPCs remain available for v1 only and share the v2 guard before Event locks.

CREATE OR REPLACE FUNCTION private.guest_operation(p_kind text, p_hash text, p_run uuid, p_session uuid, p_capture uuid, p_key uuid, p_captured_at timestamp with time zone)
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
  perform 1 from private.booth_contract_guard where id for update;
  if p_key is null or p_kind not in ('open_guest_session','record_capture','abandon_guest_session','reserve_guest_attempt') then raise exception 'validation_error'; end if;
  select * into v_grant from public.booth_grants where secret_hash=p_hash;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  v_actor:='booth:'||v_grant.id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':'||p_kind||':'||p_key::text,0));
  -- Pause and all accounting transitions also lock this Event first.
  select * into v_event from public.events where id=v_grant.event_id for update;
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
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
  if p_kind in ('open_guest_session','reserve_guest_attempt') and exists(select 1 from public.booth_runs where accounting_version=2 and state<>'Finished') then raise exception 'state_conflict'; end if;
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

CREATE OR REPLACE FUNCTION private.print_outcome_operation(p_operation text, p_hash text, p_admin uuid, p_admin_session uuid, p_attempt uuid, p_key uuid, p_observation text, p_evidence text, p_observed_at timestamp with time zone, p_outcome text, p_reason text)
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
  perform 1 from private.booth_contract_guard where id for update;
  if p_key is null or p_attempt is null or p_operation is null or p_operation not in ('report_booth_observation','report_test_observation','resolve_uncertain_print','recover_interrupted_print') then raise exception 'validation_error'; end if;
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
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
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

  if p_operation='recover_interrupted_print' then
    if v_reason is null or length(v_reason)>1000 then raise exception 'validation_error'; end if;
    v_target:='Uncertain';
  elsif p_operation='resolve_uncertain_print' then
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

  if p_operation='recover_interrupted_print' then
    if v_attempt.state not in ('Reserved','Accepted') then raise exception 'state_conflict'; end if;
    v_changed:=true;
  elsif v_attempt.state=v_target then
    -- Matching repeated transition under a new key cannot duplicate its effect.
    null;
  elsif p_operation='resolve_uncertain_print' then
    if v_attempt.state<>'Uncertain' then raise exception 'state_conflict'; end if;
    if v_target='AdminResolvedEjected' and not exists(select 1 from public.printer_completion_policy where id and mode='simulated') then raise exception 'invalid_evidence'; end if;
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
      values(p_attempt,v_actor,v_target,case when p_operation='resolve_uncertain_print' then 'admin_inspection' when p_operation='recover_interrupted_print' then 'admin_interruption_recovery' else p_evidence end,v_reason,p_observed_at);
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

CREATE OR REPLACE FUNCTION private.test_and_waste_operation(p_operation text, p_admin uuid, p_admin_session uuid, p_event uuid, p_attempt uuid, p_key uuid, p_connection uuid, p_usable boolean, p_reason text)
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
  perform 1 from private.booth_contract_guard where id for update;
  if p_key is null or p_operation is null or p_operation not in ('reserve_test_attempt','confirm_test_output','mark_wasted_film') then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':'||p_operation||':'||p_key::text,0));
  -- A service credential alone is insufficient. Recheck live Admin authority,
  -- including session revocation, before returning any cached operation receipt.
  if not exists(select 1 from public.admin_profiles a join auth.sessions s on s.user_id=a.id
    where a.id=p_admin and s.id=p_admin_session and (s.not_after is null or s.not_after>clock_timestamp())) then
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
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
  if p_operation='reserve_test_attempt' and exists(select 1 from public.booth_runs where accounting_version=2 and state<>'Finished') then raise exception 'state_conflict'; end if;
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

CREATE OR REPLACE FUNCTION public.add_event_prints(admin_user_id uuid, admin_session_id uuid, event_id uuid, operation_key uuid, quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null then raise exception 'validation_error'; end if;
  -- The actor/kind/key lock also serializes changed-input retries across Events.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor || ':add_event_prints:' || operation_key::text, 0));
  if not exists (
    select 1 from public.admin_profiles p join auth.sessions s on s.user_id = p.id
    where p.id = admin_user_id and s.id = admin_session_id
      and (s.not_after is null or s.not_after > clock_timestamp())
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
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.begin_event_redaction(admin_user_id uuid, admin_session_id uuid, event_id uuid, expected_revision integer, operation_key uuid, action text, replacement_title text DEFAULT NULL::text)
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
  v_result jsonb;
  v_title text := btrim(replacement_title,E' \t\n\r');
begin
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null or event_id is null or expected_revision is null or expected_revision<1 or action is null or action not in ('redact_client','delete_draft') or
    (replacement_title is not null and (action<>'redact_client' or v_title='' or length(v_title)>1000)) then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':begin_event_redaction:'||operation_key::text,0));
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id where p.id=admin_user_id and s.id=admin_session_id and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception 'forbidden' using errcode='42501'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('event_id',event_id,'revision',expected_revision,'action',action,'replacement_title',v_title)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='begin_event_redaction' and r.operation_key=begin_event_redaction.operation_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  select * into v_event from public.events e where e.id=event_id for update;
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
  if not found or v_event.revision<>expected_revision or
    (action='delete_draft' and v_event.state<>'Draft') or (action='redact_client' and v_event.state not in ('Completed','Cancelled')) or v_event.media_removal_state='complete' then raise exception 'state_conflict'; end if;
  if exists(select 1 from public.print_attempts a where a.event_id=begin_event_redaction.event_id and a.state in ('Reserved','Accepted','Uncertain')) then raise exception 'pending_attempt'; end if;
  if v_event.media_removal_state='none' then
    update public.events e set client_name=null,client_email=null,client_phone=null,
      title=case when action='delete_draft' then null else coalesce(v_title,e.title) end,
      venue_address=case when action='delete_draft' then null else e.venue_address end,
      time_zone=case when action='delete_draft' then null else e.time_zone end,
      starts_at=case when action='delete_draft' then null else e.starts_at end,
      ends_at=case when action='delete_draft' then null else e.ends_at end,
      deleted_at=case when action='delete_draft' then statement_timestamp() else null end,
      redacted_at=case when action='redact_client' then statement_timestamp() else null end,
      media_removal_state='pending',revision=e.revision+1
      where e.id=event_id returning * into v_event;
    insert into public.activity_events(event_id,actor_scope,operation_kind) values(event_id,v_actor,action);
  elsif replacement_title is not null then
    -- A retry with a fresh key may resume cleanup, but cannot alter the erasure.
    raise exception 'state_conflict';
  end if;
  v_result:=jsonb_build_object('event_id',event_id,'revision',v_event.revision,'media_removal_state',v_event.media_removal_state);
  insert into public.operation_receipts(event_id,actor_scope,operation_kind,operation_key,input_digest,result)
    values(event_id,v_actor,'begin_event_redaction',operation_key,v_digest,v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.change_event_run(admin_user_id uuid, admin_session_id uuid, event_id uuid, expected_revision integer, operation_key uuid, action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor text:='admin:'||admin_user_id::text;
  v_digest text;
  v_receipt public.operation_receipts%rowtype;
  v_event public.events%rowtype;
  v_run public.booth_runs%rowtype;
  v_result jsonb;
begin
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':change_event_run:'||operation_key::text,0));
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id where p.id=admin_user_id and s.id=admin_session_id and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception 'forbidden' using errcode='42501'; end if;
  if event_id is null or expected_revision is null or action is null or action not in ('pause','complete','cancel') then raise exception 'validation_error'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('event_id',event_id,'expected_revision',expected_revision,'action',action)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='change_event_run' and r.operation_key=change_event_run.operation_key;
  if found then if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if; return v_receipt.result; end if;
  select * into v_event from public.events e where e.id=change_event_run.event_id for update;
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
  if not found or v_event.deleted_at is not null or v_event.revision<>expected_revision or v_event.state not in ('Draft','Live') or (action in ('pause','complete') and v_event.state<>'Live') then raise exception 'state_conflict'; end if;
  select * into v_run from public.booth_runs where booth_runs.event_id=v_event.id order by created_at desc,id desc limit 1 for update;
  if action='pause' then
    if v_run.id is null or v_run.state not in ('Prepared','Active','PauseRequested','Paused') then raise exception 'state_conflict'; end if;
    if v_run.state in ('Prepared','Active') then update public.booth_runs set state='PauseRequested' where id=v_run.id; end if;
    update public.events set revision=revision+1 where id=v_event.id;
    perform private.settle_booth_pause(v_event.id);
  else
    if exists(select 1 from public.print_attempts where print_attempts.event_id=v_event.id and state in ('Reserved','Accepted','Uncertain')) then raise exception 'pending_attempt'; end if;
    update public.events set state=case when action='complete' then 'Completed' else 'Cancelled' end,revision=revision+1 where id=v_event.id;
    update public.booth_runs set state='Ended',ended_at=statement_timestamp() where booth_runs.event_id=v_event.id and state<>'Ended';
    update public.booth_grants set state='Revoked',revoked_at=statement_timestamp() where booth_grants.event_id=v_event.id and state<>'Revoked';
    update public.booth_handoffs set state='Failed' where booth_handoffs.event_id=v_event.id and state<>'Failed';
    update public.guest_sessions set state='Abandoned',closed_at=statement_timestamp() where guest_sessions.event_id=v_event.id and state='Open';
  end if;
  select * into strict v_event from public.events where id=v_event.id;
  select * into v_run from public.booth_runs where id=v_run.id;
  v_result:=jsonb_build_object('event_id',v_event.id,'event_state',v_event.state,'run_id',v_run.id,'run_state',v_run.state,'revision',v_event.revision);
  return private.record_run_operation(v_event.id,v_actor,'change_event_run',operation_key,v_digest,v_result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_event_redaction(admin_user_id uuid, admin_session_id uuid, event_id uuid, operation_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_event public.events%rowtype; v_actor text:='admin:'||admin_user_id::text; v_receipt public.operation_receipts%rowtype; v_result jsonb; v_digest text;
begin
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null or event_id is null then raise exception 'validation_error'; end if;
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id where p.id=admin_user_id and s.id=admin_session_id and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception 'forbidden' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':complete_event_redaction:'||operation_key::text,0));
  v_digest:=encode(sha256(convert_to(event_id::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='complete_event_redaction' and r.operation_key=complete_event_redaction.operation_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  select * into v_event from public.events e where e.id=event_id for update;
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
  if not found or v_event.media_removal_state='none' or not exists(select 1 from public.operation_receipts r where r.event_id=complete_event_redaction.event_id and r.actor_scope=v_actor and r.operation_kind='begin_event_redaction' and r.operation_key=complete_event_redaction.operation_key) then raise exception 'state_conflict'; end if;
  -- Storage objects must be deleted via its API, never by deleting metadata SQL.
  -- A server bug cannot claim completion with objects still present.
  if exists(select 1 from storage.objects o where o.bucket_id='event_media' and starts_with(o.name,event_id::text||'/')) then raise exception 'state_conflict'; end if;
  if v_event.media_removal_state='pending' then
    update public.events e set media_removal_state='complete',revision=e.revision+1 where e.id=event_id returning * into v_event;
    insert into public.activity_events(event_id,actor_scope,operation_kind) values(event_id,v_actor,'event_media_removed');
  end if;
  v_result:=jsonb_build_object('event_id',event_id,'revision',v_event.revision,'media_removal_state',v_event.media_removal_state);
  insert into public.operation_receipts(event_id,actor_scope,operation_kind,operation_key,input_digest,result)
    values(event_id,v_actor,'complete_event_redaction',operation_key,v_digest,v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_booth_handoff(handoff_id uuid, grant_hash text, operation_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_h public.booth_handoffs%rowtype;
  v_grant public.booth_grants%rowtype;
  v_event public.events%rowtype;
  v_run public.booth_runs%rowtype;
  v_receipt public.operation_receipts%rowtype;
  v_actor text:='handoff:'||handoff_id::text;
  v_digest text;
  v_result jsonb;
  v_error text;
begin
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null or handoff_id is null then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':confirm_booth_handoff:'||operation_key::text,0));
  select * into v_h from public.booth_handoffs h where h.id=handoff_id;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_event from public.events where id=v_h.event_id for update;
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
  select * into v_h from public.booth_handoffs h where h.id=handoff_id for update;
  select * into strict v_grant from public.booth_grants where id=v_h.grant_id for update;
  select * into strict v_run from public.booth_runs where id=v_h.run_id for update;
  if grant_hash is null or v_grant.secret_hash is null or grant_hash<>v_grant.secret_hash then raise exception 'forbidden' using errcode='42501'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('handoff_id',handoff_id,'grant_hash',grant_hash)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='confirm_booth_handoff' and r.operation_key=confirm_booth_handoff.operation_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    if v_receipt.result->>'error' is null and (v_grant.state<>'Active' or v_run.state<>'Active' or v_event.state<>'Live' or v_grant.expires_at<=statement_timestamp()) then raise exception 'state_conflict'; end if;
    return v_receipt.result;
  end if;
  if v_h.state<>'Issued' or v_run.state<>'Prepared' or v_grant.state<>'Inactive' or v_event.state<>'Live' then raise exception 'state_conflict'; end if;
  if least(v_h.expires_at,v_grant.expires_at)<=statement_timestamp() then
    v_error:='handoff_expired';
    perform private.fail_booth_handoff(v_h.id);
    select * into strict v_event from public.events where id=v_h.event_id;
    v_run.state:='Paused';
  else
    update public.booth_handoffs set state='Confirmed' where id=v_h.id;
    update public.booth_grants set state='Active' where id=v_grant.id;
    update public.booth_runs set state='Active' where id=v_run.id;
    update public.events set revision=revision+1 where id=v_event.id returning * into v_event;
    v_run.state:='Active';
  end if;
  v_result:=jsonb_build_object('event_id',v_event.id,'event_state',v_event.state,'run_id',v_run.id,'run_state',v_run.state,'revision',v_event.revision,'handoff_id',v_h.id);
  if v_error is not null then v_result:=v_result||jsonb_build_object('error',v_error); end if;
  return private.record_run_operation(v_event.id,v_actor,'confirm_booth_handoff',operation_key,v_digest,v_result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_booth_handoff(handoff_id uuid, device_token_hash text, operation_key uuid, grant_hash text, expires_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_h public.booth_handoffs%rowtype;
  v_event public.events%rowtype;
  v_run public.booth_runs%rowtype;
  v_grant public.booth_grants%rowtype;
  v_receipt public.operation_receipts%rowtype;
  v_actor text:='handoff:'||handoff_id::text;
  v_digest text;
  v_error text;
  v_result jsonb;
begin
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null or handoff_id is null then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':finish_booth_handoff:'||operation_key::text,0));
  select * into v_h from public.booth_handoffs h where h.id=handoff_id;
  if not found or device_token_hash is distinct from v_h.device_token_hash then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_event from public.events where id=v_h.event_id for update;
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
  select * into v_h from public.booth_handoffs h where h.id=handoff_id for update;
  select * into strict v_run from public.booth_runs where id=v_h.run_id for update;
  select * into strict v_grant from public.booth_grants where id=v_h.grant_id for update;
  if v_grant.event_id<>v_h.event_id or v_grant.run_id<>v_h.run_id or v_run.event_id<>v_h.event_id then raise exception 'state_conflict'; end if;
  if grant_hash is null or grant_hash !~ '^[0-9a-f]{64}$' or expires_at is null or not isfinite(expires_at)  or expires_at>statement_timestamp()+interval '48 hours' then raise exception 'validation_error'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('handoff_id',handoff_id,'device_token_hash',device_token_hash,'grant_hash',grant_hash,'expires_at',expires_at)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='finish_booth_handoff' and r.operation_key=finish_booth_handoff.operation_key;
  if found and v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
  -- Expiry is authority validation, so it precedes successful receipt replay.
  if v_h.state in ('Prepared','Issued') and v_run.state='Prepared' and
    (v_h.expires_at<=statement_timestamp() or v_grant.expires_at<=statement_timestamp()) then
    perform private.fail_booth_handoff(v_h.id);
    select * into strict v_event from public.events where id=v_h.event_id;
    v_result:=jsonb_build_object('event_id',v_event.id,'event_state',v_event.state,'run_id',v_run.id,'run_state','Paused','revision',v_event.revision,'handoff_id',v_h.id,'error','handoff_expired');
    if v_receipt.id is not null then
      insert into public.activity_events(event_id,actor_scope,operation_kind) values(v_event.id,v_actor,'handoff_expired');
      return v_result;
    end if;
    return private.record_run_operation(v_event.id,v_actor,'finish_booth_handoff',operation_key,v_digest,v_result);
  end if;
  if v_receipt.id is not null then
    -- A prior receipt cannot restore authority after grant expiry or revocation.
    if v_receipt.result->>'error' is null and (
      v_event.state<>'Live' or v_grant.expires_at<=statement_timestamp()
      or v_grant.revoked_at is not null or v_grant.secret_hash is distinct from grant_hash
      or not ((v_h.state='Issued' and v_run.state='Prepared' and v_grant.state='Inactive')
        or (v_h.state='Confirmed' and v_run.state='Active' and v_grant.state='Active'))
    ) then raise exception 'state_conflict'; end if;
    return v_receipt.result;
  end if;
  if expires_at<=statement_timestamp() then raise exception 'validation_error'; end if;
  if v_h.state<>'Prepared' or v_run.state<>'Prepared' or v_event.state<>'Live' then raise exception 'state_conflict'; end if;
  if v_h.expires_at<=statement_timestamp() then v_error:='handoff_expired';
  elsif exists(select 1 from auth.sessions where id=v_h.admin_session_id and user_id=v_h.admin_user_id)
    or not exists(select 1 from public.admin_profiles where id=v_h.admin_user_id) then v_error:='handoff_failed'; end if;
  if v_error is not null then
    perform private.fail_booth_handoff(v_h.id);
    select * into strict v_event from public.events where id=v_h.event_id;
    v_run.state:='Paused';
  else
    update public.booth_grants set secret_hash=grant_hash,expires_at=finish_booth_handoff.expires_at where id=v_h.grant_id and state='Inactive';
    update public.booth_handoffs set state='Issued' where id=v_h.id;
  end if;
  v_result:=jsonb_build_object('event_id',v_event.id,'event_state',v_event.state,'run_id',v_run.id,'run_state',v_run.state,'revision',v_event.revision,'handoff_id',v_h.id);
  if v_error is not null then v_result:=v_result||jsonb_build_object('error',v_error); end if;
  return private.record_run_operation(v_event.id,v_actor,'finish_booth_handoff',operation_key,v_digest,v_result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pause_booth_for_reconnect(grant_hash text, run_id uuid, operation_key uuid)
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
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null or run_id is null then raise exception 'validation_error'; end if;
  select * into v_grant from public.booth_grants g where g.secret_hash=grant_hash;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  v_actor:='booth:'||v_grant.id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':pause_booth_for_reconnect:'||operation_key::text,0));
  -- Revalidate all proof after the Event lock. A revoked-grant retry fails closed.
  select * into strict v_event from public.events e where e.id=v_grant.event_id for update;
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
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

CREATE OR REPLACE FUNCTION public.prepare_booth_handoff(admin_user_id uuid, admin_session_id uuid, event_id uuid, expected_revision integer, operation_key uuid, connection_id uuid, setup_evidence jsonb)
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
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':prepare_booth_handoff:'||operation_key::text,0));
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id where p.id=admin_user_id and s.id=admin_session_id and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception 'forbidden' using errcode='42501'; end if;
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
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
  if exists(select 1 from public.booth_runs where accounting_version=2 and state<>'Finished') then raise exception 'state_conflict'; end if;
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

CREATE OR REPLACE FUNCTION public.record_capture(grant_hash text, session_id uuid, operation_key uuid, captured_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  v_id uuid;
  v_result jsonb;
begin
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null or session_id is null or captured_at is null or not isfinite(captured_at) then
    raise exception 'validation_error';
  end if;
  select * into v_grant from public.booth_grants g where g.secret_hash=grant_hash;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  v_actor:='booth:'||v_grant.id::text;
  -- Use the same actor/key lock as normal Capture recording, before the Event.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':record_capture:'||operation_key::text,0));
  select * into strict v_event from public.events e where e.id=v_grant.event_id for update;
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
  select * into v_grant from public.booth_grants g where g.id=v_grant.id;
  if v_grant.secret_hash is distinct from grant_hash then raise exception 'forbidden' using errcode='42501'; end if;
  if v_grant.state='Active' and v_grant.revoked_at is null then
    return private.guest_operation('record_capture',grant_hash,null,session_id,null,operation_key,captured_at);
  end if;
  -- Time bounds also apply to receipt replay: an expired proof has no authority.
  if v_grant.expires_at<=clock_timestamp() then raise exception 'grant_expired' using errcode='42501'; end if;
  if v_grant.state<>'Revoked' or v_grant.revoked_at is null
    or clock_timestamp()>v_grant.revoked_at+interval '2 minutes'
    or v_event.deleted_at is not null then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_run from public.booth_runs r where r.id=v_grant.run_id and r.event_id=v_event.id;
  if not found or v_run.state not in ('Paused','Ended') then raise exception 'forbidden' using errcode='42501'; end if;
  -- No stock lock: this path never reads or changes stock, holds, or allowance.
  select * into v_session from public.guest_sessions s
    where s.id=session_id and s.event_id=v_event.id and s.run_id=v_run.id for update;
  if not found or v_session.state<>'Abandoned' or v_session.closed_at is distinct from v_grant.revoked_at
    or captured_at<v_session.created_at or captured_at>v_grant.revoked_at
    or exists(select 1 from public.print_attempts a where a.session_id=v_session.id
      and a.state not in ('RejectedUnused','AdminResolvedUnused')) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  -- Match the existing normal-Capture digest so a lost response can replay after stop.
  v_digest:=encode(sha256(convert_to(jsonb_build_object('run_id',null,'session_id',session_id,'capture_id',null,
    'captured_at',extract(epoch from captured_at))::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r
    where r.actor_scope=v_actor and r.operation_kind='record_capture' and r.operation_key=record_capture.operation_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result||jsonb_build_object('session_state','Abandoned');
  end if;
  if exists(select 1 from public.captures c where c.session_id=v_session.id and c.reported_after_stop) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  insert into public.captures(event_id,run_id,session_id,captured_at,reported_after_stop)
    values(v_event.id,v_run.id,v_session.id,captured_at,true) returning id into v_id;
  v_result:=jsonb_build_object('session_id',v_session.id,'capture_id',v_id,
    'capture_count',(select count(*) from public.captures c where c.session_id=v_session.id),'session_state','Abandoned');
  insert into public.activity_events(event_id,actor_scope,operation_kind) values(v_event.id,v_actor,'record_capture');
  insert into public.operation_receipts(event_id,actor_scope,operation_kind,operation_key,input_digest,result)
    values(v_event.id,v_actor,'record_capture',operation_key,v_digest,v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_booth_pause(grant_hash text, run_id uuid, operation_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_grant public.booth_grants%rowtype;
  v_event public.events%rowtype;
  v_run public.booth_runs%rowtype;
  v_receipt public.operation_receipts%rowtype;
  v_actor text;
  v_digest text;
  v_result jsonb;
begin
  perform 1 from private.booth_contract_guard where id for update;
  if operation_key is null or run_id is null then raise exception 'validation_error'; end if;
  select * into v_grant from public.booth_grants g where g.secret_hash=grant_hash;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  v_actor:='booth:'||v_grant.id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':request_booth_pause:'||operation_key::text,0));
  select * into strict v_event from public.events e where e.id=v_grant.event_id for update;
  if v_event.accounting_version<>1 then raise exception 'state_conflict'; end if;
  select * into v_grant from public.booth_grants g where g.id=v_grant.id;
  if v_grant.state<>'Active' or v_grant.revoked_at is not null or v_grant.secret_hash is distinct from grant_hash or v_grant.run_id<>run_id then raise exception 'forbidden' using errcode='42501'; end if;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'grant_expired' using errcode='42501'; end if;
  select * into v_run from public.booth_runs r where r.id=v_grant.run_id and r.event_id=v_event.id;
  if not found or v_run.state not in ('Active','PauseRequested') or v_event.state<>'Live' or v_event.deleted_at is not null then raise exception 'state_conflict'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('run_id',run_id)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='request_booth_pause' and r.operation_key=request_booth_pause.operation_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  if v_run.state='Active' then
    update public.booth_runs set state='PauseRequested' where id=v_run.id;
    update public.events set revision=revision+1 where id=v_event.id;
  end if;
  perform private.settle_booth_pause(v_event.id);
  v_result:=jsonb_build_object('run_id',v_run.id,'state',(select state from public.booth_runs where id=v_run.id),'revision',(select revision from public.events where id=v_event.id));
  return private.record_run_operation(v_event.id,v_actor,'request_booth_pause',operation_key,v_digest,v_result);
end;
$function$;
