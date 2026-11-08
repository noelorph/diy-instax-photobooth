// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  cleanupEvents,
  localOwnerSql,
  localSupabase,
  ownerInsert,
  ownerUpdate,
} from '../fixtures/local-supabase';
import { createPackageFixture } from '../fixtures/package-contract';

describe('versioned package schema and access', () => {
  it('preserves legacy accounting and adds versioned package records', () => {
    const columns = localOwnerSql(
      "select table_name,column_name from information_schema.columns where table_schema='public'"
    );
    for (const table of [
      'events',
      'booth_runs',
      'booth_grants',
      'booth_handoffs',
      'guest_sessions',
      'captures',
      'print_attempts',
      'print_attempt_events',
      'operation_receipts',
      'activity_events',
    ]) {
      expect(columns).toContainEqual({ table_name: table, column_name: 'accounting_version' });
    }
    expect(columns).toContainEqual({
      table_name: 'events',
      column_name: 'booking_review_required',
    });
    expect(
      localOwnerSql('select active_creation_version from private.booth_contract_guard')
    ).toEqual([{ active_creation_version: 1 }]);
    expect(
      localOwnerSql(
        "select count(*)::integer as count from pg_trigger where tgname='package_version_before_update' and not tgisinternal"
      )
    ).toEqual([{ count: 12 }]);
  }, 30000);
});

it('restricts operational writes for all application roles and protects function defaults', () => {
  const rights = localOwnerSql(
    "select c.relname, r.role, has_table_privilege(r.role,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as writable from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ('anon'),('authenticated'),('service_role')) r(role) where n.nspname='public' and c.relname in ('booth_runs','booth_grants','booth_handoffs','guest_sessions','captures','print_attempts','print_attempt_events','additional_print_entries','film_stock_entries','film_stock_balance','activity_events','operation_receipts','additional_film_package_entries','booth_reload_requests')"
  );
  expect(rights.length).toBe(42);
  expect(rights.filter((row) => row.writable)).toEqual([]);
  expect(
    localOwnerSql(
      "select has_table_privilege('service_role','public.events','INSERT,UPDATE,DELETE') as writable"
    )
  ).toEqual([{ writable: false }]);
});

it('provides v2 states, parent guards, readiness and immutable package records', () => {
  const columns = localOwnerSql(
    "select table_name,column_name from information_schema.columns where table_schema in ('public','private')"
  );
  for (const [table, column] of [
    ['booth_runs', 'connection_generation'],
    ['booth_runs', 'evidence_policy_version'],
    ['booth_grants', 'device_hash'],
    ['captures', 'shutter_operation_id'],
    ['print_attempts', 'dispatch_id'],
    ['additional_film_package_entries', 'operation_key'],
    ['booth_reload_requests', 'connection_generation'],
    ['package_readiness_windows', 'expires_at'],
  ]) {
    expect(columns).toContainEqual({ table_name: table, column_name: column });
  }
});

it('enforces matching v2 parents and preserves legacy terminal Test references during conversion', async () => {
  const fixture = await createPackageFixture();
  const legacyId = randomUUID();
  try {
    ownerInsert('events', {
      id: legacyId,
      title: 'Legacy',
      client_name: 'Client',
      client_email: 'legacy@example.test',
      client_phone: '123',
      venue_address: 'Hall',
      time_zone: 'Asia/Manila',
      starts_at: '2026-12-01T10:00:00Z',
      ends_at: '2026-12-01T11:00:00Z',
      film_package_count: 1,
      original_print_allowance: 7,
    });
    expect(
      localOwnerSql(
        `select accounting_version,original_print_allowance from public.events where id='${legacyId}'`
      )
    ).toEqual([{ accounting_version: 1, original_print_allowance: 7 }]);
    const legacyAttempt = ownerInsert('print_attempts', {
      event_id: legacyId,
      kind: 'Test',
      state: 'Confirmed',
      request_key: randomUUID(),
      connection_id: randomUUID(),
    });
    expect(() =>
      ownerInsert('booth_runs', { event_id: legacyId, accounting_version: 2, state: 'Prepared' })
    ).toThrow(/23514/);
    const legacyRunId = randomUUID();
    ownerInsert('booth_runs', { id: legacyRunId, event_id: legacyId, state: 'Ended' });
    const legacySessionId = randomUUID();
    ownerInsert('guest_sessions', {
      id: legacySessionId,
      event_id: legacyId,
      run_id: legacyRunId,
      state: 'Abandoned',
    });
    const legacyCapture = ownerInsert('captures', {
      event_id: legacyId,
      run_id: legacyRunId,
      session_id: legacySessionId,
      captured_at: new Date().toISOString(),
    });
    expect(
      localOwnerSql(
        `select shutter_operation_id from public.captures where id='${legacyCapture.data.id}'`
      )
    ).toEqual([{ shutter_operation_id: null }]);
    ownerInsert('operation_receipts', {
      event_id: legacyId,
      actor_scope: 'legacy',
      operation_kind: 'fixture',
      operation_key: randomUUID(),
      input_digest: '0'.repeat(64),
      result: {},
    });

    ownerUpdate('events', legacyId, {
      accounting_version: 2,
      original_print_allowance: null,
      revision: 2,
    });
    expect(
      localOwnerSql(
        `select accounting_version,kind,state from public.print_attempts where event_id='${legacyId}'`
      )
    ).toEqual([{ accounting_version: 1, kind: 'Test', state: 'Confirmed' }]);
    expect(() =>
      ownerInsert('guest_sessions', {
        event_id: legacyId,
        run_id: legacyRunId,
        accounting_version: 2,
      })
    ).toThrow(/23514/);
    expect(() =>
      ownerInsert('print_attempt_events', {
        attempt_id: legacyAttempt.data.id,
        accounting_version: 2,
        actor_scope: 'admin',
        state: 'Printed',
      })
    ).toThrow(/23514/);
    ownerInsert('booth_runs', {
      id: fixture.runId,
      event_id: fixture.eventId,
      accounting_version: 2,
      state: 'Paused',
      device_hash: fixture.deviceHash,
    });
    ownerInsert('guest_sessions', {
      event_id: fixture.eventId,
      run_id: fixture.runId,
      accounting_version: 2,
    });
    expect(() => ownerUpdate('booth_runs', fixture.runId, { accounting_version: 1 })).toThrow(
      /23514/
    );
    expect(() =>
      ownerUpdate('events', fixture.eventId, {
        accounting_version: 1,
        original_print_allowance: 10,
        revision: 2,
      })
    ).toThrow(/23514/);
    for (const state of ['Prepared', 'Active', 'Paused', 'Finishing']) {
      expect(() =>
        ownerInsert('booth_runs', { event_id: fixture.eventId, accounting_version: 2, state })
      ).toThrow(/23505/);
    }
    expect(() =>
      ownerInsert('print_attempts', {
        event_id: fixture.eventId,
        accounting_version: 2,
        kind: 'Test',
        request_key: randomUUID(),
        connection_id: randomUUID(),
      })
    ).toThrow(/23514/);
  } finally {
    cleanupEvents([legacyId]);
    await fixture.dispose();
  }
}, 30000);

it('keeps every unresolved v2 state globally exclusive, including against legacy attempts', async () => {
  const f = await createPackageFixture();
  try {
    ownerInsert('booth_runs', {
      id: f.runId,
      event_id: f.eventId,
      accounting_version: 2,
      state: 'Active',
      device_hash: f.deviceHash,
    });
    const sessionId = randomUUID(),
      captureId = randomUUID(),
      attemptId = randomUUID();
    ownerInsert('guest_sessions', {
      id: sessionId,
      event_id: f.eventId,
      run_id: f.runId,
      accounting_version: 2,
    });
    expect(() =>
      ownerInsert('guest_sessions', { event_id: f.eventId, run_id: f.runId, accounting_version: 2 })
    ).toThrow(/23505/);
    expect(() =>
      ownerInsert('captures', {
        event_id: f.eventId,
        run_id: f.runId,
        session_id: sessionId,
        accounting_version: 2,
        captured_at: new Date().toISOString(),
      })
    ).toThrow(/23514/);
    ownerInsert('captures', {
      id: captureId,
      event_id: f.eventId,
      run_id: f.runId,
      session_id: sessionId,
      accounting_version: 2,
      captured_at: new Date().toISOString(),
      shutter_operation_id: randomUUID(),
    });
    const attempt = {
      event_id: f.eventId,
      run_id: f.runId,
      session_id: sessionId,
      capture_id: captureId,
      accounting_version: 2,
      kind: 'Guest',
      connection_id: randomUUID(),
    };
    ownerInsert('print_attempts', { ...attempt, id: attemptId, request_key: randomUUID() });
    for (const state of ['Reserved', 'Dispatching', 'Accepted', 'Pending']) {
      ownerUpdate('print_attempts', attemptId, { state });
      expect(() =>
        ownerInsert('print_attempts', { ...attempt, request_key: randomUUID() })
      ).toThrow(/23505/);
      expect(() =>
        ownerInsert('print_attempts', {
          event_id: f.eventId,
          kind: 'Test',
          state: 'Uncertain',
          request_key: randomUUID(),
          connection_id: randomUUID(),
        })
      ).toThrow(/23505/);
    }
    ownerUpdate('print_attempts', attemptId, { state: 'Printed' });
    ownerInsert('print_attempts', { ...attempt, request_key: randomUUID(), state: 'NotPrinted' });
    expect(() => ownerUpdate('print_attempts', attemptId, { state: 'Confirmed' })).toThrow(/23514/);
  } finally {
    await f.dispose();
  }
}, 30000);

it('rechecks live Admin authority and v2 grant binding and capability', async () => {
  const f = await createPackageFixture();
  try {
    expect(() =>
      localOwnerSql(
        `select private.package_require_admin('${f.adminUser.id}','${f.adminSessionId}')`
      )
    ).not.toThrow();
    expect(() =>
      localOwnerSql(`select private.package_require_admin('${f.adminUser.id}','${randomUUID()}')`)
    ).toThrow(/access_required/);
    ownerUpdate('events', f.eventId, { state: 'Live', revision: 2 });
    ownerInsert('booth_runs', {
      id: f.runId,
      event_id: f.eventId,
      accounting_version: 2,
      state: 'Paused',
      device_hash: f.deviceHash,
    });
    ownerInsert('booth_grants', {
      id: f.grantId,
      event_id: f.eventId,
      run_id: f.runId,
      accounting_version: 2,
      state: 'Active',
      device_hash: f.deviceHash,
      secret_hash: f.grantHash,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(() =>
      localOwnerSql(`select private.package_require_booth('${f.grantHash}','observe')`)
    ).not.toThrow();
    expect(() =>
      localOwnerSql(`select private.package_require_booth('${f.grantHash}','pause')`)
    ).toThrow(/operation_forbidden/);
    localOwnerSql(
      `update public.booth_grants set capabilities=array[null::text] where id='${f.grantId}'`
    );
    expect(() =>
      localOwnerSql(`select private.package_require_booth('${f.grantHash}','pause')`)
    ).toThrow(/operation_forbidden/);
    localOwnerSql(
      `update public.booth_grants set capabilities=array['read','observe'] where id='${f.grantId}'`
    );

    ownerUpdate('booth_runs', f.runId, { device_hash: '0'.repeat(64) });
    expect(() =>
      localOwnerSql(`select private.package_require_booth('${f.grantHash}','read')`)
    ).toThrow(/access_required/);
    ownerUpdate('booth_runs', f.runId, { device_hash: f.deviceHash });
    ownerUpdate('booth_grants', f.grantId, {
      last_seen_at: new Date(Date.now() - 25 * 3600000).toISOString(),
    });
    expect(() =>
      localOwnerSql(`select private.package_require_booth('${f.grantHash}','read')`)
    ).toThrow(/access_required/);
    await f.adminClient.auth.signOut({ scope: 'global' });
    expect(() =>
      localOwnerSql(
        `select private.package_require_admin('${f.adminUser.id}','${f.adminSessionId}')`
      )
    ).toThrow(/access_required/);
  } finally {
    await f.dispose();
  }
}, 30000);

it('rejects direct version/count/receipt changes and private calls while retaining validated Draft edits', async () => {
  const f = await createPackageFixture();
  try {
    expect(
      (
        await f.adminClient
          .from('events')
          .update({ title: 'Edited', revision: 2 })
          .eq('id', f.eventId)
      ).error
    ).toBeNull();
    for (const client of [f.local.client(), f.adminClient, f.local.service]) {
      for (const changes of [
        { state: 'Live' },
        { accounting_version: 1 },
        { booking_review_required: true },
        { original_print_allowance: 10 },
        { original_print_allowance: null },
      ]) {
        expect(
          (
            await client
              .from('events')
              .update({ ...changes, revision: 3 })
              .eq('id', f.eventId)
          ).error
        ).not.toBeNull();
      }
      for (const table of [
        'additional_film_package_entries',
        'booth_reload_requests',
        'operation_receipts',
        'print_attempts',
        'booth_grants',
      ]) {
        expect((await client.from(table).insert({ event_id: f.eventId })).error?.code).toBe(
          '42501'
        );
      }
    }
    expect(
      localOwnerSql(
        "select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '%package%' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or (p.proname not in ('package_admin_operation','package_admin_read','package_setup_read','package_booth_read','package_booth_operation','package_issue_handoff','package_fail_handoff') and has_function_privilege('service_role',p.oid,'EXECUTE')))"
      )
    ).toEqual([]);
    expect(
      localOwnerSql(
        "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '%package%' and not coalesce(proconfig @> array['search_path=\"\"'],false)"
      )
    ).toEqual([]);
    localOwnerSql(`do $test$ begin
      execute 'create function public.package_default_probe() returns void language sql as ''select''';
      if has_function_privilege('anon','public.package_default_probe()','EXECUTE') or has_function_privilege('authenticated','public.package_default_probe()','EXECUTE') or has_function_privilege('service_role','public.package_default_probe()','EXECUTE') then raise exception 'Unsafe default function grants'; end if;
      execute 'drop function public.package_default_probe()';
    end $test$`);
  } finally {
    await f.dispose();
  }
}, 30000);

it('guards the single Live Event, bounded capacity and immutable actor-scoped receipts', async () => {
  const f = await createPackageFixture(),
    otherId = randomUUID();
  try {
    expect(() =>
      ownerUpdate('events', f.eventId, { film_package_count: 214748365, revision: 2 })
    ).toThrow(/23514/);
    ownerUpdate('events', f.eventId, { state: 'Live', revision: 2 });
    expect(() =>
      localOwnerSql(
        `insert into public.events (id,accounting_version,state,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count) select '${otherId}',2,'Live',title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count from public.events where id='${f.eventId}'`
      )
    ).toThrow(/23505/);
    const key = randomUUID(),
      actor = `admin:${f.adminUser.id}`;
    const receipt = {
      event_id: f.eventId,
      accounting_version: 2,
      actor_scope: actor,
      operation_key: key,
      input_digest: '0'.repeat(64),
      operation_kind: 'add_packages',
      result: { packages: 1 },
      committed_revision: 2,
    };
    expect(() =>
      ownerInsert('operation_receipts', { ...receipt, committed_revision: null })
    ).toThrow(/23514/);
    const stored = ownerInsert('operation_receipts', receipt);
    expect(() =>
      ownerInsert('operation_receipts', { ...receipt, operation_kind: 'pause' })
    ).toThrow(/23505/);
    expect(
      (
        await f.local.service
          .from('operation_receipts')
          .update({ result: { packages: 9 } })
          .eq('id', stored.data.id)
      ).error?.code
    ).toBe('42501');
    const entry = ownerInsert('additional_film_package_entries', {
      event_id: f.eventId,
      packages: 1,
      client_request_note: 'Client requested one package',
      actor_id: f.adminUser.id,
      operation_key: randomUUID(),
    });
    expect(
      (
        await f.local.service
          .from('additional_film_package_entries')
          .delete()
          .eq('id', entry.data.id)
      ).error?.code
    ).toBe('42501');
    expect(() =>
      ownerInsert('additional_film_package_entries', {
        event_id: f.eventId,
        packages: 0,
        client_request_note: 'Request',
        actor_id: f.adminUser.id,
        operation_key: randomUUID(),
      })
    ).toThrow(/23514/);
    localOwnerSql(`do $test$ begin
      create table public.package_default_table_probe(id integer);
      if has_table_privilege('anon','public.package_default_table_probe','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_table_privilege('authenticated','public.package_default_table_probe','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_table_privilege('service_role','public.package_default_table_probe','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Unsafe default table grants'; end if;
      drop table public.package_default_table_probe;
    end $test$`);
  } finally {
    cleanupEvents([otherId]);
    await f.dispose();
  }
}, 30000);

it('cleans its provisioned Admin when package fixture setup fails', async () => {
  const fixtureUsers = () =>
    localOwnerSql(
      "select id from auth.users where email like 'admin-boundary-%@example.test' order by id"
    ).map((row) => String(row.id));
  const before = fixtureUsers();
  try {
    await expect(createPackageFixture({ originalPackages: -1 })).rejects.toThrow(/23514/);
    expect(fixtureUsers()).toEqual(before);
  } finally {
    const local = localSupabase();
    for (const id of fixtureUsers().filter((id) => !before.includes(id))) {
      const removed = await local.service.auth.admin.deleteUser(id);
      if (removed.error) throw removed.error;
    }
  }
}, 30000);

it('cleans its Admin even when package Event disposal fails', async () => {
  const f = await createPackageFixture();
  localOwnerSql(
    `create function private.package_fixture_cleanup_failure() returns trigger language plpgsql set search_path='' as $probe$ begin raise exception 'fixture_cleanup_failure'; end $probe$`
  );
  localOwnerSql(
    `create trigger package_fixture_cleanup_failure before delete on public.events for each row when (old.id='${f.eventId}'::uuid) execute function private.package_fixture_cleanup_failure()`
  );
  try {
    await expect(f.dispose()).rejects.toThrow(/fixture_cleanup_failure/);
    expect((await f.local.service.auth.admin.getUserById(f.adminUser.id)).data.user).toBeNull();
  } finally {
    localOwnerSql(
      'drop trigger package_fixture_cleanup_failure on public.events; drop function private.package_fixture_cleanup_failure()'
    );
    cleanupEvents([f.eventId]);
    await f.local.cleanup();
  }
}, 30000);

it.each(['handoff', 'activity'] as const)(
  'requires matching v2 %s references on insert and update while retaining v1 history',
  async (kind) => {
    const f = await createPackageFixture();
    const other = await createPackageFixture();
    try {
      const otherRun = randomUUID();
      for (const [eventId, runId] of [
        [f.eventId, f.runId],
        [f.eventId, otherRun],
        [other.eventId, other.runId],
      ]) {
        ownerInsert('booth_runs', {
          id: runId,
          event_id: eventId,
          accounting_version: 2,
          state: 'Finished',
        });
      }
      const references: string[] = [];
      for (const [eventId, runId, version] of [
        [f.eventId, f.runId, 2],
        [f.eventId, f.runId, 1],
        [f.eventId, otherRun, 2],
        [other.eventId, other.runId, 2],
      ] as const) {
        if (kind === 'handoff') {
          references.push(
            ownerInsert('booth_grants', {
              event_id: eventId,
              run_id: runId,
              accounting_version: version,
              expires_at: '2027-01-01T00:00:00Z',
              device_hash: f.deviceHash,
            }).data.id
          );
        } else {
          const session = ownerInsert('guest_sessions', {
            event_id: eventId,
            run_id: runId,
            accounting_version: version,
            state: 'Abandoned',
          }).data.id;
          const capture = ownerInsert('captures', {
            event_id: eventId,
            run_id: runId,
            session_id: session,
            accounting_version: version,
            captured_at: new Date().toISOString(),
            shutter_operation_id: randomUUID(),
          }).data.id;
          references.push(
            ownerInsert('print_attempts', {
              event_id: eventId,
              run_id: runId,
              session_id: session,
              capture_id: capture,
              accounting_version: version,
              kind: 'Guest',
              state: version === 2 ? 'Printed' : 'Confirmed',
              request_key: randomUUID(),
              connection_id: randomUUID(),
            }).data.id
          );
        }
      }
      const table = kind === 'handoff' ? 'booth_handoffs' : 'activity_events';
      const key = kind === 'handoff' ? 'grant_id' : 'attempt_id';
      const row =
        kind === 'handoff'
          ? {
              event_id: f.eventId,
              run_id: f.runId,
              admin_user_id: f.adminUser.id,
              admin_session_id: f.adminSessionId,
              device_token_hash: f.deviceHash,
              expires_at: '2027-01-01T00:00:00Z',
            }
          : { event_id: f.eventId, actor_scope: 'fixture', operation_kind: 'reference-validation' };
      const valid = ownerInsert(table, { ...row, accounting_version: 2, [key]: references[0] }).data
        .id;
      // Activity is Event-scoped, so another run within the same Event is valid.
      const invalid = kind === 'handoff' ? references.slice(1) : [references[1], references[3]];
      for (const reference of invalid) {
        const id = randomUUID();
        expect
          .soft(() => ownerInsert(table, { ...row, id, accounting_version: 2, [key]: reference }))
          .toThrow(/23514/);
        localOwnerSql(`delete from public.${table} where id='${id}'`);
        expect.soft(() => ownerUpdate(table, valid, { [key]: reference })).toThrow(/23514/);
        ownerUpdate(table, valid, { [key]: references[0] });
      }
      if (kind === 'activity') {
        ownerUpdate(table, valid, { attempt_id: references[2] });
        ownerUpdate(table, valid, { attempt_id: null });
      }
      localOwnerSql(`delete from public.${table} where id='${valid}'`);
      // Historical version-1 references retain their existing permissive semantics.
      const historical = ownerInsert(table, { ...row, accounting_version: 1, [key]: references[1] })
        .data.id;
      ownerUpdate(table, historical, { [key]: references[3] });
    } finally {
      await f.dispose();
      await other.dispose();
    }
  },
  30000
);
