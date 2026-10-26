-- ADR-0030: fence privileged Storage completion; this does not prove backend byte removal.
create or replace function private.guard_event_media_commit() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.event_media_assets%rowtype; e public.events%rowtype;
begin
  if tg_op='UPDATE' and old.bucket_id='event_media' and
    (new.bucket_id is distinct from old.bucket_id or new.name is distinct from old.name
      or new.version is distinct from old.version) then raise exception using errcode='42501',message='event_media_immutable'; end if;
  if new.bucket_id<>'event_media' then return new; end if;
  -- Storage v1.79.36 rolls back permission-test INSERT version '1'; reverify on upgrades.
  -- Actual standard, TUS and S3 publication uses generated UUID versions; RLS still applies.
  if tg_op='INSERT' and new.version='1' then return new; end if;
  select * into a from public.event_media_assets where path=new.name;
  if a.id is null then raise exception using errcode='42501',message='event_media_upload_closed'; end if;
  perform 1 from private.booth_contract_guard where id for update;
  select * into e from public.events where id=a.event_id for update;
  select * into a from public.event_media_assets where id=a.id;
  if e.accounting_version is distinct from 2 or e.state is distinct from 'Draft'
    or e.deleted_at is not null or a.state is distinct from 'uploading'
    or a.upload_expires_at<=clock_timestamp() then raise exception using errcode='42501',message='event_media_upload_closed'; end if;
  return new;
end $$;
