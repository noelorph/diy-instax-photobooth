-- Order reports independently of clock resolution; a window can be submitted once.
alter table private.package_readiness_windows add column issuance_order bigint generated always as identity;
alter table public.booth_reload_requests add column load_fault_id uuid;
create unique index booth_reload_requests_fault_idx on public.booth_reload_requests(run_id,load_fault_id) where load_fault_id is not null;

create or replace function private.package_validate_readiness_report(p_payload jsonb,p_setup boolean) returns void
language plpgsql set search_path='' as $$
declare required text[]:=array['readinessWindowId','observedAgeMs','printerId','connectionGeneration','observation']; k text; o jsonb;
begin
  if p_setup then required:=required||array['eventId','deviceHash','filmLoadedConfirmed','powerConfirmed','guidedAccessConfirmed']; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or not (p_payload ?& required) or (p_payload-required)<>'{}' then raise exception 'invalid_input'; end if;
  if jsonb_typeof(p_payload->'readinessWindowId')<>'string' or (p_payload->>'readinessWindowId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_payload->'printerId')<>'string' or length(p_payload->>'printerId') not between 1 and 128 or p_payload->>'printerId' !~ '[^[:space:]]' then raise exception 'invalid_input'; end if;
  foreach k in array array['observedAgeMs','connectionGeneration'] loop
    if jsonb_typeof(p_payload->k)<>'number' or (p_payload->>k)::numeric<>trunc((p_payload->>k)::numeric) or (p_payload->>k)::numeric not between 0 and (case when k='observedAgeMs' then 5000 else 2147483647 end) then raise exception 'invalid_input'; end if;
  end loop;
  if p_setup then
    if jsonb_typeof(p_payload->'deviceHash')<>'string' or p_payload->>'deviceHash' !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input'; end if;
    foreach k in array array['filmLoadedConfirmed','powerConfirmed','guidedAccessConfirmed'] loop
      if jsonb_typeof(p_payload->k)<>'boolean' then raise exception 'invalid_input'; end if;
    end loop;
  end if;
  o:=p_payload->'observation';
  if jsonb_typeof(o)<>'object' or not (o ?& array['cameraPermission','cameraLive','serverReachable','printerConnected','printerReady','oldJobCleared']) or (o-array['cameraPermission','cameraLive','serverReachable','printerConnected','printerReady','oldJobCleared','mediaAvailable','loadFault','loadFaultId'])<>'{}' then raise exception 'invalid_input'; end if;
  foreach k in array array['cameraPermission','cameraLive','serverReachable','printerConnected','printerReady','oldJobCleared','mediaAvailable'] loop
    if o ? k and jsonb_typeof(o->k)<>'boolean' then raise exception 'invalid_input'; end if;
  end loop;
  if (o ? 'loadFault')<>(o ? 'loadFaultId') then raise exception 'invalid_input'; end if;
  if o ? 'loadFaultId' and (jsonb_typeof(o->'loadFaultId')<>'string' or o->>'loadFaultId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'invalid_input'; end if;
  if o ? 'loadFault' and (jsonb_typeof(o->'loadFault')<>'string' or o->>'loadFault' not in ('no_film','cover_open','load_change')) then raise exception 'invalid_input'; end if;
end $$;

create or replace function private.package_readiness(p_event_id uuid,p_stage text,p_attempt_id uuid default null) returns jsonb
language plpgsql volatile set search_path='' as $$
declare e public.events%rowtype; r public.booth_runs%rowtype; w private.package_readiness_windows%rowtype; b text[]; counts jsonb; own public.print_attempts%rowtype; s uuid; c uuid; checked_at timestamptz:=clock_timestamp();
begin
  if p_stage is null or p_stage not in ('setup','guest','reserve','dispatch','resume') then raise exception 'invalid_input'; end if;
  select * into e from public.events where id=p_event_id and accounting_version=2 and deleted_at is null;
  if not found then raise exception 'operation_unavailable'; end if;
  counts:=private.package_counts(p_event_id);
  select * into r from public.booth_runs where event_id=p_event_id and accounting_version=2 and state<>'Finished';
  if p_stage='setup' then
    select * into w from private.package_readiness_windows where event_id=p_event_id and run_id is null and reported_at is not null order by issuance_order desc limit 1;
    b:=private.package_equipment_blockers(coalesce(w.observation,'{}'),coalesce(w.expires_at>=checked_at,false),coalesce((w.observation->>'filmLoadedConfirmed')::boolean,false),coalesce((w.observation->>'powerConfirmed')::boolean,false),coalesce((w.observation->>'guidedAccessConfirmed')::boolean,false));
    if w.id is null or not exists(select 1 from public.admin_profiles a join auth.sessions s on s.user_id=a.id where a.id=w.admin_user_id and s.id=w.admin_session_id and (s.not_after is null or s.not_after>checked_at)) then b:=array_append(b,'access_required'); end if;
    if e.state not in ('Draft','Live') or e.booking_review_required or r.id is not null or exists(select 1 from public.events where state='Live' and id<>p_event_id) then b:=array_append(b,'setup_unavailable'); end if;
  else
    b:=private.package_equipment_blockers(coalesce(r.readiness_observation,'{}'),coalesce(r.observed_at between checked_at-interval '5 seconds' and checked_at and r.received_at between checked_at-interval '5 seconds' and checked_at and (r.readiness_observation->>'connectionGeneration')::integer=r.connection_generation,false),coalesce(r.film_loaded_confirmed,false),coalesce(r.power_confirmed,false),coalesce(r.guided_access_confirmed,false));
    if r.id is null or e.state<>'Live' or r.state<>(case when p_stage='resume' then 'Paused' else 'Active' end) then b:=array_append(b,'run_state'); end if;
    if not exists(select 1 from public.booth_grants g where g.run_id=r.id and g.accounting_version=2 and g.state='Active' and g.revoked_at is null and g.expires_at>checked_at and g.last_seen_at>checked_at-interval '24 hours' and g.device_hash=r.device_hash) then b:=array_append(b,'access_required'); end if;
    select id into s from public.guest_sessions where run_id=r.id and accounting_version=2 and state='Open';
    if p_stage in ('guest','resume') and s is not null then b:=array_append(b,'guest_session_open'); end if;
    if p_stage='reserve' then
      select id into c from public.captures where session_id=s and accounting_version=2 limit 1;
      if s is null or c is null then b:=array_append(b,'capture_required'); end if;
    end if;
    if p_stage='dispatch' then
      select * into own from public.print_attempts where id=p_attempt_id and event_id=p_event_id and run_id=r.id and accounting_version=2 and state='Reserved';
      if own.id is null or own.session_id is distinct from s or own.printer_id is distinct from r.printer_id or own.connection_generation is distinct from r.connection_generation or not exists(select 1 from public.captures where id=own.capture_id and session_id=s and accounting_version=2) then b:=array_append(b,'reserved_attempt_required'); end if;
    end if;
    b:=b||r.blockers;
  end if;
  if exists(select 1 from public.print_attempts where state in ('Reserved','Dispatching','Accepted','Pending','Uncertain') and (p_stage<>'dispatch' or id is distinct from own.id)) then b:=array_append(b,'print_pending'); end if;
  if p_stage<>'dispatch' and (counts->>'printsAvailable')::bigint<=0 then b:=array_append(b,'booked_prints_exhausted'); end if;
  select coalesce(array_agg(distinct x order by x),'{}') into b from unnest(b) x;
  return jsonb_build_object('ready',cardinality(b)=0,'stage',p_stage,'blockers',b,'counts',counts);
end $$;

create or replace function private.package_issue_readiness_window(p_event uuid,p_run uuid,p_device text,p_printer text,p_generation integer,p_admin uuid default null,p_session uuid default null,p_grant uuid default null) returns uuid
language plpgsql set search_path='' as $$
declare result uuid; issued_at timestamptz;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{64}$' or p_printer is null or length(p_printer)>128 or p_printer !~ '[^[:space:]]' or p_generation is null or p_generation<0 then raise exception 'invalid_input'; end if;
  delete from private.package_readiness_windows where expires_at<clock_timestamp();
  issued_at:=clock_timestamp();
  insert into private.package_readiness_windows(event_id,run_id,device_hash,printer_id,connection_generation,admin_user_id,admin_session_id,grant_id,observation,received_at,expires_at)
  values(p_event,p_run,p_device,p_printer,p_generation,p_admin,p_session,p_grant,'{}',issued_at,issued_at+interval '5 seconds') returning id into result;
  return result;
end $$;

create or replace function private.package_report_readiness(p_event uuid,p_run uuid,p_device text,p_admin uuid,p_session uuid,p_grant uuid,p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare w private.package_readiness_windows%rowtype; r public.booth_runs%rowtype; o jsonb:=p_payload->'observation'; generation integer; changed boolean:=false; old_b text[]; new_b text[]; req uuid; rev integer; checked_at timestamptz; q public.booth_reload_requests%rowtype;
begin
  p_payload:=private.package_normalize_readiness_payload(p_payload);
  if p_payload->>'kind'='connection_changed' and p_run is not null then
    if not (p_payload ?& array['kind','readinessWindowId','printerId','connectionGeneration','expectedRevision']) or (p_payload-array['kind','readinessWindowId','printerId','connectionGeneration','expectedRevision'])<>'{}' then raise exception 'invalid_input'; end if;
    -- Reuse the heartbeat validators for the common identity and numeric fields.
    perform private.package_validate_readiness_report((p_payload-array['kind','expectedRevision'])||jsonb_build_object('observedAgeMs',0,'observation',jsonb_build_object('cameraPermission',false,'cameraLive',false,'serverReachable',false,'printerConnected',false,'printerReady',false,'oldJobCleared',false)),false);
    if jsonb_typeof(p_payload->'expectedRevision')<>'number' or (p_payload->>'expectedRevision')::numeric<>trunc((p_payload->>'expectedRevision')::numeric) or (p_payload->>'expectedRevision')::numeric not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
    select * into r from public.booth_runs where id=p_run and event_id=p_event for update;
    select * into w from private.package_readiness_windows where id=(p_payload->>'readinessWindowId')::uuid for update;
    checked_at:=clock_timestamp();
    if w.id is null or w.reported_at is not null or exists(select 1 from private.package_readiness_windows newer where newer.event_id=w.event_id and newer.run_id is not distinct from w.run_id and newer.device_hash=w.device_hash and newer.grant_id is not distinct from w.grant_id and newer.admin_user_id is not distinct from w.admin_user_id and newer.admin_session_id is not distinct from w.admin_session_id and newer.reported_at is not null and newer.issuance_order>w.issuance_order) or w.event_id<>p_event or w.run_id is distinct from p_run or w.grant_id is distinct from p_grant or w.device_hash<>p_device or w.printer_id<>p_payload->>'printerId' or w.printer_id is distinct from r.printer_id or w.expires_at<checked_at or w.received_at>checked_at or w.connection_generation<>r.connection_generation or (p_payload->>'connectionGeneration')::bigint<>r.connection_generation::bigint+1 then raise exception 'not_ready'; end if;
    if (p_payload->>'expectedRevision')::integer<>(select revision from public.events where id=p_event) then raise exception 'stale_revision'; end if;
    update private.package_readiness_windows set reported_at=checked_at where id=w.id;
    update public.booth_runs set connection_generation=connection_generation+1,observed_at=null,received_at=null where id=r.id;
    update public.booth_reload_requests set connection_generation=r.connection_generation+1,revision=revision+1 where run_id=r.id and state='Open';
    update public.events set revision=revision+1 where id=p_event and revision<2147483647 returning revision into rev;
    if not found then raise exception 'operation_unavailable'; end if;
    return private.package_readiness(p_event,case when r.state='Paused' then 'resume' else 'guest' end);
  end if;
  perform private.package_validate_readiness_report(p_payload,p_run is null);
  select * into r from public.booth_runs where id=p_run and event_id=p_event for update;
  select * into w from private.package_readiness_windows where id=(p_payload->>'readinessWindowId')::uuid for update;
  checked_at:=clock_timestamp();
  generation:=(p_payload->>'connectionGeneration')::integer;
  if w.id is null or w.reported_at is not null or exists(select 1 from private.package_readiness_windows newer where newer.event_id=w.event_id and newer.run_id is not distinct from w.run_id and newer.device_hash=w.device_hash and newer.grant_id is not distinct from w.grant_id and newer.admin_user_id is not distinct from w.admin_user_id and newer.admin_session_id is not distinct from w.admin_session_id and newer.reported_at is not null and newer.issuance_order>w.issuance_order) or w.event_id<>p_event or w.run_id is distinct from p_run or w.device_hash<>p_device or w.admin_user_id is distinct from p_admin or w.admin_session_id is distinct from p_session or w.grant_id is distinct from p_grant or w.printer_id<>p_payload->>'printerId' or w.connection_generation<>generation or w.expires_at<checked_at or w.received_at>checked_at or (p_payload->>'observedAgeMs')::numeric>extract(epoch from checked_at-w.received_at)*1000 then raise exception 'not_ready'; end if;
  if p_run is null then
    if p_payload->>'deviceHash'<>p_device then raise exception 'not_ready'; end if;
    update private.package_readiness_windows set observation=o||jsonb_build_object('filmLoadedConfirmed',p_payload->'filmLoadedConfirmed','powerConfirmed',p_payload->'powerConfirmed','guidedAccessConfirmed',p_payload->'guidedAccessConfirmed'),reported_at=checked_at where id=w.id;
    return private.package_readiness(p_event,'setup');
  end if;
  if r.printer_id is distinct from w.printer_id or generation<>r.connection_generation then raise exception 'not_ready'; end if;
    old_b:=private.package_equipment_blockers(r.readiness_observation,coalesce(r.observed_at between checked_at-interval '5 seconds' and checked_at and r.received_at between checked_at-interval '5 seconds' and checked_at and (r.readiness_observation->>'connectionGeneration')::integer=r.connection_generation,false),r.film_loaded_confirmed,r.power_confirmed,r.guided_access_confirmed);
    if o ? 'loadFault' then
      select * into q from public.booth_reload_requests where run_id=r.id and load_fault_id=(o->>'loadFaultId')::uuid for update;
      if found then
        if q.trigger<>o->>'loadFault' then raise exception 'operation_conflict'; end if;
        if q.state='Superseded' then raise exception 'not_ready'; end if;
        if q.state='Open' then r.film_loaded_confirmed:=false; end if;
      else
        update public.booth_reload_requests set state='Superseded' where run_id=r.id and state='Open';
        insert into public.booth_reload_requests(event_id,run_id,printer_id,connection_generation,trigger,load_fault_id)
          values(p_event,p_run,r.printer_id,generation,o->>'loadFault',(o->>'loadFaultId')::uuid) returning id into req;
        r.film_loaded_confirmed:=false;
      end if;
    end if;
    new_b:=private.package_equipment_blockers(o,true,r.film_loaded_confirmed,r.power_confirmed,r.guided_access_confirmed);
    changed:=old_b is distinct from new_b or req is not null;
    update public.booth_runs set readiness_observation=o||jsonb_build_object('connectionGeneration',generation),observed_at=w.received_at,received_at=checked_at,film_loaded_confirmed=r.film_loaded_confirmed where id=r.id;
  update private.package_readiness_windows set observation=o,reported_at=checked_at where id=w.id;
  if changed then
    update public.events set revision=revision+1 where id=p_event and revision<2147483647 returning revision into rev;
    if not found then raise exception 'operation_unavailable'; end if;
  end if;
  return private.package_readiness(p_event,case when r.state='Paused' then 'resume' else 'guest' end);
end $$;

