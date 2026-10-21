import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPackageFixture, type PackageFixture } from '../fixtures/package-contract';
import { localOwnerSql, ownerInsert, ownerUpdate } from '../fixtures/local-supabase';

let priorPolicy: unknown;
beforeAll(() => {
  priorPolicy = localOwnerSql('select mode from public.printer_completion_policy where id')[0].mode;
  localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
});
afterAll(() => {
  localOwnerSql(`update public.printer_completion_policy set mode='${priorPolicy}' where id`);
});

const observation = {
  cameraPermission: true,
  cameraLive: true,
  serverReachable: true,
  printerConnected: true,
  printerReady: true,
  oldJobCleared: true,
};
function readiness(f: PackageFixture, stage: string, attemptId?: string) {
  return localOwnerSql(
    `select private.package_readiness('${f.eventId}','${stage}',${attemptId ? `'${attemptId}'` : 'null'}) result`
  )[0].result as { ready: boolean; blockers: string[] };
}
async function report(f: PackageFixture, changes = {}, generation = 0) {
  const read = await f.readBooth();
  expect(read.error).toBeNull();
  return f.booth('report_readiness', {
    readinessWindowId: read.data.readinessWindowId,
    observedAgeMs: 0,
    printerId: 'fixture-printer',
    connectionGeneration: generation,
    observation: { ...observation, ...changes },
  });
}
async function reconnect(f: PackageFixture, generation: number) {
  const read = await f.readBooth();
  return f.booth('report_readiness', {
    kind: 'connection_changed',
    readinessWindowId: read.data.readinessWindowId,
    printerId: 'fixture-printer',
    connectionGeneration: generation,
    expectedRevision: revision(f),
  });
}
function revision(f: PackageFixture) {
  return localOwnerSql(`select revision from public.events where id='${f.eventId}'`)[0]
    .revision as number;
}
function seedAttempt(f: PackageFixture, state = 'Reserved') {
  const sessionId = ownerInsert('guest_sessions', {
    event_id: f.eventId,
    run_id: f.runId,
    accounting_version: 2,
  }).data.id;
  const captureId = ownerInsert('captures', {
    event_id: f.eventId,
    run_id: f.runId,
    session_id: sessionId,
    accounting_version: 2,
    captured_at: new Date().toISOString(),
    shutter_operation_id: randomUUID(),
  }).data.id;
  const attemptId = ownerInsert('print_attempts', {
    event_id: f.eventId,
    run_id: f.runId,
    session_id: sessionId,
    capture_id: captureId,
    accounting_version: 2,
    kind: 'Guest',
    state,
    request_key: randomUUID(),
    connection_id: randomUUID(),
    printer_id: 'fixture-printer',
    connection_generation: 0,
  }).data.id;
  return { sessionId, captureId, attemptId };
}

it('admits setup with no run/grant using only fresh Admin/device-bound evidence', async () => {
  const f = await createPackageFixture();
  try {
    expect(readiness(f, 'setup').ready).toBe(false);
    const read = await f.readSetup();
    expect(read.error).toBeNull();
    const payload = {
      readinessWindowId: read.data.readinessWindowId,
      deviceHash: f.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      observedAgeMs: 0,
      observation,
      filmLoadedConfirmed: true,
      powerConfirmed: true,
      guidedAccessConfirmed: true,
    };
    expect(
      (await f.admin('report_setup_readiness', { ...payload, deviceHash: '0'.repeat(64) })).error
        ?.message
    ).toBe('not_ready');
    expect(
      (await f.admin('report_setup_readiness', { ...payload, connectionGeneration: 1 })).error
        ?.message
    ).toBe('not_ready');
    const other = await f.local.provisionUser();
    await f.local.allowlist(other.id);
    const signed = await f.local.signIn(other);
    const otherSession = JSON.parse(
      Buffer.from(signed.session.access_token.split('.')[1], 'base64url').toString()
    ).session_id;
    expect(
      (
        await f.local.service.rpc('package_admin_operation', {
          p_admin_user_id: other.id,
          p_admin_session_id: otherSession,
          p_operation: 'report_setup_readiness',
          p_operation_id: randomUUID(),
          p_payload: { eventId: f.eventId, ...payload },
        })
      ).error?.message
    ).toBe('not_ready');
    expect((await f.admin('report_setup_readiness', payload)).error).toBeNull();
    expect(readiness(f, 'setup').ready).toBe(true);
    expect(revision(f)).toBe(1);
    localOwnerSql(
      `update private.package_readiness_windows set received_at=statement_timestamp()-interval '6 seconds',expires_at=statement_timestamp()-interval '1 second' where event_id='${f.eventId}'`
    );
    expect(readiness(f, 'setup').ready).toBe(false);
    expect((await f.admin('report_setup_readiness', payload)).error?.message).toBe('not_ready');
  } finally {
    await f.dispose();
  }
}, 30000);

it('separates guest, reserve, dispatch and paused Resume predicates including the last hold', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    expect((await report(f)).error).toBeNull();
    expect(readiness(f, 'guest').ready).toBe(true);
    expect(readiness(f, 'reserve').ready).toBe(false);
    const own = seedAttempt(f);
    expect(readiness(f, 'guest').blockers).toContain('print_pending');
    expect(readiness(f, 'dispatch', own.attemptId).ready).toBe(true);
    ownerUpdate('print_attempts', own.attemptId, { state: 'NotPrinted' });
    expect(readiness(f, 'reserve').ready).toBe(true);
    ownerUpdate('guest_sessions', own.sessionId, {
      state: 'Abandoned',
      closed_at: new Date().toISOString(),
    });
    ownerUpdate('booth_runs', f.runId, { state: 'Paused' });
    expect(readiness(f, 'guest').ready).toBe(false);
    expect(readiness(f, 'resume').ready).toBe(true);
    ownerUpdate('booth_runs', f.runId, { state: 'Active' });
    for (let n = 0; n < 9; n++) {
      const printed = seedAttempt(f, 'Printed');
      ownerUpdate('guest_sessions', printed.sessionId, {
        state: 'Printed',
        closed_at: new Date().toISOString(),
      });
    }
    const last = seedAttempt(f);
    expect((await report(f)).error).toBeNull();
    expect((await f.readAdmin()).data.counts.printsAvailable).toBe(0);
    expect(readiness(f, 'dispatch', last.attemptId).ready).toBe(true);
    ownerUpdate('print_attempts', last.attemptId, { state: 'Printed' });
    expect(readiness(f, 'guest').blockers).toContain('booked_prints_exhausted');
  } finally {
    await f.dispose();
  }
}, 30000);

it('rejects delayed, future, cross-generation reports and keeps heartbeat revision stable', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    expect((await report(f)).error).toBeNull();
    const initial = revision(f);
    expect((await report(f)).error).toBeNull();
    expect(revision(f)).toBe(initial);
    expect((await report(f, { cameraLive: false, printerConnected: false })).error).toBeNull();
    const fault = readiness(f, 'guest');
    expect(fault.blockers).toEqual(expect.arrayContaining(['camera', 'printer_connection']));
    expect(revision(f)).toBe(initial + 1);
    expect((await report(f)).error).toBeNull();
    const read = await f.readBooth();
    const body = {
      readinessWindowId: read.data.readinessWindowId,
      observedAgeMs: 0,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      observation,
    };
    for (const observedAgeMs of [-1, 0.5, 5001, '0'])
      expect((await f.booth('report_readiness', { ...body, observedAgeMs })).error?.message).toBe(
        'invalid_input'
      );
    expect(
      (await f.booth('report_readiness', { ...body, observedAt: '2099-01-01T00:00:00Z' })).error
        ?.message
    ).toBe('invalid_input');
    expect(
      (await f.booth('report_readiness', { ...body, connectionGeneration: 1 })).error?.message
    ).toBe('not_ready');
    localOwnerSql(
      `update private.package_readiness_windows set received_at=statement_timestamp()-interval '6 seconds',expires_at=statement_timestamp()-interval '1 second' where id='${read.data.readinessWindowId}'`
    );
    expect((await f.booth('report_readiness', body)).error?.message).toBe('not_ready');
    localOwnerSql(
      `update public.booth_runs set observed_at=statement_timestamp()-interval '5 seconds',received_at=statement_timestamp()-interval '5 seconds' where id='${f.runId}'`
    );
    expect(readiness(f, 'guest').blockers).toContain('readiness_stale');
    const beforeRefresh = revision(f);
    expect((await report(f, { mediaAvailable: false })).error).toBeNull();
    expect(revision(f)).toBe(beforeRefresh + 1);
    expect(readiness(f, 'guest').ready).toBe(true);
  } finally {
    await f.dispose();
  }
}, 30000);

it('keeps reload confirmation independent of capacity, outcome, pause and other faults', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun('Paused');
    expect((await report(f)).error).toBeNull();
    const attempt = seedAttempt(f, 'Pending');
    const request = {
      runId: f.runId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: revision(f),
      reason: 'Physical reload requested',
    };
    const key = randomUUID();
    const asked = await f.admin('request_reload', request, key);
    expect(asked.error).toBeNull();
    expect((await f.admin('request_reload', request, key)).data.replayed).toBe(true);
    expect((await f.readAdmin()).data.reloadRequests).toEqual([
      expect.objectContaining({
        state: 'Open',
        printerId: 'fixture-printer',
        connectionGeneration: 0,
      }),
    ]);
    const reloadRequestId = asked.data.receipt.result.reloadRequestId;
    const confirm = {
      reloadRequestId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: revision(f),
    };
    expect((await f.booth('confirm_reload', confirm)).error?.message).toBe('operation_forbidden');
    expect(
      (await f.admin('confirm_reload', { ...confirm, expectedRevision: 1 })).error?.message
    ).toBe('stale_revision');
    expect((await f.admin('confirm_reload', confirm)).error).toBeNull();
    expect(readiness(f, 'resume').blockers).toContain('print_pending');
    expect((await f.readAdmin()).data.counts).toMatchObject({
      printed: 0,
      unresolved: 1,
      printsAvailable: 9,
    });
    ownerUpdate('print_attempts', attempt.attemptId, { state: 'NotPrinted' });
    expect(
      localOwnerSql(
        `select state,film_loaded_confirmed from public.booth_runs where id='${f.runId}'`
      )
    ).toEqual([{ state: 'Paused', film_loaded_confirmed: true }]);
    expect((await report(f, { loadFault: 'cover_open', cameraLive: false })).error).toBeNull();
    const reload = localOwnerSql(
      `select id from public.booth_reload_requests where run_id='${f.runId}' and state='Open'`
    )[0].id;
    expect((await reconnect(f, 1)).error).toBeNull();
    expect(
      (
        await f.admin('confirm_reload', {
          reloadRequestId: reload,
          printerId: 'fixture-printer',
          connectionGeneration: 0,
          expectedRevision: revision(f),
        })
      ).error?.message
    ).toBe('not_ready');
    expect(
      (
        await f.admin('confirm_reload', {
          reloadRequestId: reload,
          printerId: 'fixture-printer',
          connectionGeneration: 1,
          expectedRevision: revision(f),
        })
      ).error
    ).toBeNull();
    expect(readiness(f, 'resume').blockers).toEqual(
      expect.arrayContaining(['camera', 'readiness_stale'])
    );
    expect((await report(f, {}, 1)).error).toBeNull();
    expect(readiness(f, 'resume').blockers).not.toContain('film_reload_needed');
    expect((await reconnect(f, 2)).error).toBeNull();
    expect(
      localOwnerSql(`select film_loaded_confirmed from public.booth_runs where id='${f.runId}'`)
    ).toEqual([{ film_loaded_confirmed: true }]);
    expect(readiness(f, 'resume').blockers).toContain('readiness_stale');
    const read = await f.readBooth();
    expect(
      (
        await f.booth('report_readiness', {
          readinessWindowId: read.data.readinessWindowId,
          observedAgeMs: 0,
          printerId: 'different',
          connectionGeneration: 2,
          observation,
        })
      ).error?.message
    ).toBe('not_ready');
  } finally {
    await f.dispose();
  }
}, 30000);

it('enforces exact server freshness and generation boundaries without wall-clock sleeps', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun('Paused');
    expect((await report(f)).error).toBeNull();
    for (const [age, ready] of [
      ['5 seconds', true],
      ['5.001 seconds', false],
      ['-1 second', false],
    ] as const) {
      localOwnerSql(
        `do $$ declare result boolean; begin update public.booth_runs set observed_at=statement_timestamp()-interval '${age}',received_at=statement_timestamp()-interval '${age}' where id='${f.runId}'; result:=(private.package_readiness('${f.eventId}','resume')->>'ready')::boolean; if result is distinct from ${ready} then raise exception 'freshness boundary failed: %',result; end if; end $$`
      );
    }
    const read = await f.readBooth();
    const key = randomUUID();
    const change = {
      kind: 'connection_changed',
      readinessWindowId: read.data.readinessWindowId,
      printerId: 'fixture-printer',
      connectionGeneration: 1,
      expectedRevision: revision(f),
    };
    expect(
      (await f.booth('report_readiness', { ...change, connectionGeneration: 2 })).error?.message
    ).toBe('not_ready');
    expect((await f.booth('report_readiness', change, key)).error).toBeNull();
    const current = revision(f);
    expect((await f.booth('report_readiness', change, key)).data.replayed).toBe(true);
    expect(revision(f)).toBe(current);
    expect((await f.booth('report_readiness', change)).error?.message).toBe('not_ready');
    expect(
      localOwnerSql(
        `select state,connection_generation,film_loaded_confirmed from public.booth_runs where id='${f.runId}'`
      )
    ).toEqual([{ state: 'Paused', connection_generation: 1, film_loaded_confirmed: true }]);
  } finally {
    await f.dispose();
  }
}, 30000);

it('normalizes whole decimal readiness numbers before validation and receipt fingerprints', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    const read = await f.readBooth();
    const key = randomUUID();
    const payload = {
      readinessWindowId: read.data.readinessWindowId,
      observedAgeMs: 0,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      observation,
    };
    const decimal = JSON.stringify(payload)
      .replace('"observedAgeMs":0', '"observedAgeMs":0.0')
      .replace('"connectionGeneration":0', '"connectionGeneration":0.0');
    const first = localOwnerSql(
      `select private.package_booth_operation('${f.grantHash}','report_readiness','${key}','${decimal}'::jsonb) result`
    )[0].result;
    expect(first).toMatchObject({ replayed: false });
    expect((await f.booth('report_readiness', payload, key)).data.replayed).toBe(true);
  } finally {
    await f.dispose();
  }
}, 30000);
