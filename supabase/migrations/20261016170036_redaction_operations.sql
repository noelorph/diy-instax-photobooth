-- Erase contacts/booking identity atomically; external Storage removal remains
-- durable and retryable. No receipt or activity contains contact/title values.
alter table public.events add column redacted_at timestamptz;
alter table public.events add column media_removal_state text not null default 'none'
  check (media_removal_state in ('none','pending','complete'));
-- Any pre-existing opaque tombstone still needs a verified media cleanup.
update public.events set media_removal_state='pending',revision=revision+1 where deleted_at is not null;
alter table public.events drop constraint events_identity_lifecycle;
alter table public.events add constraint events_identity_lifecycle check (
  (deleted_at is null and title is not null and venue_address is not null and time_zone is not null and starts_at is not null and ends_at is not null and (
    (redacted_at is null and client_name is not null and client_email is not null and client_phone is not null and media_removal_state='none') or
    (redacted_at is not null and isfinite(redacted_at) and state in ('Completed','Cancelled') and client_name is null and client_email is null and client_phone is null and media_removal_state in ('pending','complete')))) or
  (deleted_at is not null and isfinite(deleted_at) and state='Draft' and redacted_at is null and title is null and client_name is null and client_email is null and client_phone is null and venue_address is null and time_zone is null and starts_at is null and ends_at is null and media_removal_state in ('pending','complete'))
);
create or replace function private.validate_draft_event()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and (new.state<>'Draft' or new.deleted_at is not null or new.redacted_at is not null) then
    raise check_violation using message='Direct Event writes require Draft state.';
  end if;
  if new.deleted_at is null then
    if new.title is null or new.venue_address is null or new.time_zone is null or new.starts_at is null or new.ends_at is null or
      (new.redacted_at is null and (new.client_name is null or new.client_email is null or new.client_phone is null)) then
      raise not_null_violation using message='Visible Events require all identifying fields.';
    end if;
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone and name not like 'posix/%' and name not like 'right/%') then
      raise check_violation using message='A valid venue time zone is required.';
    end if;
  end if;
  if tg_op='INSERT' then
    if new.revision is distinct from 1 then raise check_violation using message='A new Event must start at revision 1.'; end if;
  elsif new.revision::bigint is distinct from old.revision::bigint+1 then
    raise check_violation using message='An Event update must increment the current revision by one.';
  end if;
  return new;
end;
$$;

create function public.begin_event_redaction(admin_user_id uuid,admin_session_id uuid,event_id uuid,expected_revision integer,operation_key uuid,action text,replacement_title text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor text := 'admin:'||admin_user_id::text;
  v_digest text;
  v_receipt public.operation_receipts%rowtype;
  v_event public.events%rowtype;
  v_result jsonb;
  v_title text := btrim(replacement_title,E' \t\n\r');
begin
  if operation_key is null or event_id is null or expected_revision is null or expected_revision<1 or action is null or action not in ('redact_client','delete_draft') or
    (replacement_title is not null and (action<>'redact_client' or v_title='' or length(v_title)>1000)) then raise exception 'validation_error'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':begin_event_redaction:'||operation_key::text,0));
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id where p.id=admin_user_id and s.id=admin_session_id and (s.not_after is null or s.not_after>statement_timestamp())) then raise exception 'forbidden' using errcode='42501'; end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('event_id',event_id,'revision',expected_revision,'action',action,'replacement_title',v_title)::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='begin_event_redaction' and r.operation_key=begin_event_redaction.operation_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  select * into v_event from public.events e where e.id=event_id for update;
  if not found or v_event.revision<>expected_revision or
    (action='delete_draft' and v_event.state<>'Draft') or (action='redact_client' and v_event.state not in ('Completed','Cancelled')) or v_event.media_removal_state='complete' then raise exception 'state_conflict'; end if;
  if exists(select 1 from public.print_attempts a where a.event_id=begin_event_redaction.event_id and a.state in ('Reserved','Accepted','Uncertain')) then raise exception 'pending_attempt'; end if;
  if v_event.media_removal_state='none' then
    update public.events e set client_name=null,client_email=null,client_phone=null,
      title=case when action='delete_draft' then null else coalesce(v_title,e.title) end,
      venue_address=case when action='delete_draft' then null else e.venue_address end,
      time_zone=case when action='delete_draft' then null else e.time_zone end,
      starts_at=case when action='delete_draft' then null else e.starts_at end,
      ends_at=case when action='delete_draft' then null else e.ends_at end,
      deleted_at=case when action='delete_draft' then statement_timestamp() else null end,
      redacted_at=case when action='redact_client' then statement_timestamp() else null end,
      media_removal_state='pending',revision=e.revision+1
      where e.id=event_id returning * into v_event;
    insert into public.activity_events(event_id,actor_scope,operation_kind) values(event_id,v_actor,action);
  elsif replacement_title is not null then
    -- A retry with a fresh key may resume cleanup, but cannot alter the erasure.
    raise exception 'state_conflict';
  end if;
  v_result:=jsonb_build_object('event_id',event_id,'revision',v_event.revision,'media_removal_state',v_event.media_removal_state);
  insert into public.operation_receipts(event_id,actor_scope,operation_kind,operation_key,input_digest,result)
    values(event_id,v_actor,'begin_event_redaction',operation_key,v_digest,v_result);
  return v_result;
end;
$$;
revoke all on function public.begin_event_redaction(uuid,uuid,uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.begin_event_redaction(uuid,uuid,uuid,integer,uuid,text,text) to service_role;

create function public.complete_event_redaction(admin_user_id uuid,admin_session_id uuid,event_id uuid,operation_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.events%rowtype; v_actor text:='admin:'||admin_user_id::text; v_receipt public.operation_receipts%rowtype; v_result jsonb; v_digest text;
begin
  if operation_key is null or event_id is null then raise exception 'validation_error'; end if;
  if not exists(select 1 from public.admin_profiles p join auth.sessions s on s.user_id=p.id where p.id=admin_user_id and s.id=admin_session_id and (s.not_after is null or s.not_after>statement_timestamp())) then raise exception 'forbidden' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor||':complete_event_redaction:'||operation_key::text,0));
  v_digest:=encode(sha256(convert_to(event_id::text,'UTF8')),'hex');
  select * into v_receipt from public.operation_receipts r where r.actor_scope=v_actor and r.operation_kind='complete_event_redaction' and r.operation_key=complete_event_redaction.operation_key;
  if found then
    if v_receipt.input_digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    return v_receipt.result;
  end if;
  select * into v_event from public.events e where e.id=event_id for update;
  if not found or v_event.media_removal_state='none' or not exists(select 1 from public.operation_receipts r where r.event_id=complete_event_redaction.event_id and r.actor_scope=v_actor and r.operation_kind='begin_event_redaction' and r.operation_key=complete_event_redaction.operation_key) then raise exception 'state_conflict'; end if;
  -- Storage objects must be deleted via its API, never by deleting metadata SQL.
  -- A server bug cannot claim completion with objects still present.
  if exists(select 1 from storage.objects o where o.bucket_id='event_media' and starts_with(o.name,event_id::text||'/')) then raise exception 'state_conflict'; end if;
  if v_event.media_removal_state='pending' then
    update public.events e set media_removal_state='complete',revision=e.revision+1 where e.id=event_id returning * into v_event;
    insert into public.activity_events(event_id,actor_scope,operation_kind) values(event_id,v_actor,'event_media_removed');
  end if;
  v_result:=jsonb_build_object('event_id',event_id,'revision',v_event.revision,'media_removal_state',v_event.media_removal_state);
  insert into public.operation_receipts(event_id,actor_scope,operation_kind,operation_key,input_digest,result)
    values(event_id,v_actor,'complete_event_redaction',operation_key,v_digest,v_result);
  return v_result;
end;
$$;
revoke all on function public.complete_event_redaction(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_event_redaction(uuid,uuid,uuid,uuid) to service_role;
