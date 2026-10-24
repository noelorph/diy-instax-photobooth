-- Recheck current Admin authority after the Event lock wait, before replay or mutation.
create or replace function private.package_accounting_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:='admin:'||p_admin_user_id; e public.events%rowtype; eid uuid; packages bigint; note text; normalized jsonb; replay jsonb; entry uuid;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if p_operation_id is null or p_operation is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input'; end if;
  -- All actors and operation kinds share this lock order with later Booth operations.
  perform 1 from private.booth_contract_guard where id for update;
  begin eid:=(p_payload->>'eventId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  select * into e from public.events where id=eid for update;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  normalized:=p_payload;
  if p_operation='add_packages' then
    if jsonb_typeof(p_payload->'packages')='number'
      and (p_payload->>'packages')::numeric=trunc((p_payload->>'packages')::numeric)
      and (p_payload->>'packages')::numeric between 1 and 214748364 then
      normalized:=jsonb_set(normalized,'{packages}',to_jsonb((p_payload->>'packages')::numeric::bigint));
    end if;
    if jsonb_typeof(p_payload->'clientRequestNote')='string' then normalized:=jsonb_set(normalized,'{clientRequestNote}',to_jsonb(btrim(p_payload->>'clientRequestNote'))); end if;
  end if;
  replay:=private.package_receipt(actor,p_operation_id,p_operation,normalized,e.revision);
  if replay is not null then return replay; end if;
  if p_operation<>'add_packages' then raise exception 'operation_forbidden'; end if;
  if not (p_payload ?& array['eventId','packages','clientRequestNote']) or (p_payload-array['eventId','packages','clientRequestNote'])<>'{}'::jsonb
    or jsonb_typeof(p_payload->'eventId')<>'string' or eid is null
    or jsonb_typeof(p_payload->'packages')<>'number' or (p_payload->>'packages')::numeric<>trunc((p_payload->>'packages')::numeric)
    or (p_payload->>'packages')::numeric not between 1 and 214748364
    or jsonb_typeof(p_payload->'clientRequestNote')<>'string' then raise exception 'invalid_input'; end if;
  note:=normalized->>'clientRequestNote';
  if note !~ '[^[:space:]]' then raise exception 'invalid_input'; end if;
  packages:=(p_payload->>'packages')::numeric::bigint;
  if e.id is null or e.accounting_version<>2 or e.deleted_at is not null then raise exception 'operation_unavailable'; end if;
  if e.state<>'Live' then raise exception 'invalid_transition'; end if;
  if e.revision=2147483647 or e.film_package_count::bigint+packages+(select coalesce(sum(a.packages::bigint),0) from public.additional_film_package_entries a where a.event_id=eid)>214748364 then raise exception 'invalid_input'; end if;
  insert into public.additional_film_package_entries(event_id,packages,client_request_note,actor_id,operation_key) values(eid,packages,note,p_admin_user_id,p_operation_id) returning id into entry;
  update public.events set revision=revision+1 where id=eid returning * into e;
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(eid,2,actor,'add_packages');
  return private.package_commit_receipt(eid,actor,p_operation_id,p_operation,normalized,e.revision,private.package_counts(eid)||jsonb_build_object('entryId',entry));
end $$;



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
