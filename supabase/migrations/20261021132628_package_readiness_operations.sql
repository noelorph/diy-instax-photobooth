alter table private.package_readiness_windows
  alter column admin_user_id drop not null,
  alter column admin_session_id drop not null,
  add column grant_id uuid references public.booth_grants(id),
  add column reported_at timestamptz,
  add constraint package_window_actor_check check (
    (grant_id is null and admin_user_id is not null and admin_session_id is not null)
    or (grant_id is not null and admin_user_id is null and admin_session_id is null and run_id is not null)
  );
alter table public.booth_reload_requests add column requested_by uuid, add column reason text;

create function private.package_equipment_blockers(p_observation jsonb,p_fresh boolean,p_loaded boolean,p_power boolean,p_guided boolean) returns text[]
language plpgsql stable set search_path='' as $$
declare b text[]:='{}';
begin
  if not p_fresh then b:=array_append(b,'readiness_stale'); end if;
  if p_observation->>'cameraPermission' is distinct from 'true' or p_observation->>'cameraLive' is distinct from 'true' then b:=array_append(b,'camera'); end if;
  if p_observation->>'serverReachable' is distinct from 'true' then b:=array_append(b,'server_unreachable'); end if;
  if p_observation->>'printerConnected' is distinct from 'true' then b:=array_append(b,'printer_connection'); end if;
  if p_observation->>'printerReady' is distinct from 'true' or p_observation->>'oldJobCleared' is distinct from 'true' then b:=array_append(b,'printer_not_safe'); end if;
  if not p_loaded then b:=array_append(b,'film_reload_needed'); end if;
  if not p_power then b:=array_append(b,'printer_power'); end if;
  if not p_guided then b:=array_append(b,'guided_access'); end if;
  if not exists(select 1 from public.printer_completion_policy where id and mode='simulated') then b:=array_append(b,'qualification_required'); end if;
  return b;
end $$;

create function private.package_readiness(p_event_id uuid,p_stage text,p_attempt_id uuid default null) returns jsonb
language plpgsql stable set search_path='' as $$
declare e public.events%rowtype; r public.booth_runs%rowtype; w private.package_readiness_windows%rowtype; b text[]; counts jsonb; own public.print_attempts%rowtype; s uuid; c uuid;
begin
  if p_stage is null or p_stage not in ('setup','guest','reserve','dispatch','resume') then raise exception 'invalid_input'; end if;
  select * into e from public.events where id=p_event_id and accounting_version=2 and deleted_at is null;
  if not found then raise exception 'operation_unavailable'; end if;
  counts:=private.package_counts(p_event_id);
  select * into r from public.booth_runs where event_id=p_event_id and accounting_version=2 and state<>'Finished';
  if p_stage='setup' then
    select * into w from private.package_readiness_windows where event_id=p_event_id and run_id is null and reported_at is not null order by received_at desc limit 1;
    b:=private.package_equipment_blockers(coalesce(w.observation,'{}'),coalesce(w.expires_at>=statement_timestamp(),false),coalesce((w.observation->>'filmLoadedConfirmed')::boolean,false),coalesce((w.observation->>'powerConfirmed')::boolean,false),coalesce((w.observation->>'guidedAccessConfirmed')::boolean,false));
    if w.id is null or not exists(select 1 from public.admin_profiles a join auth.sessions s on s.user_id=a.id where a.id=w.admin_user_id and s.id=w.admin_session_id and (s.not_after is null or s.not_after>statement_timestamp())) then b:=array_append(b,'access_required'); end if;
    if e.state not in ('Draft','Live') or e.booking_review_required or r.id is not null or exists(select 1 from public.events where state='Live' and id<>p_event_id) then b:=array_append(b,'setup_unavailable'); end if;
  else
    b:=private.package_equipment_blockers(coalesce(r.readiness_observation,'{}'),coalesce(r.observed_at between statement_timestamp()-interval '5 seconds' and statement_timestamp() and r.received_at between statement_timestamp()-interval '5 seconds' and statement_timestamp() and (r.readiness_observation->>'connectionGeneration')::integer=r.connection_generation,false),coalesce(r.film_loaded_confirmed,false),coalesce(r.power_confirmed,false),coalesce(r.guided_access_confirmed,false));
    if r.id is null or e.state<>'Live' or r.state<>(case when p_stage='resume' then 'Paused' else 'Active' end) then b:=array_append(b,'run_state'); end if;
    if not exists(select 1 from public.booth_grants g where g.run_id=r.id and g.accounting_version=2 and g.state='Active' and g.revoked_at is null and g.expires_at>statement_timestamp() and g.last_seen_at>statement_timestamp()-interval '24 hours' and g.device_hash=r.device_hash) then b:=array_append(b,'access_required'); end if;
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

create function private.package_issue_readiness_window(p_event uuid,p_run uuid,p_device text,p_printer text,p_generation integer,p_admin uuid default null,p_session uuid default null,p_grant uuid default null) returns uuid
language plpgsql set search_path='' as $$
declare result uuid;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{64}$' or p_printer is null or length(p_printer)>128 or p_printer !~ '[^[:space:]]' or p_generation is null or p_generation<0 then raise exception 'invalid_input'; end if;
  delete from private.package_readiness_windows where expires_at<statement_timestamp();
  insert into private.package_readiness_windows(event_id,run_id,device_hash,printer_id,connection_generation,admin_user_id,admin_session_id,grant_id,observation,received_at,expires_at)
  values(p_event,p_run,p_device,p_printer,p_generation,p_admin,p_session,p_grant,'{}',statement_timestamp(),statement_timestamp()+interval '5 seconds') returning id into result;
  return result;
end $$;

create function private.package_setup_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_device_hash text,p_printer_id text,p_connection_generation integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; window_id uuid;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=p_event_id and accounting_version=2 and deleted_at is null for update;
  if not found then raise exception 'operation_unavailable'; end if;
  window_id:=private.package_issue_readiness_window(e.id,null,p_device_hash,p_printer_id,p_connection_generation,p_admin_user_id,p_admin_session_id);
  return jsonb_build_object('revision',e.revision,'readinessWindowId',window_id,'readiness',private.package_readiness(e.id,'setup'));
end $$;

create function private.package_validate_readiness_report(p_payload jsonb,p_setup boolean) returns void
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
  if jsonb_typeof(o)<>'object' or not (o ?& array['cameraPermission','cameraLive','serverReachable','printerConnected','printerReady','oldJobCleared']) or (o-array['cameraPermission','cameraLive','serverReachable','printerConnected','printerReady','oldJobCleared','mediaAvailable','loadFault'])<>'{}' then raise exception 'invalid_input'; end if;
  foreach k in array array['cameraPermission','cameraLive','serverReachable','printerConnected','printerReady','oldJobCleared','mediaAvailable'] loop
    if o ? k and jsonb_typeof(o->k)<>'boolean' then raise exception 'invalid_input'; end if;
  end loop;
  if o ? 'loadFault' and (jsonb_typeof(o->'loadFault')<>'string' or o->>'loadFault' not in ('no_film','cover_open','load_change')) then raise exception 'invalid_input'; end if;
end $$;

create function private.package_report_readiness(p_event uuid,p_run uuid,p_device text,p_admin uuid,p_session uuid,p_grant uuid,p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare w private.package_readiness_windows%rowtype; r public.booth_runs%rowtype; o jsonb:=p_payload->'observation'; generation integer; changed boolean:=false; old_b text[]; new_b text[]; req uuid; rev integer;
begin
  if p_payload->>'kind'='connection_changed' and p_run is not null then
    if not (p_payload ?& array['kind','readinessWindowId','printerId','connectionGeneration','expectedRevision']) or (p_payload-array['kind','readinessWindowId','printerId','connectionGeneration','expectedRevision'])<>'{}' then raise exception 'invalid_input'; end if;
    -- Reuse the heartbeat validators for the common identity and numeric fields.
    perform private.package_validate_readiness_report((p_payload-array['kind','expectedRevision'])||jsonb_build_object('observedAgeMs',0,'observation',jsonb_build_object('cameraPermission',false,'cameraLive',false,'serverReachable',false,'printerConnected',false,'printerReady',false,'oldJobCleared',false)),false);
    if jsonb_typeof(p_payload->'expectedRevision')<>'number' or (p_payload->>'expectedRevision')::numeric<>trunc((p_payload->>'expectedRevision')::numeric) or (p_payload->>'expectedRevision')::numeric not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
    select * into r from public.booth_runs where id=p_run and event_id=p_event for update;
    select * into w from private.package_readiness_windows where id=(p_payload->>'readinessWindowId')::uuid for update;
    if w.id is null or w.event_id<>p_event or w.run_id is distinct from p_run or w.grant_id is distinct from p_grant or w.device_hash<>p_device or w.printer_id<>p_payload->>'printerId' or w.printer_id is distinct from r.printer_id or w.expires_at<statement_timestamp() or w.received_at>statement_timestamp() or w.connection_generation<>r.connection_generation or (p_payload->>'connectionGeneration')::bigint<>r.connection_generation::bigint+1 then raise exception 'not_ready'; end if;
    if (p_payload->>'expectedRevision')::integer<>(select revision from public.events where id=p_event) then raise exception 'stale_revision'; end if;
    update public.booth_runs set connection_generation=connection_generation+1,observed_at=null,received_at=null where id=r.id;
    update public.booth_reload_requests set connection_generation=r.connection_generation+1,revision=revision+1 where run_id=r.id and state='Open';
    update public.events set revision=revision+1 where id=p_event and revision<2147483647 returning revision into rev;
    if not found then raise exception 'operation_unavailable'; end if;
    return private.package_readiness(p_event,case when r.state='Paused' then 'resume' else 'guest' end);
  end if;
  perform private.package_validate_readiness_report(p_payload,p_run is null);
  select * into w from private.package_readiness_windows where id=(p_payload->>'readinessWindowId')::uuid for update;
  generation:=(p_payload->>'connectionGeneration')::integer;
  if w.id is null or w.event_id<>p_event or w.run_id is distinct from p_run or w.device_hash<>p_device or w.admin_user_id is distinct from p_admin or w.admin_session_id is distinct from p_session or w.grant_id is distinct from p_grant or w.printer_id<>p_payload->>'printerId' or w.connection_generation<>generation or w.expires_at<statement_timestamp() or w.received_at>statement_timestamp() or (p_payload->>'observedAgeMs')::numeric>extract(epoch from statement_timestamp()-w.received_at)*1000 then raise exception 'not_ready'; end if;
  if p_run is null then
    if p_payload->>'deviceHash'<>p_device then raise exception 'not_ready'; end if;
    update private.package_readiness_windows set observation=o||jsonb_build_object('filmLoadedConfirmed',p_payload->'filmLoadedConfirmed','powerConfirmed',p_payload->'powerConfirmed','guidedAccessConfirmed',p_payload->'guidedAccessConfirmed'),reported_at=statement_timestamp() where id=w.id;
    return private.package_readiness(p_event,'setup');
  end if;
  select * into r from public.booth_runs where id=p_run and event_id=p_event for update;
  if r.printer_id is distinct from w.printer_id or generation<>r.connection_generation then raise exception 'not_ready'; end if;
    old_b:=private.package_equipment_blockers(r.readiness_observation,true,r.film_loaded_confirmed,r.power_confirmed,r.guided_access_confirmed);
    if o ? 'loadFault' then
      if not exists(select 1 from public.booth_reload_requests where run_id=r.id and state='Open') then
        insert into public.booth_reload_requests(event_id,run_id,printer_id,connection_generation,trigger) values(p_event,p_run,r.printer_id,generation,o->>'loadFault') returning id into req;
      end if;
      r.film_loaded_confirmed:=false;
    end if;
    new_b:=private.package_equipment_blockers(o,true,r.film_loaded_confirmed,r.power_confirmed,r.guided_access_confirmed);
    changed:=old_b is distinct from new_b or req is not null;
    update public.booth_runs set readiness_observation=o||jsonb_build_object('connectionGeneration',generation),observed_at=w.received_at,received_at=statement_timestamp(),film_loaded_confirmed=r.film_loaded_confirmed where id=r.id;
  update private.package_readiness_windows set observation=o,reported_at=statement_timestamp() where id=w.id;
  if changed then
    update public.events set revision=revision+1 where id=p_event and revision<2147483647 returning revision into rev;
    if not found then raise exception 'operation_unavailable'; end if;
  end if;
  return private.package_readiness(p_event,case when r.state='Paused' then 'resume' else 'guest' end);
end $$;

-- Preserve the existing accounting branch while adding the readiness-only Admin actions.
alter function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) rename to package_accounting_admin_operation;
create function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:='admin:'||p_admin_user_id; e public.events%rowtype; r public.booth_runs%rowtype; q public.booth_reload_requests%rowtype; normalized jsonb:=p_payload; result jsonb; replay jsonb; eid uuid; rid uuid; gen integer; required text[];
begin
  if p_operation='add_packages' then return private.package_accounting_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload); end if;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if p_operation_id is null or p_operation is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input'; end if;
  begin eid:=(p_payload->>'eventId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  if eid is null or jsonb_typeof(p_payload->'eventId')<>'string' then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=eid for update;
  if p_operation='request_reload' and jsonb_typeof(p_payload->'reason')='string' then normalized:=jsonb_set(normalized,'{reason}',to_jsonb(btrim(p_payload->>'reason'))); end if;
  replay:=private.package_receipt(actor,p_operation_id,p_operation,normalized,e.revision);
  if replay is not null then return replay; end if;
  if p_operation not in ('request_reload','confirm_reload','report_setup_readiness') then raise exception 'operation_forbidden'; end if;
  if e.id is null or e.accounting_version<>2 or e.deleted_at is not null then raise exception 'operation_unavailable'; end if;
  if p_operation='report_setup_readiness' then
    perform private.package_validate_readiness_report(p_payload,true);
    result:=private.package_report_readiness(eid,null,p_payload->>'deviceHash',p_admin_user_id,p_admin_session_id,null,p_payload);
  else
    required:=array['eventId','printerId','connectionGeneration','expectedRevision'];
    if p_operation='request_reload' then required:=required||array['runId','reason']; else required:=required||array['reloadRequestId']; end if;
    if not (p_payload ?& required) or (p_payload-required)<>'{}' then raise exception 'invalid_input'; end if;
    if jsonb_typeof(p_payload->'printerId')<>'string' or length(p_payload->>'printerId') not between 1 and 128 or p_payload->>'printerId' !~ '[^[:space:]]'
      or jsonb_typeof(p_payload->'expectedRevision')<>'number' or (p_payload->>'expectedRevision')::numeric<>trunc((p_payload->>'expectedRevision')::numeric) or (p_payload->>'expectedRevision')::numeric not between 1 and 2147483647
      or jsonb_typeof(p_payload->'connectionGeneration')<>'number' or (p_payload->>'connectionGeneration')::numeric<>trunc((p_payload->>'connectionGeneration')::numeric) or (p_payload->>'connectionGeneration')::numeric not between 0 and 2147483647 then raise exception 'invalid_input'; end if;
    gen:=(p_payload->>'connectionGeneration')::integer;
    if (p_payload->>'expectedRevision')::integer<>e.revision then raise exception 'stale_revision'; end if;
    if e.state<>'Live' then raise exception 'invalid_transition'; end if;
    select * into r from public.booth_runs where event_id=eid and accounting_version=2 and state<>'Finished' for update;
    if not found then raise exception 'invalid_transition'; end if;
    if r.printer_id is distinct from p_payload->>'printerId' or r.connection_generation<>gen then raise exception 'not_ready'; end if;
    if p_operation='request_reload' then
      begin rid:=(p_payload->>'runId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
      if rid is null or jsonb_typeof(p_payload->'runId')<>'string' or jsonb_typeof(p_payload->'reason')<>'string' or normalized->>'reason' !~ '[^[:space:]]' then raise exception 'invalid_input'; end if;
      if rid<>r.id then raise exception 'invalid_transition'; end if;
      update public.booth_reload_requests set state='Superseded' where run_id=r.id and state='Open';
      insert into public.booth_reload_requests(event_id,run_id,printer_id,connection_generation,trigger,requested_by,reason)
      values(eid,r.id,r.printer_id,gen,'admin_request',p_admin_user_id,normalized->>'reason') returning * into q;
      update public.booth_runs set film_loaded_confirmed=false where id=r.id;
    else
      begin rid:=(p_payload->>'reloadRequestId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
      if rid is null or jsonb_typeof(p_payload->'reloadRequestId')<>'string' then raise exception 'invalid_input'; end if;
      select * into q from public.booth_reload_requests where id=rid and event_id=eid and run_id=r.id for update;
      if not found or q.state<>'Open' or q.printer_id<>r.printer_id or q.connection_generation<>gen then raise exception 'not_ready'; end if;
      update public.booth_reload_requests set state='Confirmed',confirmed_at=statement_timestamp(),confirmed_by=p_admin_user_id,confirmation_source='admin_physical_confirmation',revision=revision+1 where id=q.id;
      update public.booth_runs set film_loaded_confirmed=true where id=r.id;
    end if;
    update public.events set revision=revision+1 where id=eid and revision<2147483647 returning * into e;
    if not found then raise exception 'operation_unavailable'; end if;
    insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(eid,2,actor,p_operation);
    result:=jsonb_build_object('reloadRequestId',q.id);
  end if;
  return private.package_commit_receipt(eid,actor,p_operation_id,p_operation,normalized,e.revision,result);
end $$;

create function private.package_booth_read(p_grant_hash text,p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; r public.booth_runs%rowtype; e public.events%rowtype; window_id uuid; result jsonb; receipt jsonb;
begin
  perform 1 from private.booth_contract_guard where id for update;
  g:=private.package_require_booth(p_grant_hash,'read');
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  window_id:=private.package_issue_readiness_window(e.id,r.id,g.device_hash,r.printer_id,r.connection_generation,null,null,g.id);
  result:=private.package_readiness(e.id,case when r.state='Paused' then 'resume' else 'guest' end);
  select jsonb_build_object('operationId',operation_key,'kind',operation_kind,'committedRevision',committed_revision,'result',operation_receipts.result) into receipt from public.operation_receipts where accounting_version=2 and event_id=e.id and actor_scope='booth:'||g.id and operation_key=p_operation_id;
  return jsonb_build_object('revision',e.revision,'runId',r.id,'state',r.state,'counts',private.package_counts(e.id),'readiness',result,'blockers',result->'blockers','allowedActions',jsonb_build_object('startGuest',r.state='Active' and (result->>'ready')::boolean,'reportReadiness',true,'reconcile',true,'connectPrinter',true,'enableCamera',true),'readinessWindowId',window_id,'receipt',receipt);
end $$;

create function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; replay jsonb; result jsonb; actor text;
begin
  perform 1 from private.booth_contract_guard where id for update;
  g:=private.package_require_booth(p_grant_hash,'readiness');
  if p_operation is null or p_operation<>'report_readiness' then raise exception 'operation_forbidden'; end if;
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input'; end if;
  select * into e from public.events where id=g.event_id for update;
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,p_operation,p_payload,e.revision);
  if replay is not null then return replay; end if;
  result:=private.package_report_readiness(e.id,g.run_id,g.device_hash,null,null,g.id,p_payload);
  select * into e from public.events where id=g.event_id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,p_operation,p_payload,e.revision,result);
end $$;

create function public.package_setup_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_device_hash text,p_printer_id text,p_connection_generation integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_setup_read(p_admin_user_id,p_admin_session_id,p_event_id,p_device_hash,p_printer_id,p_connection_generation) $$;
create function public.package_booth_read(p_grant_hash text,p_operation_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_booth_read(p_grant_hash,p_operation_id) $$;
create function public.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload) $$;
-- SQL wrappers bind to function identities; point the existing wrapper to the new dispatcher.
create or replace function public.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload) $$;

revoke all on function private.package_accounting_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_equipment_blockers(jsonb,boolean,boolean,boolean,boolean),private.package_readiness(uuid,text,uuid),private.package_issue_readiness_window(uuid,uuid,text,text,integer,uuid,uuid,uuid),private.package_validate_readiness_report(jsonb,boolean),private.package_report_readiness(uuid,uuid,text,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.package_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_setup_read(uuid,uuid,uuid,text,text,integer),private.package_booth_read(text,uuid),private.package_booth_operation(text,text,uuid,jsonb),public.package_setup_read(uuid,uuid,uuid,text,text,integer),public.package_booth_read(text,uuid),public.package_booth_operation(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_setup_read(uuid,uuid,uuid,text,text,integer),private.package_booth_read(text,uuid),private.package_booth_operation(text,text,uuid,jsonb),public.package_setup_read(uuid,uuid,uuid,text,text,integer),public.package_booth_read(text,uuid),public.package_booth_operation(text,text,uuid,jsonb) to service_role;
