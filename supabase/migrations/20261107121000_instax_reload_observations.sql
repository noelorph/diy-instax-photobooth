-- Request-bound reload evidence changes film readiness only.
alter table public.booth_grants add constraint booth_grants_attribution_key unique(id,event_id,run_id);
alter table public.booth_reload_requests
  add column confirmed_by_grant_id uuid,
  add column observation_id uuid,
  add column evidence_policy_version text,
  add constraint booth_reload_requests_grant_fkey foreign key(confirmed_by_grant_id,event_id,run_id)
    references public.booth_grants(id,event_id,run_id);
alter table public.booth_reload_requests drop constraint booth_reload_requests_check;
alter table public.booth_reload_requests add constraint booth_reload_confirmation_check check ((
  state<>'Confirmed' or (confirmed_at is not null and (
    (confirmation_source='admin_physical_confirmation' and confirmed_by is not null
      and confirmed_by_grant_id is null and observation_id is null and evidence_policy_version is null)
    or (confirmation_source='instax_automatic_reload' and confirmed_by is null
      and confirmed_by_grant_id is not null and observation_id is not null
      and evidence_policy_version='instax-fi033-0102-dev-v1')
  ))) is true);
create unique index booth_reload_observation_idx on public.booth_reload_requests(observation_id) where observation_id is not null;

create function private.package_observe_reload(p_grant_hash text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.booth_grants%rowtype; e public.events%rowtype; r public.booth_runs%rowtype;
  q public.booth_reload_requests%rowtype; actor text; replay jsonb; rid uuid; oid uuid; generation numeric; rev numeric;
  required text[]:=array['reloadRequestId','reloadRequestRevision','printerId','connectionGeneration','observationId','kind','adapterVersion','evidenceVersion'];
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or not(p_payload ?& required) or (p_payload-required)<>'{}' then raise exception 'invalid_input'; end if;
  if jsonb_typeof(p_payload->'reloadRequestId')<>'string' or jsonb_typeof(p_payload->'observationId')<>'string'
    or jsonb_typeof(p_payload->'printerId')<>'string' or length(p_payload->>'printerId') not between 1 and 128
    or p_payload->>'printerId' !~ '[^[:space:]]'
    or jsonb_typeof(p_payload->'connectionGeneration')<>'number' or jsonb_typeof(p_payload->'reloadRequestRevision')<>'number'
    or p_payload->>'kind' is distinct from 'film_loaded' then raise exception 'invalid_input'; end if;
  begin rid:=(p_payload->>'reloadRequestId')::uuid; oid:=(p_payload->>'observationId')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_input'; end;
  generation:=(p_payload->>'connectionGeneration')::numeric; rev:=(p_payload->>'reloadRequestRevision')::numeric;
  if rid is null or oid is null or oid<>p_operation_id or generation<>trunc(generation) or generation not between 0 and 2147483647
    or rev<>trunc(rev) or rev not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
  p_payload:=jsonb_set(jsonb_set(p_payload,'{connectionGeneration}',to_jsonb(generation::integer)),'{reloadRequestRevision}',to_jsonb(rev::integer));
  perform 1 from private.booth_contract_guard where id for update;
  select * into g from public.booth_grants where secret_hash=p_grant_hash;
  if g.id is null then raise exception 'access_required'; end if;
  select * into e from public.events where id=g.event_id for update;
  select * into r from public.booth_runs where id=g.run_id for update;
  select * into g from public.booth_grants where id=g.id for update;
  g:=private.package_require_booth(p_grant_hash,'observe');
  actor:='booth:'||g.id;
  replay:=private.package_receipt(actor,p_operation_id,'observe_reload',p_payload,e.revision);
  if replay is not null then return replay; end if;
  select * into q from public.booth_reload_requests where id=rid and event_id=e.id and run_id=r.id for update;
  if q.id is null or q.state='Superseded' or q.printer_id is distinct from p_payload->>'printerId'
    or q.printer_id is distinct from r.printer_id or q.connection_generation<>generation
    or r.connection_generation<>generation or r.state not in ('Active','Paused','Finishing')
    or exists(select 1 from public.booth_reload_requests where run_id=r.id and state='Open' and id<>q.id)
    or (q.state='Open' and q.revision<>rev) or (q.state='Confirmed' and q.revision<>rev+1) then raise exception 'not_ready'; end if;
  if r.evidence_policy_version is distinct from 'instax-fi033-0102-dev-v1'
    or p_payload->>'evidenceVersion' is distinct from r.evidence_policy_version
    or p_payload->>'adapterVersion' is distinct from 'instax-mini-link3-v1' then raise exception 'qualification_required'; end if;
  if q.state='Open' then
    if e.revision=2147483647 or q.revision=2147483647 then raise exception 'operation_unavailable'; end if;
    update public.booth_reload_requests set state='Confirmed',confirmed_at=statement_timestamp(),
      confirmed_by_grant_id=g.id,observation_id=oid,evidence_policy_version=r.evidence_policy_version,
      confirmation_source='instax_automatic_reload',revision=revision+1 where id=q.id;
    update public.booth_runs set film_loaded_confirmed=true where id=r.id;
    update public.events set revision=revision+1 where id=e.id returning * into e;
    insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(e.id,2,actor,'observe_reload');
  end if;
  update public.booth_grants set last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where id=g.id;
  return private.package_commit_receipt(e.id,actor,p_operation_id,'observe_reload',p_payload,e.revision,jsonb_build_object('reloadRequestId',q.id,'alreadyConfirmed',q.state='Confirmed'));
end $$;

alter function private.package_booth_operation(text,text,uuid,jsonb) rename to package_before_reload_observation_booth_operation;
create function private.package_booth_operation(p_grant_hash text,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_operation='observe_reload' then return private.package_observe_reload(p_grant_hash,p_operation_id,p_payload); end if;
  return private.package_before_reload_observation_booth_operation(p_grant_hash,p_operation,p_operation_id,p_payload);
end $$;
revoke all on function private.package_observe_reload(text,uuid,jsonb),private.package_before_reload_observation_booth_operation(text,text,uuid,jsonb),private.package_booth_operation(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.package_booth_operation(text,text,uuid,jsonb) to service_role;

create or replace function private.package_readiness_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
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
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
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
    if p_operation='request_reload' and (p_payload->>'expectedRevision')::integer<>e.revision then raise exception 'stale_revision'; end if;
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
      if not found or q.state='Superseded' or q.printer_id<>r.printer_id or q.connection_generation<>gen
        or exists(select 1 from public.booth_reload_requests where run_id=r.id and state='Open' and id<>q.id) then raise exception 'not_ready'; end if;
      if q.state='Confirmed' then
        return private.package_commit_receipt(eid,actor,p_operation_id,p_operation,normalized,e.revision,jsonb_build_object('reloadRequestId',q.id,'alreadyConfirmed',true));
      end if;
      if (p_payload->>'expectedRevision')::integer<>e.revision then raise exception 'stale_revision'; end if;
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
