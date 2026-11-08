import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { createPackageFixture, type PackageFixture } from '../fixtures/package-contract';
import { withMediaEventHeld } from '../fixtures/package-browser';
import {
  localOwnerSql,
  localSupabaseStatus,
  ownerInsert,
  ownerUpdate,
} from '../fixtures/local-supabase';

beforeAll(() => {
  localSupabaseStatus();
});
const owned: PackageFixture[] = [];
afterEach(async () => {
  for (const f of owned.splice(0)) await f.dispose();
});
async function setup(state = 'Paused') {
  const f = await createPackageFixture();
  owned.push(f);
  f.seedRun(state, 'instax-fi033-0102-dev-v1');
  ownerUpdate('booth_runs', f.runId, { old_job_safety_confirmed: false });
  const request = await f.admin('request_reload', {
    runId: f.runId,
    printerId: 'fixture-printer',
    connectionGeneration: 0,
    expectedRevision: 2,
    reason: 'film loading',
  });
  expect(request.error).toBeNull();
  const reloadRequestId = request.data.receipt.result.reloadRequestId as string;
  const payload = {
    reloadRequestId,
    reloadRequestRevision: 1,
    printerId: 'fixture-printer',
    connectionGeneration: 0,
    observationId: randomUUID(),
    kind: 'film_loaded',
    adapterVersion: 'instax-mini-link3-v1',
    evidenceVersion: 'instax-fi033-0102-dev-v1',
  };
  return {
    f,
    payload,
    manual: () =>
      f.admin('confirm_reload', {
        reloadRequestId,
        printerId: 'fixture-printer',
        connectionGeneration: 0,
        expectedRevision: request.data.revision,
      }),
  };
}
function run(f: PackageFixture) {
  return localOwnerSql(
    `select state,old_job_safety_confirmed,film_loaded_confirmed from public.booth_runs where id='${f.runId}'`
  )[0];
}
function request(id: string) {
  return localOwnerSql(
    `select state,revision,confirmation_source,confirmed_by,confirmed_by_grant_id,observation_id from public.booth_reload_requests where id='${id}'`
  )[0];
}
it.each(['Active', 'Paused', 'Finishing'])(
  'confirms only film readiness while %s and replays its original receipt',
  async (state) => {
    const { f, payload } = await setup(state);
    const before = await f.readAdmin();
    const result = await f.booth('observe_reload', payload, payload.observationId);
    expect(result.error).toBeNull();
    expect(run(f)).toEqual({ state, old_job_safety_confirmed: false, film_loaded_confirmed: true });
    expect((await f.readAdmin()).data.counts).toEqual(before.data.counts);
    expect(request(payload.reloadRequestId)).toMatchObject({
      state: 'Confirmed',
      revision: 2,
      confirmed_by: null,
      confirmed_by_grant_id: f.grantId,
      observation_id: payload.observationId,
      confirmation_source: 'instax_automatic_reload',
    });
    const replacement = await f.admin('request_reload', {
      runId: f.runId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: result.data.revision,
      reason: 'another pack',
    });
    expect(replacement.error).toBeNull();
    const replay = await f.booth('observe_reload', payload, payload.observationId);
    expect(replay.error).toBeNull();
    expect(replay.data.replayed).toBe(true);
    expect(replay.data.receipt).toEqual(result.data.receipt);
    expect(run(f).film_loaded_confirmed).toBe(false);
    const conflict = await f.booth(
      'observe_reload',
      { ...payload, printerId: 'other' },
      payload.observationId
    );
    expect(conflict.error?.message).toContain('operation_conflict');
  }
);
it.each(['auto-first', 'manual-first', 'concurrent'])(
  'keeps the winning attribution through %s',
  async (order) => {
    const { f, payload, manual } = await setup();
    const auto = () => f.booth('observe_reload', payload, payload.observationId);
    const before = (await f.readAdmin()).data.revision;
    if (order === 'concurrent') {
      const results = await Promise.all([auto(), manual()]);
      expect(results.map((x) => x.error)).toEqual([null, null]);
    } else {
      const first = await (order === 'auto-first' ? auto() : manual());
      expect(first.error).toBeNull();
      const winner = request(payload.reloadRequestId);
      expect((await (order === 'auto-first' ? manual() : auto())).error).toBeNull();
      expect(request(payload.reloadRequestId)).toEqual(winner);
    }
    expect((await f.readAdmin()).data.revision).toBe(before + 1);
    expect(run(f)).toEqual({
      state: 'Paused',
      old_job_safety_confirmed: false,
      film_loaded_confirmed: true,
    });
  }
);
it.each([
  ['reloadRequestId', () => randomUUID()],
  ['reloadRequestRevision', () => 2],
  ['printerId', () => 'other'],
  ['connectionGeneration', () => 1],
  ['evidenceVersion', () => 'simulator-v1'],
  ['adapterVersion', () => 'simulator-v2'],
  ['kind', () => 'full_ejection_confirmed'],
  ['metadata', () => ({})],
])('rejects wrong %s without changing film or accounting', async (field, value) => {
  const { f, payload } = await setup();
  const before = await f.readAdmin();
  const result = await f.booth(
    'observe_reload',
    { ...payload, [field]: value() },
    payload.observationId
  );
  expect(result.error).not.toBeNull();
  expect(run(f)).toEqual({
    state: 'Paused',
    old_job_safety_confirmed: false,
    film_loaded_confirmed: false,
  });
  expect((await f.readAdmin()).data.counts).toEqual(before.data.counts);
  expect(request(payload.reloadRequestId).state).toBe('Open');
});
it('rejects superseded evidence and stale generation after reconnect', async () => {
  const { f, payload } = await setup();
  expect(
    (
      await f.admin('request_reload', {
        runId: f.runId,
        printerId: 'fixture-printer',
        connectionGeneration: 0,
        expectedRevision: 3,
        reason: 'new request',
      })
    ).error
  ).toBeNull();
  expect((await f.booth('observe_reload', payload, payload.observationId)).error).not.toBeNull();
  expect(run(f).film_loaded_confirmed).toBe(false);
  ownerUpdate('booth_runs', f.runId, { connection_generation: 1 });
  expect(
    (await f.booth('observe_reload', { ...payload, observationId: randomUUID() })).error
  ).not.toBeNull();
});
it('rejects revoked grant rather than accepting device evidence', async () => {
  const { f, payload } = await setup();
  ownerUpdate('booth_grants', f.grantId, {
    state: 'Revoked',
    revoked_at: new Date().toISOString(),
  });
  expect((await f.booth('observe_reload', payload, payload.observationId)).error).not.toBeNull();
  expect(run(f).film_loaded_confirmed).toBe(false);
});

it('keeps a Pending attempt and printer slot exactly unchanged', async () => {
  const { f, payload } = await setup();
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
    state: 'Pending',
    request_key: randomUUID(),
    connection_id: randomUUID(),
    printer_id: 'fixture-printer',
    connection_generation: 0,
  }).data.id;
  const before = localOwnerSql(`select * from public.print_attempts where id='${attemptId}'`);
  const counts = (await f.readAdmin()).data.counts;
  expect((await f.booth('observe_reload', payload, payload.observationId)).error).toBeNull();
  expect(localOwnerSql(`select * from public.print_attempts where id='${attemptId}'`)).toEqual(
    before
  );
  expect((await f.readAdmin()).data.counts).toEqual(counts);
  expect((await f.readBooth()).data.allowedActions.startGuest).toBe(false);
});
it('rechecks Admin authority after the Event lock wait for manual confirmation', async () => {
  const { f, payload, manual } = await setup();
  const result = await withMediaEventHeld(
    f.eventId,
    () => Promise.resolve(manual()),
    () => {
      localOwnerSql(`delete from auth.sessions where id='${f.adminSessionId}'`);
    }
  );
  expect(result.error?.message).toBe('access_required');
  expect(request(payload.reloadRequestId).state).toBe('Open');
  expect(run(f).film_loaded_confirmed).toBe(false);
}, 30000);
it('does not grant another device observation capability or accept a different policy', async () => {
  const { f, payload } = await setup();
  ownerUpdate('booth_grants', f.grantId, { capabilities: ['read'] });
  expect((await f.booth('observe_reload', payload, payload.observationId)).error?.message).toBe(
    'operation_forbidden'
  );
  ownerUpdate('booth_grants', f.grantId, { capabilities: ['read', 'observe'] });
  ownerUpdate('booth_runs', f.runId, { evidence_policy_version: 'simulator-v1' });
  expect((await f.booth('observe_reload', payload, payload.observationId)).error?.message).toBe(
    'qualification_required'
  );
  expect(run(f).film_loaded_confirmed).toBe(false);
});
it('rejects another run grant even when it submits the exact request binding', async () => {
  const { f, payload } = await setup();
  const other = await createPackageFixture();
  owned.push(other);
  other.seedRun('Paused', 'instax-fi033-0102-dev-v1');
  expect(
    (await other.booth('observe_reload', payload, payload.observationId)).error
  ).not.toBeNull();
  expect(request(payload.reloadRequestId).state).toBe('Open');
  expect(run(f).film_loaded_confirmed).toBe(false);
});
