-- Bounded nonproduction evidence; this migration never enables a completion policy.
alter table public.printer_completion_policy drop constraint printer_completion_policy_mode_check;
alter table public.printer_completion_policy add constraint printer_completion_policy_mode_check
  check (mode in ('disabled','simulated','instax-development'));
alter table public.booth_runs add column evidence_policy_version text
  check (evidence_policy_version in ('simulator-v1','instax-fi033-0102-dev-v1'));
-- Existing version-2 runs only had simulator authority. No row inherits physical authority.
update public.booth_runs set evidence_policy_version='simulator-v1' where accounting_version=2;

create function private.package_guard_run_policy() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.evidence_policy_version is distinct from old.evidence_policy_version then raise exception 'qualification_required'; end if;
  return new;
end $$;
revoke all on function private.package_guard_run_policy() from public,anon,authenticated,service_role;
create trigger package_run_policy_immutable before update on public.booth_runs
for each row execute function private.package_guard_run_policy();

create function private.package_evidence_policy(p_evidence jsonb) returns text
language sql immutable set search_path='' as $$
  select case p_evidence
    when '{"adapterVersion":"simulator-v2","evidenceVersion":"simulator-v1","modelNumber":null,"firmwareRevision":null}'::jsonb then 'simulator-v1'
    when '{"adapterVersion":"instax-mini-link3-v1","evidenceVersion":"instax-fi033-0102-dev-v1","modelNumber":"FI033","firmwareRevision":"0102"}'::jsonb then 'instax-fi033-0102-dev-v1'
    else null end
$$;
create function private.package_mode_policy(p_mode text) returns text
language sql immutable set search_path='' as $$
  select case p_mode when 'simulated' then 'simulator-v1' when 'instax-development' then 'instax-fi033-0102-dev-v1' else null end
$$;
create function private.package_require_printer_work(p_mode text,p_policy text) returns void
language plpgsql stable set search_path='' as $$
begin
  if p_policy is null or private.package_mode_policy(p_mode) is distinct from p_policy
    or not exists(select 1 from public.printer_completion_policy where id and mode=p_mode)
    then raise exception 'qualification_required'; end if;
end $$;
revoke all on function private.package_evidence_policy(jsonb),private.package_mode_policy(text),private.package_require_printer_work(text,text) from public,anon,authenticated,service_role;


create or replace function private.package_equipment_blockers(p_observation jsonb,p_fresh boolean,p_loaded boolean,p_power boolean,p_guided boolean) returns text[]
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
  if private.package_evidence_policy(p_observation->'printerEvidence') is null
    or private.package_evidence_policy(p_observation->'printerEvidence') is distinct from private.package_mode_policy(p_observation->>'printerMode')
    or not exists(select 1 from public.printer_completion_policy where id and mode=p_observation->>'printerMode' and private.package_mode_policy(mode)=private.package_evidence_policy(p_observation->'printerEvidence')) then b:=array_append(b,'qualification_required'); end if;
  return b;
end $$;

create or replace function private.package_validate_readiness_report(p_payload jsonb,p_setup boolean) returns void
language plpgsql set search_path='' as $$
declare required text[]:=array['readinessWindowId','observedAgeMs','printerId','connectionGeneration','observation','printerEvidence','printerMode']; k text; o jsonb;
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
  if jsonb_typeof(p_payload->'printerMode') is distinct from 'string' or p_payload->>'printerMode' not in ('disabled','simulated','instax-development') then raise exception 'invalid_input'; end if;
  o:=p_payload->'observation';
  if p_payload->'printerEvidence'<>'null'::jsonb and private.package_evidence_policy(p_payload->'printerEvidence') is null then raise exception 'invalid_input'; end if;
  if o->>'printerConnected'='true' and private.package_evidence_policy(p_payload->'printerEvidence') is null then raise exception 'qualification_required'; end if;
  if p_setup then
    perform private.package_require_printer_work(p_payload->>'printerMode',private.package_mode_policy(p_payload->>'printerMode'));
    if private.package_evidence_policy(p_payload->'printerEvidence') is not null and private.package_evidence_policy(p_payload->'printerEvidence') is distinct from private.package_mode_policy(p_payload->>'printerMode') then raise exception 'qualification_required'; end if;
  end if;
  if jsonb_typeof(o)<>'object' or not (o ?& array['cameraPermission','cameraLive','serverReachable','printerConnected','printerReady','oldJobCleared']) or (o-array['cameraPermission','cameraLive','serverReachable','printerConnected','printerReady','oldJobCleared','mediaAvailable','loadFault','loadFaultId'])<>'{}' then raise exception 'invalid_input'; end if;
  foreach k in array array['cameraPermission','cameraLive','serverReachable','printerConnected','printerReady','oldJobCleared','mediaAvailable'] loop
    if o ? k and jsonb_typeof(o->k)<>'boolean' then raise exception 'invalid_input'; end if;
  end loop;
  if (o ? 'loadFault')<>(o ? 'loadFaultId') then raise exception 'invalid_input'; end if;
  if o ? 'loadFaultId' and (jsonb_typeof(o->'loadFaultId')<>'string' or o->>'loadFaultId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'invalid_input'; end if;
  if o ? 'loadFault' and (jsonb_typeof(o->'loadFault')<>'string' or o->>'loadFault' not in ('no_film','cover_open','load_change')) then raise exception 'invalid_input'; end if;
end $$;

create or replace function private.package_report_readiness(p_event uuid,p_run uuid,p_device text,p_admin uuid,p_session uuid,p_grant uuid,p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare w private.package_readiness_windows%rowtype; r public.booth_runs%rowtype; o jsonb:=p_payload->'observation'; generation integer; changed boolean:=false; old_b text[]; new_b text[]; req uuid; rev integer; checked_at timestamptz; q public.booth_reload_requests%rowtype;
begin
  p_payload:=private.package_normalize_readiness_payload(p_payload);
  if p_payload->>'kind'='connection_changed' and p_run is not null then
    if not (p_payload ?& array['kind','readinessWindowId','printerId','connectionGeneration','expectedRevision','printerMode','printerEvidence']) or (p_payload-array['kind','readinessWindowId','printerId','connectionGeneration','expectedRevision','printerMode','printerEvidence'])<>'{}' then raise exception 'invalid_input'; end if;
    -- Reuse the heartbeat validators for the common identity and numeric fields.
    perform private.package_validate_readiness_report((p_payload-array['kind','expectedRevision'])||jsonb_build_object('observedAgeMs',0,'observation',jsonb_build_object('cameraPermission',false,'cameraLive',false,'serverReachable',false,'printerConnected',true,'printerReady',false,'oldJobCleared',false)),false);
    if jsonb_typeof(p_payload->'expectedRevision')<>'number' or (p_payload->>'expectedRevision')::numeric<>trunc((p_payload->>'expectedRevision')::numeric) or (p_payload->>'expectedRevision')::numeric not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
    select * into r from public.booth_runs where id=p_run and event_id=p_event for update;
    select * into w from private.package_readiness_windows where id=(p_payload->>'readinessWindowId')::uuid for update;
    checked_at:=clock_timestamp();
    if w.id is null or w.reported_at is not null or exists(select 1 from private.package_readiness_windows newer where newer.event_id=w.event_id and newer.run_id is not distinct from w.run_id and newer.device_hash=w.device_hash and newer.grant_id is not distinct from w.grant_id and newer.admin_user_id is not distinct from w.admin_user_id and newer.admin_session_id is not distinct from w.admin_session_id and newer.reported_at is not null and newer.issuance_order>w.issuance_order) or w.event_id<>p_event or w.run_id is distinct from p_run or w.grant_id is distinct from p_grant or w.device_hash<>p_device or w.printer_id<>p_payload->>'printerId' or w.printer_id is distinct from r.printer_id or w.expires_at<checked_at or w.received_at>checked_at or w.connection_generation<>r.connection_generation or (p_payload->>'connectionGeneration')::bigint<>r.connection_generation::bigint+1 then raise exception 'not_ready'; end if;
    if (p_payload->>'expectedRevision')::integer<>(select revision from public.events where id=p_event) then raise exception 'stale_revision'; end if;
    if private.package_evidence_policy(p_payload->'printerEvidence') is distinct from r.evidence_policy_version then raise exception 'qualification_required'; end if;
    update private.package_readiness_windows set reported_at=checked_at where id=w.id;
    update public.booth_runs set connection_generation=connection_generation+1,observed_at=null,received_at=null where id=r.id;
    update public.booth_reload_requests set connection_generation=r.connection_generation+1,revision=revision+1 where run_id=r.id and state='Open';
    update public.events set revision=revision+1 where id=p_event and revision<2147483647 returning revision into rev;
    if not found then raise exception 'operation_unavailable'; end if;
    return private.package_readiness(p_event,case when r.state='Paused' then 'resume' else 'guest' end);
  end if;
  perform private.package_validate_readiness_report(p_payload,p_run is null);
  o:=o||jsonb_build_object('printerEvidence',p_payload->'printerEvidence','printerMode',p_payload->'printerMode');
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
  if r.evidence_policy_version='instax-fi033-0102-dev-v1' and o->>'loadFault'='no_film' then raise exception 'qualification_required'; end if;
  if o->>'printerConnected'='true' and private.package_evidence_policy(p_payload->'printerEvidence') is distinct from r.evidence_policy_version then raise exception 'qualification_required'; end if;
  if r.evidence_policy_version='instax-fi033-0102-dev-v1' and
    (o ? 'loadFault' or o->>'printerConnected'='false') then
    update public.booth_runs set old_job_safety_confirmed=false where id=r.id
      and exists(select 1 from public.print_attempts where run_id=r.id and dispatch_id is not null and state not in ('Printed','NotPrinted'));
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state,evidence_kind,evidence_policy_version,connection_generation)
      select id,2,'booth:'||p_grant,'Diagnostic','readiness_fault',r.evidence_policy_version,generation
      from public.print_attempts where run_id=r.id and dispatch_id is not null order by dispatched_at desc,id desc limit 1;
  end if;
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

create or replace function private.package_lifecycle_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:='admin:'||p_admin_user_id; e public.events%rowtype; r public.booth_runs%rowtype; w private.package_readiness_windows%rowtype; g uuid; h uuid; eid uuid; rid uuid; rev integer; expected numeric; replay jsonb; result jsonb; required text[]; at_time timestamptz;
begin
  if p_operation not in ('start','pause','resume','finish','complete','cancel','recover_access','begin_delete_draft','complete_delete_draft') then
    return private.package_readiness_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload);
  end if;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'eventId')<>'string' then raise exception 'invalid_input'; end if;
  begin eid:=(p_payload->>'eventId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  if eid is null then raise exception 'invalid_input'; end if;
  required:=array['eventId','expectedRevision'];
  if p_operation='start' then required:=required||array['readinessWindowId','deviceHash','printerId','connectionGeneration','printerMode'];
  elsif p_operation in ('pause','resume','finish') then required:=required||array['runId'];
  elsif p_operation='recover_access' then required:=required||array['runId','deviceHash']; end if;
  if not (p_payload ?& required) or (p_payload-required)<>'{}' or jsonb_typeof(p_payload->'expectedRevision')<>'number' then raise exception 'invalid_input'; end if;
  expected:=(p_payload->>'expectedRevision')::numeric;
  if expected<>trunc(expected) or expected not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(p_payload,'{expectedRevision}',to_jsonb(expected::integer));
  if p_operation in ('start','recover_access') and (jsonb_typeof(p_payload->'deviceHash')<>'string' or p_payload->>'deviceHash' !~ '^[0-9a-f]{64}$') then raise exception 'invalid_input'; end if;
  if p_operation='start' then
    if jsonb_typeof(p_payload->'readinessWindowId')<>'string' or jsonb_typeof(p_payload->'printerId')<>'string' or length(p_payload->>'printerId') not between 1 and 128 or p_payload->>'printerId' !~ '[^[:space:]]' or jsonb_typeof(p_payload->'connectionGeneration')<>'number' then raise exception 'invalid_input'; end if;
    expected:=(p_payload->>'connectionGeneration')::numeric;
    if expected<>trunc(expected) or expected not between 0 and 2147483647 then raise exception 'invalid_input'; end if;
    p_payload:=jsonb_set(p_payload,'{connectionGeneration}',to_jsonb(expected::integer));
    begin h:=(p_payload->>'readinessWindowId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  end if;
  if p_operation in ('pause','resume','finish','recover_access') then
    if jsonb_typeof(p_payload->'runId')<>'string' then raise exception 'invalid_input'; end if;
    begin rid:=(p_payload->>'runId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
    if rid is null then raise exception 'invalid_input'; end if;
  end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=eid for update;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if e.id is null or e.accounting_version<>2 then raise exception 'operation_unavailable'; end if;
  replay:=private.package_receipt(actor,p_operation_id,p_operation,p_payload,e.revision);
  if replay is not null then return replay; end if;
  if e.deleted_at is not null and p_operation<>'complete_delete_draft' then raise exception 'invalid_transition'; end if;
  if (p_payload->>'expectedRevision')::integer<>e.revision then raise exception 'stale_revision'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  at_time:=clock_timestamp();
  if p_operation='start' then
    if exists(select 1 from public.booth_runs where evidence_policy_version='instax-fi033-0102-dev-v1' and not old_job_safety_confirmed) then raise exception 'print_pending'; end if;
    if e.state not in ('Draft','Live') or e.booking_review_required or exists(select 1 from public.events where state='Live' and id<>eid) or exists(select 1 from public.booth_runs where event_id=eid and state<>'Finished') or exists(select 1 from public.print_attempts where state in ('Reserved','Dispatching','Accepted','Pending','Uncertain')) or (private.package_counts(eid)->>'printsAvailable')::bigint<=0 then raise exception 'invalid_transition'; end if;
    select * into w from private.package_readiness_windows where id=h for update;
    if w.id is null or w.event_id<>eid or w.run_id is not null or w.admin_user_id is distinct from p_admin_user_id or w.admin_session_id is distinct from p_admin_session_id or w.device_hash is distinct from p_payload->>'deviceHash' or w.printer_id is distinct from p_payload->>'printerId' or w.connection_generation::numeric<>(p_payload->>'connectionGeneration')::numeric or w.reported_at is null or w.expires_at<at_time or w.received_at>at_time or w.observation->>'cameraPermission' is distinct from 'true' or w.observation->>'cameraLive' is distinct from 'true' or w.observation->>'serverReachable' is distinct from 'true' or w.observation->>'printerConnected' is distinct from 'true' or w.observation->>'printerReady' is distinct from 'true' or w.observation->>'oldJobCleared' is distinct from 'true' or w.observation->>'filmLoadedConfirmed' is distinct from 'true' or w.observation->>'powerConfirmed' is distinct from 'true' or w.observation->>'guidedAccessConfirmed' is distinct from 'true' or exists(select 1 from private.package_readiness_windows newer where newer.event_id=eid and newer.run_id is null and newer.issuance_order>w.issuance_order) then raise exception 'not_ready'; end if;
    perform private.package_require_printer_work(p_payload->>'printerMode',private.package_evidence_policy(w.observation->'printerEvidence'));
    if w.observation->>'printerMode' is distinct from p_payload->>'printerMode' then raise exception 'qualification_required'; end if;
    insert into public.booth_runs(event_id,accounting_version,state,device_hash,printer_id,connection_generation,readiness_observation,observed_at,received_at,film_loaded_confirmed,power_confirmed,guided_access_confirmed,evidence_policy_version)
      values(eid,2,'Prepared',w.device_hash,w.printer_id,w.connection_generation,w.observation,w.received_at,w.reported_at,true,true,true,private.package_evidence_policy(w.observation->'printerEvidence')) returning id into rid;
    insert into public.booth_grants(event_id,run_id,accounting_version,device_hash,expires_at) values(eid,rid,2,w.device_hash,at_time+interval '5 minutes') returning id into g;
    insert into public.booth_handoffs(event_id,run_id,grant_id,accounting_version,admin_user_id,admin_session_id,device_token_hash,expires_at,purpose)
      values(eid,rid,g,2,p_admin_user_id,p_admin_session_id,w.device_hash,at_time+interval '5 minutes','initial') returning id into h;
    update public.events set state='Live',revision=revision+1 where id=eid returning * into e;
    result:=jsonb_build_object('runId',rid,'grantId',g,'handoffId',h,'purpose','initial');
  elsif p_operation in ('pause','resume','finish','recover_access') then
    if e.state<>'Live' then raise exception 'invalid_transition'; end if;
    select * into r from public.booth_runs where id=rid and event_id=eid and accounting_version=2 for update;
    if r.id is null then raise exception 'invalid_transition'; end if;
    if p_operation='pause' then
      if r.state not in ('Prepared','Active') then raise exception 'invalid_transition'; end if;
      update public.booth_runs set state='Paused',revision=revision+1 where id=rid;
      update public.guest_sessions set state='Abandoned',closed_at=at_time where run_id=rid and state='Open';
      update public.print_attempts set state='NotPrinted',resolved_at=at_time where run_id=rid and state='Reserved' and dispatch_id is null;
      result:=jsonb_build_object('runId',rid,'state','Paused');
    elsif p_operation='resume' then
      if r.state<>'Paused' then raise exception 'invalid_transition'; end if;
      if not (private.package_readiness(eid,'resume')->>'ready')::boolean then raise exception 'not_ready'; end if;
      update public.booth_runs set state='Active',revision=revision+1 where id=rid;
      result:=jsonb_build_object('runId',rid,'state','Active');
    elsif p_operation='finish' then
      if r.state not in ('Prepared','Active','Paused') then raise exception 'invalid_transition'; end if;
      update public.booth_runs set state='Finishing',finish_requested_at=at_time,revision=revision+1 where id=rid;
      update public.guest_sessions set state='Abandoned',closed_at=at_time where run_id=rid and state='Open';
      update public.print_attempts set state='NotPrinted',resolved_at=at_time where run_id=rid and state='Reserved' and dispatch_id is null;
      update public.booth_grants set state='Revoked',revoked_at=at_time where run_id=rid and state='Inactive';
      update public.booth_handoffs set state='Failed' where run_id=rid and state in ('Prepared','Issued');
      update public.events set revision=revision+1 where id=eid returning * into e;
      perform private.package_finish_if_clear(eid,rid);
      select * into e from public.events where id=eid;
      result:=jsonb_build_object('runId',rid,'state',(select state from public.booth_runs where id=rid));
      return private.package_commit_receipt(eid,actor,p_operation_id,p_operation,p_payload,e.revision,result);
    else
      if r.state not in ('Prepared','Paused','Active') then raise exception 'invalid_transition'; end if;
      if exists(select 1 from public.print_attempts where run_id=rid and state in ('Dispatching','Accepted','Pending','Uncertain') or run_id=rid and state='Reserved' and dispatch_id is not null) then raise exception 'print_pending'; end if;
      update public.print_attempts set state='NotPrinted',resolved_at=at_time where run_id=rid and state='Reserved' and dispatch_id is null;
      update public.guest_sessions set state='Abandoned',closed_at=at_time where run_id=rid and state='Open';
      update public.booth_grants set state='Revoked',revoked_at=at_time where run_id=rid and state<>'Revoked';
      update public.booth_handoffs set state='Failed' where run_id=rid and state in ('Prepared','Issued');
      update public.booth_runs set state='Paused',revision=revision+1,device_hash=p_payload->>'deviceHash',observed_at=null,received_at=null where id=rid;
      insert into public.booth_grants(event_id,run_id,accounting_version,device_hash,expires_at) values(eid,rid,2,p_payload->>'deviceHash',at_time+interval '5 minutes') returning id into g;
      insert into public.booth_handoffs(event_id,run_id,grant_id,accounting_version,admin_user_id,admin_session_id,device_token_hash,expires_at,purpose)
        values(eid,rid,g,2,p_admin_user_id,p_admin_session_id,p_payload->>'deviceHash',at_time+interval '5 minutes','recovery') returning id into h;
      result:=jsonb_build_object('runId',rid,'grantId',g,'handoffId',h,'purpose','recovery');
    end if;
    update public.events set revision=revision+1 where id=eid returning * into e;
  elsif p_operation in ('complete','cancel') then
    if p_operation='complete' and e.state<>'Live' or p_operation='cancel' and e.state not in ('Draft','Live') then raise exception 'invalid_transition'; end if;
    if e.state='Live' and (exists(select 1 from public.booth_runs where event_id=eid and state<>'Finished') or exists(select 1 from public.print_attempts where event_id=eid and state in ('Reserved','Dispatching','Accepted','Pending','Uncertain'))) then raise exception 'print_pending'; end if;
    update public.events set state=case when p_operation='complete' then 'Completed' else 'Cancelled' end,revision=revision+1 where id=eid returning * into e;
    result:=jsonb_build_object('state',e.state);
  elsif p_operation='begin_delete_draft' then
    if e.state<>'Draft' or exists(select 1 from public.booth_runs where event_id=eid) or exists(select 1 from public.print_attempts where event_id=eid and state in ('Reserved','Dispatching','Accepted','Pending','Uncertain')) then raise exception 'invalid_transition'; end if;
    update public.event_media_assets set state='cleanup_pending' where event_id=eid and state<>'removed';
    update public.events set title=null,client_name=null,client_email=null,client_phone=null,venue_address=null,time_zone=null,starts_at=null,ends_at=null,deleted_at=at_time,media_removal_state='pending',revision=revision+1 where id=eid returning * into e;
    result:=jsonb_build_object('mediaRemovalState','pending');
  else
    if e.state<>'Draft' or e.deleted_at is null or e.media_removal_state<>'pending' or not exists(select 1 from public.operation_receipts where event_id=eid and operation_kind='begin_delete_draft' and accounting_version=2) then raise exception 'invalid_transition'; end if;
    if exists(select 1 from storage.objects where bucket_id='event_media' and starts_with(name,eid::text||'/'))
      or exists(select 1 from public.event_media_assets where event_id=eid) then raise exception 'not_ready'; end if;
    update public.events set media_removal_state='complete',revision=revision+1 where id=eid returning * into e;
    result:=jsonb_build_object('mediaRemovalState','complete');
  end if;
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(eid,2,actor,p_operation);
  return private.package_commit_receipt(eid,actor,p_operation_id,p_operation,p_payload,e.revision,result);
end $$;

create or replace function private.package_finish_if_clear(p_event uuid,p_run uuid) returns boolean
language plpgsql set search_path='' as $$
declare r public.booth_runs%rowtype; rev integer;
begin
  select * into r from public.booth_runs where id=p_run and event_id=p_event for update;
  if r.evidence_policy_version='instax-fi033-0102-dev-v1' and not r.old_job_safety_confirmed then return false; end if;
  if r.state<>'Finishing' or exists(select 1 from public.print_attempts where run_id=p_run and state in ('Reserved','Dispatching','Accepted','Pending','Uncertain')) then return false; end if;
  update public.booth_runs set state='Finished',finished_at=clock_timestamp(),ended_at=clock_timestamp(),revision=revision+1 where id=p_run;
  update public.booth_grants set state='Revoked',revoked_at=clock_timestamp() where run_id=p_run and state<>'Revoked';
  update public.booth_handoffs set state='Failed' where run_id=p_run and state in ('Prepared','Issued');
  update public.events set revision=revision+1 where id=p_event and revision<2147483647 returning revision into rev;
  if not found then raise exception 'operation_unavailable'; end if;
  return true;
end $$;

create or replace function private.package_start_session(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  actor text; replay jsonb; result jsonb; session_id uuid;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'session');
  actor:='booth:'||g.id;
  if p_operation='start_session' then
    if not (p_payload ?& array['expectedRevision','printerMode']) or (p_payload-array['expectedRevision','printerMode'])<>'{}'
      or jsonb_typeof(p_payload->'expectedRevision')<>'number'
      or (p_payload->>'expectedRevision')::numeric<>trunc((p_payload->>'expectedRevision')::numeric)
      or (p_payload->>'expectedRevision')::numeric not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
    p_payload:=jsonb_set(p_payload,'{expectedRevision}',to_jsonb((p_payload->>'expectedRevision')::numeric::integer));
  else raise exception 'operation_forbidden'; end if;
  replay:=private.package_receipt(actor,p_operation_id,p_operation,p_payload,e.revision);
  if replay is not null then return replay; end if;
  perform private.package_require_printer_work(p_payload->>'printerMode',r.evidence_policy_version);
  if (p_payload->>'expectedRevision')::integer<>e.revision then raise exception 'stale_revision'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  if not (private.package_readiness(e.id,'guest')->>'ready')::boolean then raise exception 'not_ready'; end if;
  insert into public.guest_sessions(event_id,run_id,accounting_version,grant_id) values(e.id,r.id,2,g.id) returning id into session_id;
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('sessionId',session_id);
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(e.id,2,actor,p_operation);
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,p_operation,p_payload,e.revision,result);
end $$;

create or replace function private.package_reserve(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  s public.guest_sessions%rowtype; c public.captures%rowtype; session_id uuid; capture_id uuid;
  attempt_id uuid; actor text; replay jsonb; result jsonb; expected numeric;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['sessionId','captureId','expectedRevision','printerMode'])
    or (p_payload-array['sessionId','captureId','expectedRevision','printerMode'])<>'{}'
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
  perform private.package_require_printer_work(p_payload->>'printerMode',r.evidence_policy_version);
  if expected::integer<>e.revision then raise exception 'stale_revision'; end if;
  select * into s from public.guest_sessions where id=session_id and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  if s.id is null or s.state<>'Open' or exists(select 1 from public.print_attempts where public.print_attempts.session_id=s.id and accounting_version=2 and state in ('Printed','NotPrinted')) then raise exception 'invalid_transition'; end if;
  select * into c from public.captures where id=capture_id and public.captures.session_id=s.id and run_id=r.id and accounting_version=2;
  if c.id is null or exists(select 1 from public.captures newer where newer.session_id=s.id and newer.accounting_version=2 and newer.captured_at>c.captured_at) then raise exception 'invalid_transition'; end if;
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

create or replace function private.package_dispatch(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  a public.print_attempts%rowtype; c public.captures%rowtype; attempt_id uuid; v_dispatch_id uuid; actor text; replay jsonb;
  result jsonb; expected numeric; generation numeric;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['attemptId','printerId','connectionGeneration','expectedRevision','printerMode'])
    or (p_payload-array['attemptId','printerId','connectionGeneration','expectedRevision','printerMode'])<>'{}'
    or jsonb_typeof(p_payload->'attemptId')<>'string'
    or jsonb_typeof(p_payload->'printerId')<>'string'
    or length(p_payload->>'printerId') not between 1 and 128
    or p_payload->>'printerId' !~ '[^[:space:]]'
    or jsonb_typeof(p_payload->'connectionGeneration')<>'number'
    or jsonb_typeof(p_payload->'expectedRevision')<>'number' then raise exception 'invalid_input'; end if;
  begin attempt_id:=(p_payload->>'attemptId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  expected:=(p_payload->>'expectedRevision')::numeric;
  generation:=(p_payload->>'connectionGeneration')::numeric;
  if attempt_id is null or expected<>trunc(expected) or expected not between 1 and 2147483647
    or generation<>trunc(generation) or generation not between 0 and 2147483647 then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(jsonb_set(p_payload,'{expectedRevision}',to_jsonb(expected::integer)),'{connectionGeneration}',to_jsonb(generation::integer));
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'dispatch');
  select * into a from public.print_attempts where id=attempt_id and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  if a.id is null then raise exception 'invalid_transition'; end if;
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'dispatch',p_payload,e.revision);
  if replay is not null then return replay||jsonb_build_object('sendAllowed',false); end if;
  perform private.package_require_printer_work(p_payload->>'printerMode',r.evidence_policy_version);
  if expected::integer<>e.revision then raise exception 'stale_revision'; end if;
  select * into c from public.captures where id=a.capture_id and session_id=a.session_id and run_id=r.id and accounting_version=2;
  if a.state<>'Reserved' or a.dispatch_id is not null or a.printer_id is distinct from p_payload->>'printerId'
    or a.connection_generation is distinct from generation::integer
    or r.printer_id is distinct from p_payload->>'printerId' or r.connection_generation<>generation::integer
    or c.id is null or exists(select 1 from public.captures newer where newer.session_id=a.session_id and newer.accounting_version=2 and newer.captured_at>c.captured_at) then raise exception 'invalid_transition'; end if;
  if not (private.package_readiness(e.id,'dispatch',a.id)->>'ready')::boolean then raise exception 'not_ready'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  v_dispatch_id:=gen_random_uuid();
  update public.print_attempts set state='Dispatching',dispatch_id=v_dispatch_id,dispatched_at=clock_timestamp() where id=a.id;
  insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state) values(a.id,2,actor,'Dispatching');
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('attemptId',a.id,'state','Dispatching','dispatchId',v_dispatch_id);
  insert into public.activity_events(event_id,attempt_id,accounting_version,actor_scope,operation_kind) values(e.id,a.id,2,actor,'dispatch');
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,'dispatch',p_payload,e.revision,result)
    ||jsonb_build_object('sendAllowed',true,'authorization',jsonb_build_object('attemptId',a.id,'dispatchId',v_dispatch_id,'printerId',r.printer_id,'connectionGeneration',r.connection_generation));
end $$;

create or replace function private.package_validate_observation(p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare id uuid; oid uuid; generation numeric; kind text; metadata jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or not (p_payload ?& array['attemptId','observationId','kind','evidenceVersion','connectionGeneration','metadata','printerId','dispatchId','adapterVersion'])
    or (p_payload-array['attemptId','observationId','kind','evidenceVersion','connectionGeneration','metadata','printerId','dispatchId','adapterVersion'])<>'{}'
    or jsonb_typeof(p_payload->'attemptId')<>'string' or jsonb_typeof(p_payload->'observationId')<>'string'
    or jsonb_typeof(p_payload->'kind')<>'string' or jsonb_typeof(p_payload->'evidenceVersion')<>'string'
    or jsonb_typeof(p_payload->'connectionGeneration')<>'number' or jsonb_typeof(p_payload->'metadata')<>'object' then raise exception 'invalid_input'; end if;
  begin id:=(p_payload->>'attemptId')::uuid; oid:=(p_payload->>'observationId')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_input'; end;
  kind:=p_payload->>'kind'; generation:=(p_payload->>'connectionGeneration')::numeric; metadata:=p_payload->'metadata';
  if id is null or oid is null or kind not in ('definitely_not_sent','command_accepted','full_ejection_confirmed','no_film_rejected','outcome_unknown','connection_changed','ready_for_new_job')
    or generation<>trunc(generation) or generation not between 0 and 2147483647
    or p_payload->>'evidenceVersion' not in ('simulator-v1','instax-fi033-0102-dev-v1') or metadata<>'{}'
    or jsonb_typeof(p_payload->'printerId') is distinct from 'string' or length(p_payload->>'printerId') not between 1 and 128 or p_payload->>'printerId' !~ '[^[:space:]]'
    or jsonb_typeof(p_payload->'adapterVersion') is distinct from 'string'
    or p_payload->>'adapterVersion' not in ('simulator-v2','instax-mini-link3-v1')
    or (jsonb_typeof(p_payload->'dispatchId') is distinct from 'null' and (jsonb_typeof(p_payload->'dispatchId') is distinct from 'string' or p_payload->>'dispatchId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then raise exception 'invalid_input'; end if;
  return jsonb_set(p_payload,'{connectionGeneration}',to_jsonb(generation::integer));
end $$;

create or replace function private.package_observe(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype; a public.print_attempts%rowtype;
  actor text; replay jsonb; result jsonb; kind text; target text; discrepancy boolean:=false; oid uuid; generation integer;
begin
  p_payload:=private.package_validate_observation(p_payload);
  oid:=(p_payload->>'observationId')::uuid;
  if p_operation_id is null or p_operation_id<>oid then raise exception 'invalid_input'; end if;
  generation:=(p_payload->>'connectionGeneration')::integer; kind:=p_payload->>'kind';
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'observe');
  select * into a from public.print_attempts where id=(p_payload->>'attemptId')::uuid and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  if a.id is null then raise exception 'invalid_transition'; end if;
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'observe',p_payload,e.revision);
  if replay is not null then return replay; end if;
  if p_payload->>'printerId' is distinct from a.printer_id or p_payload->>'dispatchId' is distinct from a.dispatch_id::text then raise exception 'invalid_transition'; end if;
  if a.printer_id is distinct from r.printer_id or generation is distinct from r.connection_generation
    or (kind<>'ready_for_new_job' and generation is distinct from a.connection_generation)
    then raise exception 'invalid_transition'; end if;
  if exists(select 1 from public.print_attempt_events where attempt_id=a.id and observation_id=oid) then raise exception 'operation_conflict'; end if;
  if r.evidence_policy_version is null or p_payload->>'evidenceVersion' is distinct from r.evidence_policy_version
    or p_payload->>'adapterVersion' is distinct from (case r.evidence_policy_version when 'simulator-v1' then 'simulator-v2' when 'instax-fi033-0102-dev-v1' then 'instax-mini-link3-v1' end)
    or (r.evidence_policy_version='instax-fi033-0102-dev-v1' and kind='no_film_rejected') then raise exception 'qualification_required'; end if;
  if r.evidence_policy_version='instax-fi033-0102-dev-v1' and kind='ready_for_new_job' and
    (a.state<>'Printed' or generation is distinct from a.connection_generation
      or not exists(select 1 from public.print_attempt_events where attempt_id=a.id and state='Printed' and evidence_kind='full_ejection_confirmed' and evidence_policy_version=r.evidence_policy_version and connection_generation=generation)
      or exists(select 1 from public.print_attempt_events where attempt_id=a.id and (evidence_kind in ('outcome_unknown','connection_changed','inspection','readiness_fault') or state='Discrepancy')))
    then raise exception 'not_ready'; end if;
  if r.state not in ('Active','Paused','Finishing') then raise exception 'invalid_transition'; end if;
  target:=case kind
    when 'definitely_not_sent' then 'NotPrinted'
    when 'full_ejection_confirmed' then 'Printed'
    when 'no_film_rejected' then 'NotPrinted'
    when 'outcome_unknown' then 'Pending'
    when 'connection_changed' then 'Pending'
    when 'command_accepted' then 'Accepted'
    else a.state end;
  if a.state in ('Printed','NotPrinted') then
    discrepancy:=(target in ('Printed','NotPrinted') and target<>a.state)
      or (a.state='NotPrinted' and kind='command_accepted' and (
        a.dispatch_id is null or exists(select 1 from public.print_attempt_events
          where attempt_id=a.id and state='NotPrinted' and evidence_kind='definitely_not_sent')
      ));
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state,evidence_kind,evidence_policy_version,observation_id,connection_generation,safe_metadata)
      values(a.id,2,actor,case when discrepancy then 'Discrepancy' else 'Diagnostic' end,kind,r.evidence_policy_version,oid,generation,p_payload->'metadata');
    if discrepancy then update public.booth_runs set blockers=array_append(blockers,'evidence_discrepancy') where id=r.id and not ('evidence_discrepancy'=any(blockers)); end if;
    if kind='connection_changed' then update public.booth_runs set observed_at=null,received_at=null where id=r.id; end if;
  else
    if a.state='Reserved' and kind<>'definitely_not_sent' then raise exception 'invalid_transition'; end if;
    if a.state='Pending' and kind in ('command_accepted','outcome_unknown','connection_changed') then target:='Pending'; end if;
    if kind='definitely_not_sent' and a.accepted_at is not null then
      target:='Pending'; discrepancy:=true;
      update public.booth_runs set blockers=array_append(blockers,'evidence_discrepancy') where id=r.id and not ('evidence_discrepancy'=any(blockers));
    end if;
    if kind='ready_for_new_job' then target:=a.state; end if;
    if target<>a.state or (kind='command_accepted' and a.accepted_at is null) then
      update public.print_attempts set state=target,accepted_at=case when (p_payload->>'kind')='command_accepted' and accepted_at is null then clock_timestamp() else accepted_at end,
        resolved_at=case when target in ('Printed','NotPrinted') then clock_timestamp() else resolved_at end,
        evidence_policy_version=case when target in ('Printed','NotPrinted') then r.evidence_policy_version else evidence_policy_version end where id=a.id;
    end if;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state,evidence_kind,evidence_policy_version,observation_id,connection_generation,safe_metadata)
      values(a.id,2,actor,case when discrepancy then 'Discrepancy' when target=a.state then 'Diagnostic' else target end,kind,r.evidence_policy_version,oid,generation,p_payload->'metadata');
    if discrepancy and target<>a.state then insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state) values(a.id,2,actor,target); end if;
    if kind='connection_changed' then update public.booth_runs set observed_at=null,received_at=null,old_job_safety_confirmed=case when evidence_policy_version='instax-fi033-0102-dev-v1' then false else old_job_safety_confirmed end where id=r.id; end if;
    if a.dispatch_id is not null and (target in ('Printed','NotPrinted') or kind in ('outcome_unknown','connection_changed'))
      and not (r.evidence_policy_version='instax-fi033-0102-dev-v1' and kind='definitely_not_sent' and not discrepancy) then
      update public.booth_runs set old_job_safety_confirmed=false where id=r.id;
    end if;
  end if;
  if discrepancy and r.evidence_policy_version='instax-fi033-0102-dev-v1' then update public.booth_runs set old_job_safety_confirmed=false where id=r.id; end if;
  if kind='no_film_rejected' then
    update public.booth_runs set film_loaded_confirmed=false where id=r.id;
    insert into public.booth_reload_requests(event_id,run_id,printer_id,connection_generation,trigger)
      values(e.id,r.id,r.printer_id,r.connection_generation,'no_film') on conflict (run_id) where state='Open' do nothing;
  end if;
  if a.state in ('Printed','NotPrinted') and kind='ready_for_new_job' and not discrepancy
    and a.id=(select newest.id from public.print_attempts newest
      where newest.run_id=r.id and newest.accounting_version=2 and newest.dispatch_id is not null
      order by newest.dispatched_at desc,newest.id desc limit 1) then
    update public.booth_runs set old_job_safety_confirmed=true where id=r.id;
  end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  update public.events set revision=revision+1 where id=e.id returning * into e;
  if (target in ('Printed','NotPrinted') and a.state not in ('Printed','NotPrinted')) or kind='ready_for_new_job' then
    perform private.package_finish_if_clear(e.id,r.id);
    select * into e from public.events where id=e.id;
  end if;
  result:=jsonb_build_object('attemptId',a.id,'state',(select state from public.print_attempts where id=a.id),'discrepancy',discrepancy);
  insert into public.activity_events(event_id,attempt_id,accounting_version,actor_scope,operation_kind) values(e.id,a.id,2,actor,'observe');
  if (select state from public.booth_runs where id=r.id)<>'Finished' then
    update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  end if;
  return private.package_commit_receipt(e.id,actor,p_operation_id,'observe',p_payload,e.revision,result);
end $$;

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
  if r.evidence_policy_version is null then raise exception 'qualification_required'; end if;
  target:=case outcome when 'printed' then 'Printed' else 'NotPrinted' end;
  if r.evidence_policy_version='instax-fi033-0102-dev-v1' and target='NotPrinted' and a.state='Pending' and a.dispatch_id is not null then raise exception 'not_ready'; end if;
  if a.state in ('Printed','NotPrinted') then
    discrepancy:=a.state<>target;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,actor_id,state,evidence_kind,evidence_policy_version,reason)
      values(a.id,2,actor,p_admin_user_id,case when discrepancy then 'Discrepancy' else 'Diagnostic' end,'inspection',r.evidence_policy_version,reason);
    if discrepancy then update public.booth_runs set blockers=array_append(blockers,'evidence_discrepancy') where id=r.id and not ('evidence_discrepancy'=any(blockers)); end if;
  elsif a.state='Pending' then
    if target='NotPrinted' and p_payload->>'oldJobCleared'<>'true' then raise exception 'not_ready'; end if;
    update public.print_attempts set state=target,resolved_at=clock_timestamp(),evidence_policy_version=r.evidence_policy_version where id=a.id;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,actor_id,state,evidence_kind,evidence_policy_version,reason)
      values(a.id,2,actor,p_admin_user_id,target,'inspection',r.evidence_policy_version,reason);
    update public.booth_runs set old_job_safety_confirmed=(target='NotPrinted' and r.evidence_policy_version='simulator-v1') where id=r.id;
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

create or replace function private.package_booth_read(p_grant_hash text,p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; g public.booth_grants%rowtype; r public.booth_runs%rowtype;
begin
  result:=private.package_readiness_booth_read(p_grant_hash,p_operation_id);
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  select * into r from public.booth_runs where id=g.run_id;
  return result||jsonb_build_object('evidenceVersion',r.evidence_policy_version);
end $$;
