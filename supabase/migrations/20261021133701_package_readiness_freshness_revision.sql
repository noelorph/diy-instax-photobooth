-- Recovering expired dynamic readiness changes a blocker; fresh heartbeats remain revision-neutral.
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
    old_b:=private.package_equipment_blockers(r.readiness_observation,coalesce(r.observed_at between statement_timestamp()-interval '5 seconds' and statement_timestamp() and r.received_at between statement_timestamp()-interval '5 seconds' and statement_timestamp() and (r.readiness_observation->>'connectionGeneration')::integer=r.connection_generation,false),r.film_loaded_confirmed,r.power_confirmed,r.guided_access_confirmed);
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
