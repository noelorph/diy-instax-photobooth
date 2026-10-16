-- A fired shutter may reach the server after stop. This exception records only
-- metadata, once per just-abandoned Session; it grants no operational authority.
ALTER TABLE public.captures ADD COLUMN IF NOT EXISTS reported_after_stop boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS captures_one_after_stop_per_session ON public.captures(session_id) WHERE reported_after_stop;

CREATE OR REPLACE FUNCTION public.record_capture (
  grant_hash text,
  session_id uuid,
  operation_key uuid,
  captured_at timestamp with time zone
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
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
  if operation_key is null or session_id is null or captured_at is null or not isfinite(captured_at) then
    raise exception 'validation_error';
  end if;
  select * into v_grant from public.booth_grants g where g.secret_hash=grant_hash;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  v_actor:='booth:'||v_grant.id::text;
  -- Use the same actor/key lock as normal Capture recording, before the Event.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':record_capture:'||operation_key::text,0));
  select * into strict v_event from public.events e where e.id=v_grant.event_id for update;
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
REVOKE ALL ON FUNCTION public.record_capture(text,uuid,uuid,timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_capture(text,uuid,uuid,timestamp with time zone) TO service_role;
