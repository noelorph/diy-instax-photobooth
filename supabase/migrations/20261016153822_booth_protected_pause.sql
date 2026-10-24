-- Protected same-device handoff: preserve an in-flight attempt until its outcome.
CREATE OR REPLACE FUNCTION public.request_booth_pause(grant_hash text, run_id uuid, operation_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
  v_grant public.booth_grants%rowtype;
  v_event public.events%rowtype;
  v_run public.booth_runs%rowtype;
  v_receipt public.operation_receipts%rowtype;
  v_actor text;
  v_digest text;
  v_result jsonb;
begin
  if operation_key is null or run_id is null then raise exception 'validation_error'; end if;
  select * into v_grant from public.booth_grants g where g.secret_hash=grant_hash;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  v_actor:='booth:'||v_grant.id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':request_booth_pause:'||operation_key::text,0));
  select * into strict v_event from public.events e where e.id=v_grant.event_id for update;
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
REVOKE ALL ON FUNCTION public.request_booth_pause(text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_booth_pause(text,uuid,uuid) TO service_role;
