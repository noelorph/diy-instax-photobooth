create function private.package_counts(p_event_id uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare b bigint; a bigint; c bigint; u bigint; total bigint;
begin
  select film_package_count into b from public.events where id=p_event_id and accounting_version=2 and deleted_at is null;
  if not found then raise exception 'operation_unavailable'; end if;
  select coalesce(sum(packages::bigint),0) into a from public.additional_film_package_entries where event_id=p_event_id;
  select count(*) filter(where state='Printed'),count(*) filter(where state in ('Reserved','Dispatching','Accepted','Pending')) into c,u
    from public.print_attempts where event_id=p_event_id and accounting_version=2 and kind='Guest';
  total:=10*(b+a);
  if b+a>214748364 or c+u>total then raise exception 'operation_unavailable'; end if;
  return jsonb_build_object('originalPackages',b,'additionalPackages',a,'totalBookedPrints',total,'printed',c,'unresolved',u,'printsRemaining',total-c,'printsAvailable',total-c-u);
end $$;

create function private.package_receipt(p_actor text,p_key uuid,p_kind text,p_payload jsonb,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
declare r public.operation_receipts%rowtype; digest text;
begin
  digest:=encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'payload',p_payload)::text,'UTF8')),'hex');
  select * into r from public.operation_receipts where accounting_version=2 and actor_scope=p_actor and operation_key=p_key;
  if not found then return null; end if;
  if r.operation_kind<>p_kind or r.input_digest<>digest then raise exception 'operation_conflict'; end if;
  return jsonb_build_object('receipt',jsonb_build_object('operationId',r.operation_key,'kind',r.operation_kind,'committedRevision',r.committed_revision,'result',r.result),'revision',p_revision,'replayed',true);
end $$;

create function private.package_commit_receipt(p_event uuid,p_actor text,p_key uuid,p_kind text,p_payload jsonb,p_revision integer,p_result jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
  insert into public.operation_receipts(event_id,accounting_version,actor_scope,operation_kind,operation_key,input_digest,result,committed_revision)
  values(p_event,2,p_actor,p_kind,p_key,encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'payload',p_payload)::text,'UTF8')),'hex'),p_result,p_revision);
  return jsonb_build_object('receipt',jsonb_build_object('operationId',p_key,'kind',p_kind,'committedRevision',p_revision,'result',p_result),'revision',p_revision,'replayed',false);
end $$;

create function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:='admin:'||p_admin_user_id; e public.events%rowtype; eid uuid; packages bigint; note text; normalized jsonb; replay jsonb; entry uuid;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if p_operation_id is null or p_operation is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input'; end if;
  -- All actors and operation kinds share this lock order with later Booth operations.
  perform 1 from private.booth_contract_guard where id for update;
  begin eid:=(p_payload->>'eventId')::uuid; exception when invalid_text_representation then raise exception 'invalid_input'; end;
  select * into e from public.events where id=eid for update;
  normalized:=p_payload;
  if p_operation='add_packages' then
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
  packages:=(p_payload->>'packages')::bigint;
  if e.id is null or e.accounting_version<>2 or e.deleted_at is not null then raise exception 'operation_unavailable'; end if;
  if e.state<>'Live' then raise exception 'invalid_transition'; end if;
  if e.revision=2147483647 or e.film_package_count::bigint+packages+(select coalesce(sum(a.packages::bigint),0) from public.additional_film_package_entries a where a.event_id=eid)>214748364 then raise exception 'invalid_input'; end if;
  insert into public.additional_film_package_entries(event_id,packages,client_request_note,actor_id,operation_key) values(eid,packages,note,p_admin_user_id,p_operation_id) returning id into entry;
  update public.events set revision=revision+1 where id=eid returning * into e;
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind) values(eid,2,actor,'add_packages');
  return private.package_commit_receipt(eid,actor,p_operation_id,p_operation,normalized,e.revision,private.package_counts(eid)||jsonb_build_object('entryId',entry));
end $$;

create function private.package_admin_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; receipt jsonb;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  select * into e from public.events where id=p_event_id and accounting_version=2 and deleted_at is null for share;
  if not found then raise exception 'operation_unavailable'; end if;
  select jsonb_build_object('operationId',operation_key,'kind',operation_kind,'committedRevision',committed_revision,'result',result) into receipt from public.operation_receipts
  where accounting_version=2 and event_id=p_event_id and actor_scope='admin:'||p_admin_user_id and operation_key=p_operation_id;
  return jsonb_build_object('counts',private.package_counts(p_event_id),'revision',e.revision,'receipt',receipt);
end $$;

create function public.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_admin_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload) $$;
create function public.package_admin_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_operation_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.package_admin_read(p_admin_user_id,p_admin_session_id,p_event_id,p_operation_id) $$;

revoke all on function private.package_counts(uuid),private.package_receipt(text,uuid,text,jsonb,integer),private.package_commit_receipt(uuid,text,uuid,text,jsonb,integer,jsonb),private.package_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_admin_read(uuid,uuid,uuid,uuid),public.package_admin_operation(uuid,uuid,text,uuid,jsonb),public.package_admin_read(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant usage on schema private to service_role;
grant execute on function private.package_admin_operation(uuid,uuid,text,uuid,jsonb),private.package_admin_read(uuid,uuid,uuid,uuid),public.package_admin_operation(uuid,uuid,text,uuid,jsonb),public.package_admin_read(uuid,uuid,uuid,uuid) to service_role;
