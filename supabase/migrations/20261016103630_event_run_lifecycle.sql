-- Event/run transitions are server-only and simulation-only until #17 qualifies
-- production physical completion. Handoff proofs contain hashes, never secrets.
-- admin_session_id deliberately has no FK: local sign-out removes that Auth row.
SET local check_function_bodies = off;

CREATE TABLE "public"."booth_handoffs" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"          uuid                     NOT NULL,
  "run_id"            uuid                     NOT NULL,
  "grant_id"          uuid                     NOT NULL,
  "admin_user_id"     uuid                     NOT NULL,
  "admin_session_id"  uuid                     NOT NULL,
  "device_token_hash" text                     NOT NULL,
  "state"             text                     NOT NULL DEFAULT 'Prepared'::text,
  "expires_at"        timestamp with time zone NOT NULL,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "booth_handoffs_device_token_hash_check" CHECK ((device_token_hash ~ '^[0-9a-f]{64}$'::text)),
  CONSTRAINT "booth_handoffs_expires_at_check" CHECK (isfinite(expires_at)),
  CONSTRAINT "booth_handoffs_grant_id_key" UNIQUE (grant_id),
  CONSTRAINT "booth_handoffs_pkey" PRIMARY KEY (id),
  CONSTRAINT "booth_handoffs_state_check" CHECK ((state = ANY (ARRAY['Prepared'::text, 'Issued'::text, 'Confirmed'::text, 'Failed'::text])))
);

ALTER TABLE "public"."booth_handoffs"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."booth_handoffs" FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.fail_booth_handoff (
  p_handoff_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_h public.booth_handoffs%rowtype;
begin
  -- Caller holds Event first, then handoff/run rows.
  select * into strict v_h from public.booth_handoffs where id=p_handoff_id;
  update public.booth_handoffs set state='Failed' where id=p_handoff_id;
  update public.booth_grants set state='Revoked',revoked_at=statement_timestamp() where id=v_h.grant_id and state<>'Revoked';
  update public.booth_runs set state='Paused' where id=v_h.run_id and state='Prepared';
  update public.events set revision=revision+1 where id=v_h.event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_run_operation (
  p_event  uuid,
  p_actor  text,
  p_kind   text,
  p_key    uuid,
  p_digest text,
  p_result jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  insert into public.activity_events(event_id,actor_scope,operation_kind) values (p_event,p_actor,p_kind);
  insert into public.operation_receipts(event_id,actor_scope,operation_kind,operation_key,input_digest,result)
    values(p_event,p_actor,p_kind,p_key,p_digest,p_result);
  return p_result;
end;
$function$;

-- Internal outcome hook: caller MUST already hold the Event row lock, acquired
-- before stock/attempt/session locks. Uncertain retains holds and its Open
-- Guest Session, while allowing protected pause and grant revocation.
CREATE OR REPLACE FUNCTION private.settle_booth_pause (
  p_event_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_run uuid;
begin
  select id into v_run from public.booth_runs where event_id=p_event_id and state='PauseRequested';
  if v_run is null or exists(select 1 from public.print_attempts where event_id=p_event_id and state in ('Reserved','Accepted')) then return; end if;
  update public.booth_runs set state='Paused' where id=v_run;
  update public.booth_grants set state='Revoked',revoked_at=statement_timestamp() where run_id=v_run and state<>'Revoked';
  update public.booth_handoffs set state='Failed' where run_id=v_run and state<>'Failed';
  update public.guest_sessions set state='Abandoned',closed_at=statement_timestamp() where run_id=v_run and state='Open' and not exists(select 1 from public.print_attempts a where a.session_id=guest_sessions.id and a.state in ('Reserved','Accepted','Uncertain'));
  update public.events set revision=revision+1 where id=p_event_id;
  insert into public.activity_events(event_id,actor_scope,operation_kind) values(p_event_id,'system','booth_paused');
end;
$function$;

CREATE OR REPLACE FUNCTION public.change_event_run (
  admin_user_id     uuid,
  admin_session_id  uuid,
  event_id          uuid,
  expected_revision integer,
  operation_key     uuid,
  action            text
)
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
  if operation_key is null then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':change_event_run:'||operation_key::text,0));
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id where p.id=admin_user_id and s.id=admin_session_id and (s.not_after is null or s.not_after>statement_timestamp())) then raise exception 'forbidden' using errcode='42501'; end if;
  if event_id is null or expected_revision is null or action is null or action not in ('pause','complete','cancel') then raise exception 'validation_error'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('event_id',event_id,'expected_revision',expected_revision,'action',action)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='change_event_run' and r.operation_key=change_event_run.operation_key;
  if found then if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if; return v_receipt.result; end if;
  select * into v_event from public.events e where e.id=change_event_run.event_id for update;
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

REVOKE ALL ON FUNCTION "public"."change_event_run"(uuid, uuid, uuid, integer, uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.confirm_booth_handoff (
  handoff_id    uuid,
  grant_hash    text,
  operation_key uuid
)
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
  if operation_key is null or handoff_id is null then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':confirm_booth_handoff:'||operation_key::text,0));
  select * into v_h from public.booth_handoffs h where h.id=handoff_id;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_event from public.events where id=v_h.event_id for update;
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

REVOKE ALL ON FUNCTION "public"."confirm_booth_handoff"(uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.finish_booth_handoff (
  handoff_id        uuid,
  device_token_hash text,
  operation_key     uuid,
  grant_hash        text,
  expires_at        timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_h public.booth_handoffs%rowtype;
  v_event public.events%rowtype;
  v_run public.booth_runs%rowtype;
  v_receipt public.operation_receipts%rowtype;
  v_actor text:='handoff:'||handoff_id::text;
  v_digest text;
  v_error text;
  v_result jsonb;
begin
  if operation_key is null or handoff_id is null then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':finish_booth_handoff:'||operation_key::text,0));
  select * into v_h from public.booth_handoffs h where h.id=handoff_id;
  if not found or device_token_hash is distinct from v_h.device_token_hash then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_event from public.events where id=v_h.event_id for update;
  select * into v_h from public.booth_handoffs h where h.id=handoff_id for update;
  select * into strict v_run from public.booth_runs where id=v_h.run_id for update;
  if grant_hash is null or grant_hash !~ '^[0-9a-f]{64}$' or expires_at is null or not isfinite(expires_at)  or expires_at>statement_timestamp()+interval '48 hours' then raise exception 'validation_error'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('handoff_id',handoff_id,'device_token_hash',device_token_hash,'grant_hash',grant_hash,'expires_at',expires_at)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='finish_booth_handoff' and r.operation_key=finish_booth_handoff.operation_key;
  if found and v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
  -- Expiry is authority validation, so it precedes successful receipt replay.
  if v_h.state in ('Prepared','Issued') and v_run.state='Prepared' and
    (v_h.expires_at<=statement_timestamp() or exists(select 1 from public.booth_grants where id=v_h.grant_id and booth_grants.expires_at<=statement_timestamp())) then
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
    if v_receipt.result->>'error' is null and (v_h.state not in ('Issued','Confirmed') or v_run.state not in ('Prepared','Active')) then raise exception 'state_conflict'; end if;
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

REVOKE ALL ON FUNCTION "public"."finish_booth_handoff"(uuid, text, uuid, text, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";

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
  if v_stock<=0 or not exists(select 1 from public.print_attempts a where a.event_id=v_event.id and a.connection_id=prepare_booth_handoff.connection_id and a.kind='Test' and a.state in ('Confirmed','AdminResolvedEjected') and not exists(select 1 from public.print_attempt_events h where h.attempt_id=a.id and h.state='WastedFilm')) then raise exception 'not_ready'; end if;
  select v_event.original_print_allowance+coalesce((select sum(quantity) from public.additional_print_entries x where x.event_id=v_event.id),0)-count(*) into v_allowance from public.print_attempts a where a.event_id=v_event.id and a.kind='Guest' and a.state in ('Confirmed','AdminResolvedEjected') and not exists(select 1 from public.print_attempt_events h where h.attempt_id=a.id and h.state='WastedFilm');
  if v_allowance<=0 then raise exception 'not_ready'; end if;
  insert into public.booth_runs(event_id,state) values(v_event.id,'Prepared') returning id into v_run;
  insert into public.booth_grants(event_id,run_id,expires_at) values(v_event.id,v_run,statement_timestamp()+interval '5 minutes') returning id into v_grant;
  insert into public.booth_handoffs(event_id,run_id,grant_id,admin_user_id,admin_session_id,device_token_hash,expires_at) values(v_event.id,v_run,v_grant,admin_user_id,admin_session_id,setup_evidence->>'device_token_hash',statement_timestamp()+interval '5 minutes') returning id into v_handoff;
  update public.events set state='Live',revision=revision+1 where id=v_event.id returning * into v_event;
  v_result:=jsonb_build_object('event_id',v_event.id,'event_state',v_event.state,'run_id',v_run,'run_state','Prepared','revision',v_event.revision,'handoff_id',v_handoff);
  return private.record_run_operation(v_event.id,v_actor,'prepare_booth_handoff',operation_key,v_digest,v_result);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."prepare_booth_handoff"(uuid, uuid, uuid, integer, uuid, uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "public"."booth_handoffs"
  ADD CONSTRAINT "booth_handoffs_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id);

ALTER TABLE "public"."booth_handoffs"
  ADD CONSTRAINT "booth_handoffs_grant_id_fkey" FOREIGN KEY (grant_id) REFERENCES public.booth_grants(id);

ALTER TABLE "public"."booth_handoffs"
  ADD CONSTRAINT "booth_handoffs_run_id_event_id_fkey" FOREIGN KEY (run_id, event_id) REFERENCES public.booth_runs(id, event_id);

CREATE INDEX booth_handoffs_event_idx ON public.booth_handoffs USING btree (event_id);

CREATE INDEX booth_handoffs_run_idx ON public.booth_handoffs USING btree (run_id, event_id);

CREATE UNIQUE INDEX booth_runs_one_running_idx ON public.booth_runs USING btree (event_id)
  WHERE (state = ANY (ARRAY['Prepared'::text, 'Active'::text, 'PauseRequested'::text]));

REVOKE ALL ON FUNCTION "private"."fail_booth_handoff"(uuid) FROM PUBLIC, "anon", "authenticated", "service_role";

REVOKE ALL ON FUNCTION "private"."record_run_operation"(uuid, text, text, uuid, text, jsonb) FROM PUBLIC, "anon", "authenticated", "service_role";

REVOKE ALL ON FUNCTION "private"."settle_booth_pause"(uuid) FROM PUBLIC, "anon", "authenticated", "service_role";

GRANT EXECUTE ON FUNCTION "public"."change_event_run"(uuid, uuid, uuid, integer, uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."confirm_booth_handoff"(uuid, text, uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."finish_booth_handoff"(uuid, text, uuid, text, timestamp WITH time zone) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."prepare_booth_handoff"(uuid, uuid, uuid, integer, uuid, uuid, jsonb) TO "service_role";

REVOKE ALL ON TABLE "public"."booth_handoffs" FROM "service_role";

GRANT SELECT ON TABLE "public"."booth_handoffs" TO "service_role";
