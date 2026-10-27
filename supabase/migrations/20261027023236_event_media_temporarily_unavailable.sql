-- ADR-0031: pause new authorization/publication without retiring data or claiming cleanup.
-- No runtime switch: restoring media requires a reviewed forward migration and qualification.
create or replace function private.event_media_upload_allowed(object_name text) returns boolean
language sql volatile security definer set search_path='' as $$ select false $$;

create or replace function private.event_media_operation(
  p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor text := 'admin:'||p_admin_user_id;
  e public.events%rowtype;
  a public.event_media_assets%rowtype;
  replay jsonb;
  result jsonb;
  eid uuid;
  key_kind text := 'media_'||p_operation;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if p_operation_id is null or p_operation not in ('begin_upload','attach','remove')
    or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input'; end if;
  begin eid := (p_payload->>'eventId')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_input'; end;
  if eid is null or jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number'
    or (p_payload->>'expectedRevision')::numeric not between 1 and 2147483646
    or (p_payload->>'expectedRevision')::numeric<>trunc((p_payload->>'expectedRevision')::numeric) then raise exception 'invalid_input'; end if;
  if p_operation='begin_upload' then
    if p_payload-array['eventId','expectedRevision','kind']<>'{}' or not (p_payload ? 'kind')
      or p_payload->>'kind' not in ('background','montage') then raise exception 'invalid_input'; end if;
  elsif p_operation='remove' then
    if p_payload-array['eventId','expectedRevision','assetId']<>'{}' then raise exception 'invalid_input'; end if;
  else
    if p_payload-array['eventId','expectedRevision','assetId','contentType','byteLength','durationMs']<>'{}'
      or jsonb_typeof(p_payload->'byteLength') is distinct from 'number'
      or (p_payload->>'byteLength')::numeric<>trunc((p_payload->>'byteLength')::numeric)
      or (p_payload->>'byteLength')::numeric not between 1 and 50000000 then raise exception 'invalid_input'; end if;
  end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=eid for update;
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  if e.id is null or e.accounting_version<>2 then raise exception 'operation_forbidden'; end if;
  -- Old begin receipts cannot authorize new bytes while uploads are paused.
  if p_operation='begin_upload' then raise exception 'operation_unavailable'; end if;
  replay := private.package_receipt(actor,p_operation_id,key_kind,p_payload,e.revision);
  if replay is not null then return replay; end if;
  if p_operation='attach' then raise exception 'operation_unavailable'; end if;
  if e.state<>'Draft' or e.deleted_at is not null then raise exception 'invalid_transition'; end if;
  if e.revision<>(p_payload->>'expectedRevision')::integer then raise exception 'stale_revision'; end if;
  if p_operation='begin_upload' then
    a.id := gen_random_uuid();
    insert into public.event_media_assets(id,event_id,kind,path,uploaded_by)
      values(a.id,eid,p_payload->>'kind',eid::text||'/'||a.id::text,p_admin_user_id) returning * into a;
    result := jsonb_build_object('assetId',a.id,'bucket','event_media','path',a.path);
  else
    begin select * into a from public.event_media_assets where id=(p_payload->>'assetId')::uuid and event_id=eid for update;
    exception when invalid_text_representation then raise exception 'invalid_input'; end;
    if a.id is null then raise exception 'operation_forbidden'; end if;
    if p_operation='attach' then
      if a.state<>'uploading' or a.uploaded_by<>p_admin_user_id or a.upload_expires_at<=clock_timestamp() then raise exception 'invalid_transition'; end if;
      if not exists(select 1 from storage.objects where bucket_id='event_media' and name=a.path) then raise exception 'not_ready'; end if;
      if (a.kind='background' and ((p_payload->>'contentType') not in ('image/jpeg','image/png','image/webp')
        or (p_payload->>'byteLength')::integer>10000000 or p_payload->'durationMs' is distinct from 'null'::jsonb))
        or (a.kind='montage' and ((p_payload->>'contentType') is distinct from 'video/mp4'
        or jsonb_typeof(p_payload->'durationMs') is distinct from 'number'
        or (p_payload->>'durationMs')::numeric not between 1 and 30000
        or (p_payload->>'durationMs')::numeric<>trunc((p_payload->>'durationMs')::numeric)))
        or not (p_payload ? 'contentType') then raise exception 'invalid_input'; end if;
      update public.event_media_assets set state='cleanup_pending' where event_id=eid and kind=a.kind and state='attached';
      update public.event_media_assets set state='attached',content_type=p_payload->>'contentType',
        byte_length=(p_payload->>'byteLength')::integer,duration_ms=(p_payload->>'durationMs')::integer where id=a.id;
    else
      if a.state<>'attached' then raise exception 'invalid_transition'; end if;
      update public.event_media_assets set state='cleanup_pending' where id=a.id;
    end if;
    result := jsonb_build_object('assetId',a.id,'cleanupPending',exists(select 1 from public.event_media_assets where event_id=eid and state='cleanup_pending'));
  end if;
  update public.events set revision=revision+1 where id=eid returning * into e;
  insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind)
    values(eid,2,actor,key_kind);
  return private.package_commit_receipt(eid,actor,p_operation_id,key_kind,p_payload,e.revision,result);
end $$;

-- ADR-0030: fence privileged Storage completion; this does not prove backend byte removal.
create or replace function private.guard_event_media_commit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.bucket_id='event_media' and
    (new.bucket_id is distinct from old.bucket_id or new.name is distinct from old.name
      or new.version is distinct from old.version) then raise exception using errcode='42501',message='event_media_immutable'; end if;
  if new.bucket_id<>'event_media' then return new; end if;
  -- Storage v1.79.36 rolls back permission-test INSERT version '1'; reverify on upgrades.
  -- Actual standard, TUS and S3 publication uses generated UUID versions; RLS still applies.
  if tg_op='INSERT' and new.version='1' then return new; end if;
  raise exception using errcode='42501',message='event_media_upload_closed';
end $$;
