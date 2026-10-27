// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { localOwnerSql, localSupabaseStatus } from '../fixtures/local-supabase';

vi.mock('server-only', () => ({}));

function transaction(sql: string) {
  localSupabaseStatus();
  const output = execFileSync(
    'docker',
    [
      'exec',
      'supabase_db_diy-instax-package-contracts',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `begin; ${sql}; rollback;`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function event(id: string, state: string, packages: number, allowance: number) {
  return `insert into public.events(id,state,title,client_name,client_email,client_phone,venue_address,
    time_zone,starts_at,ends_at,film_package_count,original_print_allowance)
    values('${id}','${state}','Legacy','Client','legacy@example.test','123','Hall',
      'Asia/Manila','2026-12-01T10:00:00Z','2026-12-01T12:00:00Z',${packages},${allowance})`;
}

it('exposes an owner-only read-only cutover preflight', () => {
  const before = localOwnerSql(
    'select active_creation_version, activated_at from private.booth_contract_guard where id'
  )[0];
  const report = localOwnerSql('select private.package_cutover_preflight() as report')[0].report;
  const after = localOwnerSql(
    'select active_creation_version, activated_at from private.booth_contract_guard where id'
  )[0];
  expect(report).toMatchObject({
    ready: expect.any(Boolean),
    blockingLegacyWork: expect.any(Object),
  });
  expect(after).toEqual(before);
}, 30000);

it('blocks activation with unresolved legacy attempts and leaves the local guard unchanged', () => {
  const eventId = randomUUID(),
    attemptId = randomUUID();
  const [preflight, blocked] = transaction(`${event(eventId, 'Completed', 1, 10)};
    drop index public.print_attempts_one_printer_idx;
    insert into public.print_attempts(id,event_id,kind,state,request_key,connection_id)
      values('${attemptId}','${eventId}','Test','Uncertain','${randomUUID()}','${randomUUID()}');
    select private.package_cutover_preflight()::text;
    do $$ begin perform private.activate_package_accounting();
      raise exception 'Expected cutover to be blocked';
      exception when others then
        if sqlerrm not like 'package_cutover_blocked:%' then raise; end if;
    end $$;
    select jsonb_build_object('version',(select active_creation_version from private.booth_contract_guard where id),
      'snapshots',(select count(*) from private.legacy_accounting_snapshots))::text`);
  expect(preflight).toMatchObject({ ready: false, blockingLegacyWork: { unresolvedAttempts: 1 } });
  expect(blocked).toMatchObject({ version: 1, snapshots: 0 });
  expect(
    localOwnerSql('select active_creation_version from private.booth_contract_guard where id')[0]
      .active_creation_version
  ).toBe(1);
});

it('reports unfinished runs, finished-but-Live Events, and invalid Draft package values', () => {
  const liveId = randomUUID(),
    draftId = randomUUID(),
    runId = randomUUID();
  const [report] = transaction(`drop index public.events_one_live_idx;
    ${event(liveId, 'Live', 1, 10)};
    ${event(draftId, 'Draft', 214748365, 10)};
    insert into public.booth_runs(id,event_id,state) values('${runId}','${liveId}','Ended');
    select private.package_cutover_preflight()::text`);
  expect(report).toMatchObject({
    ready: false,
    blockingLegacyWork: { liveEvents: 1 },
    drafts: { requiresCorrection: 1 },
  });
});

it('reports an unfinished old run even when its Event is no longer Live', () => {
  const eventId = randomUUID(),
    runId = randomUUID();
  const [report] = transaction(`${event(eventId, 'Completed', 1, 10)};
    insert into public.booth_runs(id,event_id,state) values('${runId}','${eventId}','Paused');
    select private.package_cutover_preflight()::text`);
  expect(report).toMatchObject({ ready: false, blockingLegacyWork: { unfinishedRuns: 1 } });
});

it('atomically preserves terminal history, converts only a never-started Draft, and retires legacy RPC grants', () => {
  const draftId = randomUUID(),
    terminalId = randomUUID(),
    testId = randomUUID();
  const [before, activated, after] = transaction(`${event(draftId, 'Draft', 2, 25)};
    ${event(terminalId, 'Completed', 1, 17)};
    insert into public.print_attempts(id,event_id,kind,state,request_key,connection_id)
      values('${testId}','${draftId}','Test','Confirmed','${randomUUID()}','${randomUUID()}');
    insert into public.activity_events(event_id,actor_scope,operation_kind)
      values('${terminalId}','admin:historical','legacy_refund');
    insert into public.film_stock_entries(event_id,kind,signed_sheets,actor_scope)
      values('${terminalId}','Addition',10,'admin:historical');
    select jsonb_build_object('history',(select count(*) from public.activity_events where event_id='${terminalId}'),
      'testVersion',(select accounting_version from public.print_attempts where id='${testId}'))::text;
    select private.activate_package_accounting()::text;
    select jsonb_build_object(
      'version',(select active_creation_version from private.booth_contract_guard where id),
      'draft',(select jsonb_build_object('version',accounting_version,'allowance',original_print_allowance,
        'review',booking_review_required,'original',booking_review_original_allowance,
        'proposed',booking_review_proposed_capacity) from public.events where id='${draftId}'),
      'terminal',(select accounting_version from public.events where id='${terminalId}'),
      'snapshot',(select accounting from private.legacy_accounting_snapshots where event_id='${terminalId}'),
      'testVersion',(select accounting_version from public.print_attempts where id='${testId}'),
      'legacyRpcExecutable',has_function_privilege('service_role',
        'public.add_film_stock(uuid,uuid,uuid,integer,text)','EXECUTE'),
      'executableLegacyFunctions',(select count(*) from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
          and p.proname=any(array['add_film_stock','reconcile_film_stock','add_event_prints',
            'begin_event_redaction','complete_event_redaction','change_event_run',
            'confirm_booth_handoff','finish_booth_handoff','prepare_booth_handoff',
            'abandon_guest_session','open_guest_session','record_capture','reserve_guest_attempt',
            'reserve_test_attempt','confirm_test_output','mark_wasted_film','report_booth_observation',
            'report_test_observation','resolve_uncertain_print','recover_interrupted_print',
            'pause_booth_for_reconnect','request_booth_pause'])
          and has_function_privilege('service_role',p.oid,'EXECUTE')))::text`);
  expect(before).toEqual({ history: 1, testVersion: 1 });
  expect(activated).toMatchObject({ ready: true, activated: true });
  expect(after).toMatchObject({
    version: 2,
    draft: { version: 2, allowance: null, review: true, original: 25, proposed: 20 },
    terminal: 1,
    snapshot: { originalPrintAllowance: 17, stockRows: 1, auditRows: 1 },
    testVersion: 1,
    legacyRpcExecutable: false,
    executableLegacyFunctions: 0,
  });
  expect(
    localOwnerSql('select active_creation_version from private.booth_contract_guard where id')[0]
      .active_creation_version
  ).toBe(1);
});

it('creates v2 Drafts without an allowance and guards converted booking edits and legacy rows', () => {
  const draftId = randomUUID(),
    terminalId = randomUUID(),
    freshId = randomUUID();
  const [result] = transaction(`${event(draftId, 'Draft', 1, 10)};
    ${event(terminalId, 'Cancelled', 1, 10)};
    do $$ begin perform private.activate_package_accounting(); end $$;
    insert into public.events(id,title,client_name,client_email,client_phone,venue_address,
      time_zone,starts_at,ends_at,film_package_count)
      values('${freshId}','Fresh','Client','fresh@example.test','123','Hall',
        'Asia/Manila','2026-12-01T10:00:00Z','2026-12-01T12:00:00Z',1);
    update public.events set film_package_count=2,revision=revision+1 where id='${draftId}';
    do $$ begin
      update public.events set revision=revision+1 where id='${terminalId}';
      raise exception 'Legacy terminal mutation was allowed';
      exception when insufficient_privilege then null;
    end $$;
    select jsonb_build_object(
      'fresh',(select jsonb_build_object('version',accounting_version,'allowance',original_print_allowance) from public.events where id='${freshId}'),
      'edited',(select jsonb_build_object('review',booking_review_required,'proposed',booking_review_proposed_capacity) from public.events where id='${draftId}'),
      'terminalRevision',(select revision from public.events where id='${terminalId}'),
      'allowanceInsert',has_column_privilege('authenticated','public.events','original_print_allowance','INSERT'),
      'allowanceUpdate',has_column_privilege('authenticated','public.events','original_print_allowance','UPDATE'),
      'ownerOnly',has_function_privilege('service_role','private.activate_package_accounting()','EXECUTE'))::text`);
  expect(result).toEqual({
    fresh: { version: 2, allowance: null },
    edited: { review: true, proposed: 20 },
    terminalRevision: 1,
    allowanceInsert: false,
    allowanceUpdate: false,
    ownerOnly: false,
  });
});

it('executes retired stock, Test, waste, redaction, handoff and guest RPCs under activated role', () => {
  const [result] = transaction(`do $$ begin perform private.activate_package_accounting(); end $$;
    set local role service_role;
    do $$ declare command text; message text; denied integer:=0; begin
      foreach command in array array[
        'select public.add_film_stock(null::uuid,null::uuid,null::uuid,1,''test'')',
        'select public.reserve_test_attempt(null::uuid,null::uuid,null::uuid,null::uuid,null::uuid)',
        'select public.mark_wasted_film(null::uuid,null::uuid,null::uuid,null::uuid,''test'')',
        'select public.begin_event_redaction(null::uuid,null::uuid,null::uuid,1,null::uuid,''redact_client'',null::text)',
        'select public.prepare_booth_handoff(null::uuid,null::uuid,null::uuid,1,null::uuid,null::uuid,''{}''::jsonb)',
        'select public.open_guest_session(null::text,null::uuid,null::uuid)'
      ] loop
        begin
          execute command;
          raise exception 'Retired RPC remained executable: %',command;
        exception when insufficient_privilege then
          get stacked diagnostics message=message_text;
          if message not like 'permission denied for function %' then raise; end if;
          denied:=denied+1;
        end;
      end loop;
      if denied<>6 then raise exception 'Expected six retired RPC denials, got %',denied; end if;
    end $$;
    reset role;
    select jsonb_build_object('denied',6,'version',(select active_creation_version from private.booth_contract_guard where id))::text`);
  expect(result).toEqual({ denied: 6, version: 2 });
  expect(
    localOwnerSql('select active_creation_version from private.booth_contract_guard where id')[0]
      .active_creation_version
  ).toBe(1);
}, 30000);

it('blocks pending legacy media cleanup, then preserves erased data after cleanup completes', () => {
  const redactedId = randomUUID(),
    deletedId = randomUUID();
  const [blocked, report, after] = transaction(`
    insert into public.events(id,state,title,client_name,client_email,client_phone,venue_address,
      time_zone,starts_at,ends_at,film_package_count,original_print_allowance,redacted_at,media_removal_state)
      values('${redactedId}','Completed','Historical',null,null,null,'Hall','Asia/Manila',
        '2026-12-01T10:00:00Z','2026-12-01T12:00:00Z',1,10,clock_timestamp(),'pending');
    insert into public.events(id,state,film_package_count,original_print_allowance,deleted_at,media_removal_state)
      values('${deletedId}','Draft',1,10,clock_timestamp(),'pending');
    select private.package_cutover_preflight()::text;
    do $$ begin perform private.activate_package_accounting();
      raise exception 'Expected pending media to block cutover';
      exception when others then
        if sqlerrm not like 'package_cutover_blocked:%' then raise; end if;
    end $$;
    update public.events set media_removal_state='complete',revision=revision+1
      where id in ('${redactedId}','${deletedId}');
    select private.package_cutover_preflight()::text;
    do $$ begin perform private.activate_package_accounting(); end $$;
    select jsonb_build_object('redacted',(select jsonb_build_object('version',accounting_version,'client',client_name,
      'media',media_removal_state) from public.events where id='${redactedId}'),
      'deleted',(select jsonb_build_object('version',accounting_version,'title',title,'client',client_name)
        from public.events where id='${deletedId}'))::text`);
  expect(blocked).toMatchObject({
    ready: false,
    blockingLegacyWork: { pendingMediaCleanup: 2 },
  });
  expect(report).toMatchObject({
    ready: true,
    blockingLegacyWork: { pendingMediaCleanup: 0 },
    immutableHistory: { redactedEvents: 1, deletedDrafts: 1 },
  });
  expect(after).toEqual({
    redacted: { version: 1, client: null, media: 'complete' },
    deleted: { version: 1, title: null, client: null },
  });
});
