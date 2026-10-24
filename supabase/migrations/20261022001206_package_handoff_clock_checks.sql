-- Guard and Event lock waits can outlive the request-start timestamp.
-- Recheck every handoff and grant deadline against the current clock, including replay.
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
    if v_receipt.result->>'error' is null and (v_grant.state<>'Active' or v_run.state<>'Active' or v_event.state<>'Live' or v_grant.expires_at<=clock_timestamp()) then raise exception 'state_conflict'; end if;
    return v_receipt.result;
  end if;
  if v_h.state<>'Issued' or v_run.state<>'Prepared' or v_grant.state<>'Inactive' or v_event.state<>'Live' then raise exception 'state_conflict'; end if;
  if least(v_h.expires_at,v_grant.expires_at)<=clock_timestamp() then
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
  if grant_hash is null or grant_hash !~ '^[0-9a-f]{64}$' or expires_at is null or not isfinite(expires_at)  or expires_at>clock_timestamp()+interval '48 hours' then raise exception 'validation_error'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('handoff_id',handoff_id,'device_token_hash',device_token_hash,'grant_hash',grant_hash,'expires_at',expires_at)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='finish_booth_handoff' and r.operation_key=finish_booth_handoff.operation_key;
  if found and v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
  -- Expiry is authority validation, so it precedes successful receipt replay.
  if v_h.state in ('Prepared','Issued') and v_run.state='Prepared' and
    (v_h.expires_at<=clock_timestamp() or v_grant.expires_at<=clock_timestamp()) then
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
      v_event.state<>'Live' or v_grant.expires_at<=clock_timestamp()
      or v_grant.revoked_at is not null or v_grant.secret_hash is distinct from grant_hash
      or not ((v_h.state='Issued' and v_run.state='Prepared' and v_grant.state='Inactive')
        or (v_h.state='Confirmed' and v_run.state='Active' and v_grant.state='Active'))
    ) then raise exception 'state_conflict'; end if;
    return v_receipt.result;
  end if;
  if expires_at<=clock_timestamp() then raise exception 'validation_error'; end if;
  if v_h.state<>'Prepared' or v_run.state<>'Prepared' or v_event.state<>'Live' then raise exception 'state_conflict'; end if;
  if v_h.expires_at<=clock_timestamp() then v_error:='handoff_expired';
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

