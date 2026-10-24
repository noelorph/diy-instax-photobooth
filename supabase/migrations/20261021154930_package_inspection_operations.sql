-- Exceptional inspected recovery shares the package guard and outcome receipt rules.
create function private.package_resolve_attempt(p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_payload jsonb) returns jsonb
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
  if e.id is null or e.accounting_version<>2 or e.state<>'Live' then raise exception 'operation_unavailable'; end if;
  select * into a from public.print_attempts where id=aid and event_id=e.id and accounting_version=2;
  if a.id is null then raise exception 'invalid_transition'; end if;
  select * into r from public.booth_runs where id=a.run_id and event_id=e.id and accounting_version=2 for update;
  select * into a from public.print_attempts where id=aid and event_id=e.id and run_id=r.id and accounting_version=2 for update;
  actor:='admin:'||p_admin_user_id;
  replay:=private.package_receipt(actor,p_operation_id,'resolve_attempt',p_payload,e.revision);
  if replay is not null then return replay; end if;
  if expected::integer<>e.revision then raise exception 'stale_revision'; end if;
  if r.state not in ('Active','Paused','Finishing') then raise exception 'invalid_transition'; end if;
  if not exists(select 1 from public.printer_completion_policy where id and mode='simulated') then raise exception 'qualification_required'; end if;
  target:=case outcome when 'printed' then 'Printed' else 'NotPrinted' end;
  if a.state in ('Printed','NotPrinted') then
    discrepancy:=a.state<>target;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,actor_id,state,evidence_kind,evidence_policy_version,reason)
      values(a.id,2,actor,p_admin_user_id,case when discrepancy then 'Discrepancy' else 'Diagnostic' end,'inspection','simulator-v1',reason);
    if discrepancy then update public.booth_runs set blockers=array_append(blockers,'evidence_discrepancy') where id=r.id and not ('evidence_discrepancy'=any(blockers)); end if;
  elsif a.state='Pending' then
    if target='NotPrinted' and p_payload->>'oldJobCleared'<>'true' then raise exception 'not_ready'; end if;
    update public.print_attempts set state=target,resolved_at=clock_timestamp(),evidence_policy_version='simulator-v1' where id=a.id;
    insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,actor_id,state,evidence_kind,evidence_policy_version,reason)
      values(a.id,2,actor,p_admin_user_id,target,'inspection','simulator-v1',reason);
    update public.booth_runs set old_job_safety_confirmed=(target='NotPrinted') where id=r.id;
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

alter function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) rename to package_before_inspection_admin_operation;
create function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_operation='resolve_attempt' then return private.package_resolve_attempt(p_admin_user_id,p_admin_session_id,p_operation_id,p_payload); end if;
  return private.package_before_inspection_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload);
end $$;

revoke all on function private.package_resolve_attempt(uuid,uuid,uuid,jsonb),private.package_before_inspection_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_admin_operation(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_admin_operation(uuid,uuid,text,uuid,jsonb) to service_role;
