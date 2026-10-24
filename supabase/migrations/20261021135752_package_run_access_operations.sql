-- Version 2 lifecycle and handoff decisions share the package guard and Event lock.
alter table public.booth_handoffs add column purpose text not null default 'initial'
  check (purpose in ('initial','recovery'));

-- Called by outcome settlement while it already owns guard -> Event -> run -> attempt locks.
create function private.package_finish_if_clear(p_event uuid,p_run uuid) returns boolean
language plpgsql set search_path='' as $$
declare r public.booth_runs%rowtype; rev integer;
begin
  select * into r from public.booth_runs where id=p_run and event_id=p_event for update;
  if r.state<>'Finishing' or exists(select 1 from public.print_attempts where run_id=p_run and state in ('Reserved','Dispatching','Accepted','Pending','Uncertain')) then return false; end if;
  update public.booth_runs set state='Finished',finished_at=clock_timestamp(),ended_at=clock_timestamp(),revision=revision+1 where id=p_run;
  update public.booth_grants set state='Revoked',revoked_at=clock_timestamp() where run_id=p_run and state<>'Revoked';
  update public.booth_handoffs set state='Failed' where run_id=p_run and state in ('Prepared','Issued');
  update public.events set revision=revision+1 where id=p_event and revision<2147483647 returning revision into rev;
  if not found then raise exception 'operation_unavailable'; end if;
  return true;
end $$;

alter function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) rename to package_readiness_admin_operation;
create function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
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
  if p_operation='start' then required:=required||array['readinessWindowId','deviceHash','printerId','connectionGeneration'];
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
  if e.id is null or e.accounting_version<>2 then raise exception 'operation_unavailable'; end if;
  replay:=private.package_receipt(actor,p_operation_id,p_operation,p_payload,e.revision);
  if replay is not null then return replay; end if;
  if e.deleted_at is not null and p_operation<>'complete_delete_draft' then raise exception 'invalid_transition'; end if;
  if (p_payload->>'expectedRevision')::integer<>e.revision then raise exception 'stale_revision'; end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  at_time:=clock_timestamp();
  if p_operation='start' then
    if e.state not in ('Draft','Live') or e.booking_review_required or exists(select 1 from public.events where state='Live' and id<>eid) or exists(select 1 from public.booth_runs where event_id=eid and state<>'Finished') or exists(select 1 from public.print_attempts where state in ('Reserved','Dispatching','Accepted','Pending','Uncertain')) or (private.package_counts(eid)->>'printsAvailable')::bigint<=0 then raise exception 'invalid_transition'; end if;
    select * into w from private.package_readiness_windows where id=h for update;
    if w.id is null or w.event_id<>eid or w.run_id is not null or w.admin_user_id is distinct from p_admin_user_id or w.admin_session_id is distinct from p_admin_session_id or w.device_hash is distinct from p_payload->>'deviceHash' or w.printer_id is distinct from p_payload->>'printerId' or w.connection_generation::numeric<>(p_payload->>'connectionGeneration')::numeric or w.reported_at is null or w.expires_at<at_time or w.received_at>at_time or w.observation->>'cameraPermission' is distinct from 'true' or w.observation->>'cameraLive' is distinct from 'true' or w.observation->>'serverReachable' is distinct from 'true' or w.observation->>'printerConnected' is distinct from 'true' or w.observation->>'printerReady' is distinct from 'true' or w.observation->>'oldJobCleared' is distinct from 'true' or w.observation->>'filmLoadedConfirmed' is distinct from 'true' or w.observation->>'powerConfirmed' is distinct from 'true' or w.observation->>'guidedAccessConfirmed' is distinct from 'true' or exists(select 1 from private.package_readiness_windows newer where newer.event_id=eid and newer.run_id is null and newer.issuance_order>w.issuance_order) then raise exception 'not_ready'; end if;
    if not exists(select 1 from public.printer_completion_policy where id and mode='simulated') then raise exception 'qualification_required'; end if;
    insert into public.booth_runs(event_id,accounting_version,state,device_hash,printer_id,connection_generation,readiness_observation,observed_at,received_at,film_loaded_confirmed,power_confirmed,guided_access_confirmed)
      values(eid,2,'Prepared',w.device_hash,w.printer_id,w.connection_generation,w.observation,w.received_at,w.reported_at,true,true,true) returning id into rid;
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
    update public.events set title=null,client_name=null,client_email=null,client_phone=null,venue_address=null,time_zone=null,starts_at=null,ends_at=null,deleted_at=at_time,media_removal_state='pending',revision=revision+1 where id=eid returning * into e;
    result:=jsonb_build_object('mediaRemovalState','pending');
  else
    if e.state<>'Draft' or e.deleted_at is null or e.media_removal_state<>'pending' or not exists(select 1 from public.operation_receipts where event_id=eid and operation_kind='begin_delete_draft' and accounting_version=2) then raise exception 'invalid_transition'; end if;
    if exists(select 1 from storage.objects where bucket_id='event_media' and starts_with(name,eid::text||'/')) then raise exception 'not_ready'; end if;
    update public.events set media_removal_state='complete',revision=revision+1 where id=eid returning * into e;
    result:=jsonb_build_object('mediaRemovalState','complete');
  end if;
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(eid,2,actor,p_operation);
  return private.package_commit_receipt(eid,actor,p_operation_id,p_operation,p_payload,e.revision,result);
end $$;

create function private.package_issue_handoff(p_handoff_id uuid,p_device_hash text,p_operation_id uuid,p_grant_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.booth_handoffs%rowtype; e public.events%rowtype; g public.booth_grants%rowtype; replay jsonb; result jsonb; payload jsonb; actor text;
begin
  if p_handoff_id is null or p_operation_id is null or p_device_hash !~ '^[0-9a-f]{64}$' or p_grant_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into h from public.booth_handoffs where id=p_handoff_id;
  if h.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=h.event_id for update;
  select * into g from public.booth_grants where id=h.grant_id for update;
  select * into h from public.booth_handoffs where id=p_handoff_id for update;
  actor:='handoff:'||h.id;
  payload:=jsonb_build_object('handoffId',h.id,'deviceHash',p_device_hash,'grantHash',p_grant_hash);
  replay:=private.package_receipt(actor,p_operation_id,'issue_handoff',payload,e.revision);
  if replay is not null then return replay; end if;
  if h.state<>'Prepared' or h.expires_at<=clock_timestamp() or h.device_token_hash<>p_device_hash or g.device_hash<>p_device_hash or g.state<>'Inactive' or g.revoked_at is not null or e.state<>'Live' or exists(select 1 from auth.sessions where id=h.admin_session_id) then raise exception 'access_required'; end if;
  update public.booth_grants set secret_hash=p_grant_hash where id=g.id;
  update public.booth_handoffs set state='Issued' where id=h.id;
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('handoffId',h.id,'purpose',h.purpose);
  return private.package_commit_receipt(e.id,actor,p_operation_id,'issue_handoff',payload,e.revision,result);
end $$;

alter function private.package_booth_read(text,uuid) rename to package_readiness_booth_read;
create function private.package_booth_read(p_grant_hash text,p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; g public.booth_grants%rowtype;
begin
  result:=private.package_readiness_booth_read(p_grant_hash,p_operation_id);
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return result;
end $$;

alter function private.package_booth_operation(text,text,uuid,jsonb) rename to package_readiness_booth_operation;
create function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.booth_handoffs%rowtype; g public.booth_grants%rowtype; r public.booth_runs%rowtype; e public.events%rowtype; replay jsonb; result jsonb; actor text;
begin
  if p_operation<>'confirm_handoff' then
    result:=private.package_readiness_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
    update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where secret_hash=p_grant_hash;
    return result;
  end if;
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' or not (p_payload ?& array['handoffId','deviceHash']) or (p_payload-array['handoffId','deviceHash'])<>'{}' or jsonb_typeof(p_payload->'handoffId')<>'string' or jsonb_typeof(p_payload->'deviceHash')<>'string' then raise exception 'invalid_input'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  begin select * into h from public.booth_handoffs where id=(p_payload->>'handoffId')::uuid and grant_id=g.id for update; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  actor:='booth:'||g.id;
  if g.state not in ('Inactive','Active') or g.revoked_at is not null or g.expires_at<=clock_timestamp() or e.state<>'Live' or r.state not in ('Prepared','Paused','Active') or h.id is null or h.device_token_hash<>p_payload->>'deviceHash' or g.device_hash<>p_payload->>'deviceHash' then raise exception 'access_required'; end if;
  replay:=private.package_receipt(actor,p_operation_id,p_operation,p_payload,e.revision);
  if replay is not null then return replay; end if;
  if h.state<>'Issued' or h.expires_at<=clock_timestamp() or exists(select 1 from auth.sessions where id=h.admin_session_id) or h.purpose='initial' and r.state<>'Prepared' or h.purpose='recovery' and r.state<>'Paused' then raise exception 'invalid_transition'; end if;
  update public.booth_handoffs set state='Confirmed' where id=h.id;
  update public.booth_grants set state='Active',last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  if h.purpose='initial' then update public.booth_runs set state='Active',revision=revision+1 where id=r.id; end if;
  update public.events set revision=revision+1 where id=e.id returning * into e;
  result:=jsonb_build_object('runId',r.id,'state',case when h.purpose='initial' then 'Active' else 'Paused' end,'purpose',h.purpose);
  return private.package_commit_receipt(e.id,actor,p_operation_id,p_operation,p_payload,e.revision,result);
end $$;

create function public.package_issue_handoff(p_handoff_id uuid,p_device_hash text,p_operation_id uuid,p_grant_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_issue_handoff(p_handoff_id,p_device_hash,p_operation_id,p_grant_hash) $$;
create or replace function public.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload) $$;
create or replace function public.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload) $$;
create or replace function public.package_booth_read(p_grant_hash text,p_operation_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_booth_read(p_grant_hash,p_operation_id) $$;
revoke all on function private.package_finish_if_clear(uuid,uuid),private.package_readiness_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_issue_handoff(uuid,text,uuid,text),private.package_readiness_booth_read(text,uuid),private.package_booth_read(text,uuid),private.package_readiness_booth_operation(text,text,uuid,jsonb),private.package_booth_operation(text,text,uuid,jsonb),public.package_issue_handoff(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.package_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_issue_handoff(uuid,text,uuid,text),private.package_booth_read(text,uuid),private.package_booth_operation(text,text,uuid,jsonb),public.package_issue_handoff(uuid,text,uuid,text) to service_role;
