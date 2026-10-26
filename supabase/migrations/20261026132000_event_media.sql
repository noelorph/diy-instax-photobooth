create table public.event_media_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  kind text not null check (kind in ('background','montage')),
  path text not null unique,
  uploaded_by uuid not null,
  state text not null default 'uploading' check (state in ('uploading','attached','cleanup_pending','removed')),
  upload_expires_at timestamptz not null default (now()+interval '24 hours'),
  content_type text,
  byte_length integer,
  duration_ms integer,
  created_at timestamptz not null default now(),
  check (path=event_id::text||'/'||id::text),
  check (state<>'attached' or (content_type is not null and byte_length>0 and
    ((kind='background' and content_type in ('image/jpeg','image/png','image/webp') and byte_length<=10000000 and duration_ms is null)
    or (kind='montage' and content_type='video/mp4' and byte_length<=50000000 and duration_ms>0 and duration_ms<=30000))))
);
create unique index event_media_one_attached on public.event_media_assets(event_id,kind) where state='attached';
alter table public.event_media_assets enable row level security;
revoke all on public.event_media_assets from public,anon,authenticated,service_role;
grant select on public.event_media_assets to authenticated,service_role;
create policy event_media_admin_read on public.event_media_assets for select to authenticated using ((select private.is_active_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('event_media','event_media',false,50000000,array['image/jpeg','image/png','image/webp','video/mp4']);

create function private.event_media_upload_allowed(object_name text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare a public.event_media_assets%rowtype; e public.events%rowtype;
begin
  select * into a from public.event_media_assets where path=object_name;
  if a.id is null then return false; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=a.event_id for update;
  select * into a from public.event_media_assets where id=a.id;
  return private.is_active_admin() and a.uploaded_by=auth.uid() and a.state='uploading'
    and a.upload_expires_at>clock_timestamp() and e.state='Draft' and e.deleted_at is null and e.accounting_version=2;
end $$;
revoke all on function private.event_media_upload_allowed(text) from public,anon,authenticated,service_role;
grant execute on function private.event_media_upload_allowed(text) to authenticated;
create policy event_media_upload on storage.objects for insert to authenticated
  with check (bucket_id='event_media' and private.event_media_upload_allowed(name));

create function private.event_media_operation(
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
  replay := private.package_receipt(actor,p_operation_id,key_kind,p_payload,e.revision);
  if replay is not null then return replay; end if;
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
revoke all on function private.event_media_operation(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.event_media_operation(uuid,uuid,text,uuid,jsonb) to service_role;
create function public.event_media_operation(
  p_admin_user_id uuid,p_admin_session_id uuid,p_operation text,p_operation_id uuid,p_payload jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.event_media_operation(p_admin_user_id,p_admin_session_id,p_operation,p_operation_id,p_payload)
$$;
revoke all on function public.event_media_operation(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.event_media_operation(uuid,uuid,text,uuid,jsonb) to service_role;

-- Only the trusted server may retire failed uploads or acknowledge actual object removal.
create function public.event_media_cleanup(p_asset_id uuid,p_removed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare a public.event_media_assets%rowtype;
begin
  select * into a from public.event_media_assets where id=p_asset_id;
  if a.id is null then return; end if;
  perform 1 from private.booth_contract_guard where id for update;
  perform 1 from public.events where id=a.event_id for update;
  select * into a from public.event_media_assets where id=p_asset_id for update;
  if a.state='attached' then raise exception 'invalid_transition'; end if;
  if p_removed then
    if exists(select 1 from storage.objects where bucket_id='event_media' and name=a.path) then raise exception 'not_ready'; end if;
    update public.event_media_assets set state='removed' where id=a.id;
  else update public.event_media_assets set state='cleanup_pending' where id=a.id and state='uploading'; end if;
end $$;
revoke all on function public.event_media_cleanup(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.event_media_cleanup(uuid,boolean) to service_role;
