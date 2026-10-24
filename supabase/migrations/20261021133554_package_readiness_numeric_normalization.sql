-- Whole JSON decimals share the same bounded-integer contract and receipt fingerprint.
create function private.package_normalize_readiness_payload(p_payload jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; n numeric;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then return p_payload; end if;
  foreach k in array array['observedAgeMs','connectionGeneration','expectedRevision'] loop
    if jsonb_typeof(p_payload->k)='number' then
      n:=(p_payload->>k)::numeric;
      if n=trunc(n) and n between 0 and 2147483647 then p_payload:=jsonb_set(p_payload,array[k],to_jsonb(n::integer)); end if;
    end if;
  end loop;
  return p_payload;
end $$;
revoke all on function private.package_normalize_readiness_payload(jsonb) from public,anon,authenticated,service_role;

create or replace function private.package_report_readiness(p_event uuid,p_run uuid,p_device text,p_admin uuid,p_session uuid,p_grant uuid,p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare w private.package_readiness_windows%rowtype; r public.booth_runs%rowtype; o jsonb:=p_payload->'observation'; generation integer; changed boolean:=false; old_b text[]; new_b text[]; req uuid; rev integer;
begin
  p_payload:=private.package_normalize_readiness_payload(p_payload);
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

create or replace function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:='admin:'||p_admin_user_id; e public.events%rowtype; r public.booth_runs%rowtype; q public.booth_reload_requests%rowtype; normalized jsonb:=p_payload; result jsonb; replay jsonb; eid uuid; rid uuid; gen integer; required text[];
begin
  p_payload:=private.package_normalize_readiness_payload(p_payload);
  normalized:=p_payload;
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

create or replace function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; replay jsonb; result jsonb; actor text;
begin
  p_payload:=private.package_normalize_readiness_payload(p_payload);
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
