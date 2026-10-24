-- Canonical whole numbers share one receipt fingerprint regardless of JSON decimal scale.
create or replace function private.package_admin_operation(p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb) returns jsonb
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

