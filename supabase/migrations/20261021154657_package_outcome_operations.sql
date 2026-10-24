-- Only the isolated simulator policy is executable. Physical policies stay disabled.
alter table public.booth_runs add column old_job_safety_confirmed boolean not null default true;
alter table public.print_attempt_events
  add column observation_id uuid,
  add column connection_generation integer check(connection_generation>=0),
  add column safe_metadata jsonb not null default '{}' check(jsonb_typeof(safe_metadata)='object');
create unique index print_attempt_events_observation_idx on public.print_attempt_events(attempt_id,observation_id) where observation_id is not null;

alter function private.package_readiness(uuid,text,uuid) rename to package_before_outcomes_readiness;
create function private.package_readiness(p_event_id uuid,p_stage text,p_attempt_id uuid default null) returns jsonb
language plpgsql volatile set search_path='' as $$
declare result jsonb; r public.booth_runs%rowtype;
begin
  result:=private.package_before_outcomes_readiness(p_event_id,p_stage,p_attempt_id);
  if p_stage<>'setup' then
    select * into r from public.booth_runs where event_id=p_event_id and accounting_version=2 and state<>'Finished';
    if r.id is not null and not r.old_job_safety_confirmed then
      result:=jsonb_set(result,'{ready}','false'::jsonb);
      result:=jsonb_set(result,'{blockers}',to_jsonb(array_append(array(select jsonb_array_elements_text(result->'blockers')),'printer_not_safe')));
    end if;
  end if;
  return result;
end $$;

create function private.package_validate_observation(p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare id uuid; oid uuid; generation numeric; kind text; metadata jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or not (p_payload ?& array['attemptId','observationId','kind','evidenceVersion','connectionGeneration','metadata'])
    or (p_payload-array['attemptId','observationId','kind','evidenceVersion','connectionGeneration','metadata'])<>'{}'
    or jsonb_typeof(p_payload->'attemptId')<>'string' or jsonb_typeof(p_payload->'observationId')<>'string'
    or jsonb_typeof(p_payload->'kind')<>'string' or jsonb_typeof(p_payload->'evidenceVersion')<>'string'
    or jsonb_typeof(p_payload->'connectionGeneration')<>'number' or jsonb_typeof(p_payload->'metadata')<>'object' then raise exception 'invalid_input'; end if;
  begin id:=(p_payload->>'attemptId')::uuid; oid:=(p_payload->>'observationId')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_input'; end;
  kind:=p_payload->>'kind'; generation:=(p_payload->>'connectionGeneration')::numeric; metadata:=p_payload->'metadata';
  if id is null or oid is null or kind not in ('definitely_not_sent','command_accepted','full_ejection_confirmed','no_film_rejected','outcome_unknown','connection_changed','ready_for_new_job')
    or generation<>trunc(generation) or generation not between 0 and 2147483647
    or p_payload->>'evidenceVersion'<>'simulator-v1' or metadata<>'{}' then raise exception 'invalid_input'; end if;
  return jsonb_set(p_payload,'{connectionGeneration}',to_jsonb(generation::integer));
end $$;

create function private.package_observe(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
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
  if a.id is null or a.printer_id is distinct from r.printer_id or generation is distinct from a.connection_generation then raise exception 'invalid_transition'; end if;
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'observe',p_payload,e.revision);
  if replay is not null then return replay; end if;
  if exists(select 1 from public.print_attempt_events where attempt_id=a.id and observation_id=oid) then raise exception 'operation_conflict'; end if;
  if not exists(select 1 from public.printer_completion_policy where id and mode='simulated') then raise exception 'qualification_required'; end if;
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
    discrepancy:=target in ('Printed','NotPrinted') and target<>a.state;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state,evidence_kind,evidence_policy_version,observation_id,connection_generation,safe_metadata)
      values(a.id,2,actor,case when discrepancy then 'Discrepancy' else 'Diagnostic' end,kind,'simulator-v1',oid,generation,p_payload->'metadata');
    if discrepancy then update public.booth_runs set blockers=array_append(blockers,'evidence_discrepancy') where id=r.id and not ('evidence_discrepancy'=any(blockers)); end if;
  else
    if a.state='Reserved' and kind<>'definitely_not_sent' then raise exception 'invalid_transition'; end if;
    if a.state='Pending' and kind in ('command_accepted','outcome_unknown','connection_changed') then target:='Pending'; end if;
    if kind='ready_for_new_job' then target:=a.state; end if;
    if target<>a.state then
      update public.print_attempts set state=target,accepted_at=case when target='Accepted' then clock_timestamp() else accepted_at end,
        resolved_at=case when target in ('Printed','NotPrinted') then clock_timestamp() else resolved_at end,
        evidence_policy_version=case when target in ('Printed','NotPrinted') then 'simulator-v1' else evidence_policy_version end where id=a.id;
    end if;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state,evidence_kind,evidence_policy_version,observation_id,connection_generation,safe_metadata)
      values(a.id,2,actor,case when target=a.state then 'Diagnostic' else target end,kind,'simulator-v1',oid,generation,p_payload->'metadata');
    if kind='connection_changed' then update public.booth_runs set observed_at=null,received_at=null where id=r.id; end if;
    if target in ('Printed','NotPrinted') then
      update public.booth_runs set old_job_safety_confirmed=false where id=r.id;
      if kind='no_film_rejected' then
        update public.booth_runs set film_loaded_confirmed=false where id=r.id;
        insert into public.booth_reload_requests(event_id,run_id,printer_id,connection_generation,trigger)
          values(e.id,r.id,r.printer_id,r.connection_generation,'no_film') on conflict (run_id) where state='Open' do nothing;
      end if;
    end if;
  end if;
  if a.state in ('Printed','NotPrinted') and kind='ready_for_new_job' and not discrepancy then
    update public.booth_runs set old_job_safety_confirmed=true where id=r.id;
  end if;
  if e.revision=2147483647 then raise exception 'operation_unavailable'; end if;
  update public.events set revision=revision+1 where id=e.id returning * into e;
  if target in ('Printed','NotPrinted') and a.state not in ('Printed','NotPrinted') then
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

alter function private.package_booth_operation(text,text,uuid,jsonb) rename to package_before_outcomes_booth_operation;
create function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_operation='observe' then return private.package_observe(p_grant_hash,p_operation_id,p_payload); end if;
  return private.package_before_outcomes_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
end $$;

revoke all on function private.package_before_outcomes_readiness(uuid,text,uuid),private.package_readiness(uuid,text,uuid),private.package_validate_observation(jsonb),private.package_observe(text,uuid,jsonb),private.package_before_outcomes_booth_operation(text,text,uuid,jsonb),private.package_booth_operation(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_booth_operation(text,text,uuid,jsonb) to service_role;
