create or replace function private.package_admin_read(p_admin_user_id uuid,p_admin_session_id uuid,p_event_id uuid,p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; r public.booth_runs%rowtype; receipt jsonb; readiness jsonb; reloads jsonb;
begin
  perform private.package_require_admin(p_admin_user_id,p_admin_session_id);
  select * into e from public.events where id=p_event_id and accounting_version=2 and deleted_at is null for share;
  if not found then raise exception 'operation_unavailable'; end if;
  select * into r from public.booth_runs where event_id=e.id and accounting_version=2 and state<>'Finished';
  readiness:=private.package_readiness(e.id,case when r.id is null then 'setup' when r.state='Paused' then 'resume' else 'guest' end);
  select jsonb_build_object('operationId',operation_key,'kind',operation_kind,'committedRevision',committed_revision,'result',result) into receipt from public.operation_receipts
    where accounting_version=2 and event_id=p_event_id and actor_scope='admin:'||p_admin_user_id and operation_key=p_operation_id;
  select coalesce(jsonb_agg(jsonb_build_object('reloadRequestId',id,'runId',run_id,'printerId',printer_id,'connectionGeneration',connection_generation,'state',state,'trigger',trigger,'requestedBy',requested_by,'reason',reason,'confirmedAt',confirmed_at,'confirmedBy',confirmed_by,'confirmationSource',confirmation_source) order by created_at,id),'[]') into reloads from public.booth_reload_requests where event_id=e.id and run_id=r.id;
  return jsonb_build_object('counts',private.package_counts(e.id),'revision',e.revision,'receipt',receipt,'readiness',readiness,'blockers',readiness->'blockers','reloadRequests',reloads,'allowedActions',jsonb_build_object('resume',r.state='Paused' and (readiness->>'ready')::boolean,'requestReload',r.id is not null,'confirmReload',exists(select 1 from public.booth_reload_requests where run_id=r.id and state='Open')));
end $$;
create index package_readiness_windows_grant_idx on private.package_readiness_windows(grant_id);
