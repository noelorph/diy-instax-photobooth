import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPackageFixture } from '../fixtures/package-contract';
import { localOwnerSql } from '../fixtures/local-supabase';

async function withGuardHeld<T>(work: () => Promise<T>) {
  const child = spawn('docker', [
    'exec',
    '-i',
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
  ]);
  const done = once(child, 'exit');
  child.stdin.write(
    "begin;\nselect id from private.booth_contract_guard where id for update;\nselect 'LOCKED';\n"
  );
  await new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('LOCKED')) resolve();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code) reject(new Error(`Guard barrier exited ${code}`));
    });
  });
  expect(child.exitCode).toBeNull();
  const pending = work();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  child.stdin.write('commit;\n\\q\n');
  const result = await pending;
  await done;
  return result;
}

let priorPolicy: unknown;
beforeAll(() => {
  priorPolicy = localOwnerSql('select mode from public.printer_completion_policy where id')[0].mode;
  localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
});
afterAll(() => {
  localOwnerSql(`update public.printer_completion_policy set mode='${priorPolicy}' where id`);
});

it('starts only from the exact reported Admin and device setup, and keeps the run Prepared', async () => {
  const f = await createPackageFixture();
  try {
    const setup = await f.reportSetup();
    expect(setup.error).toBeNull();
    const read = await f.readAdmin();
    const payload = {
      expectedRevision: read.data.revision,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: f.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    };
    expect(
      (await f.admin('start', { ...payload, deviceHash: '0'.repeat(64) })).error?.message
    ).toBe('not_ready');
    const started = await f.admin('start', payload);
    expect(started.error).toBeNull();
    expect(started.data.receipt.result.purpose).toBe('initial');
    expect(
      localOwnerSql(`select state from public.booth_runs where event_id='${f.eventId}'`)[0].state
    ).toBe('Prepared');
    expect(
      localOwnerSql(`select state from public.booth_grants where event_id='${f.eventId}'`)[0].state
    ).toBe('Inactive');
    expect(localOwnerSql(`select state from public.events where id='${f.eventId}'`)[0].state).toBe(
      'Live'
    );
    expect((await f.admin('start', payload)).error?.message).toBe('stale_revision');
  } finally {
    await f.dispose();
  }
}, 30000);

it('pauses immediately, finishes after unresolved work settles, and permits a new Live run', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    const pending = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${f.eventId}','${f.runId}',2) returning id`
    )[0].id;
    const paused = await f.admin('pause', { runId: f.runId, expectedRevision: 2 });
    expect(paused.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Paused');
    const finished = await f.admin('finish', {
      runId: f.runId,
      expectedRevision: paused.data.revision,
    });
    expect(finished.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finished');
    expect(
      localOwnerSql(`select state from public.booth_grants where id='${f.grantId}'`)[0].state
    ).toBe('Revoked');
    expect(
      (await f.admin('resume', { runId: f.runId, expectedRevision: finished.data.revision })).error
        ?.message
    ).toBe('invalid_transition');
    expect(
      (await f.admin('complete', { expectedRevision: finished.data.revision })).error
    ).toBeNull();
    expect(
      (await f.admin('cancel', { expectedRevision: finished.data.revision + 1 })).error?.message
    ).toBe('invalid_transition');
    expect(pending).toBeTruthy();
  } finally {
    await f.dispose();
  }
}, 30000);

it('records Draft deletion as pending until private media is gone', async () => {
  const f = await createPackageFixture();
  try {
    const begun = await f.admin('begin_delete_draft', { expectedRevision: 1 });
    expect(begun.error).toBeNull();
    const receipt = await f.readAdmin(begun.data.receipt.operationId);
    expect(receipt.error).toBeNull();
    expect(receipt.data.receipt.kind).toBe('begin_delete_draft');
    expect(
      localOwnerSql(`select media_removal_state from public.events where id='${f.eventId}'`)[0]
        .media_removal_state
    ).toBe('pending');
    const done = await f.admin('complete_delete_draft', { expectedRevision: begun.data.revision });
    expect(done.error).toBeNull();
    expect(
      localOwnerSql(
        `select deleted_at is not null as deleted,client_name from public.events where id='${f.eventId}'`
      )[0]
    ).toEqual({ deleted: true, client_name: null });
    expect(
      (
        await f.admin('start', {
          expectedRevision: done.data.revision,
          readinessWindowId: randomUUID(),
          deviceHash: f.deviceHash,
          printerId: 'fixture-printer',
          connectionGeneration: 0,
        })
      ).error
    ).not.toBeNull();
  } finally {
    await f.dispose();
  }
}, 30000);

it('does not reuse a reported setup window for a second run', async () => {
  const f = await createPackageFixture();
  try {
    const setup = await f.reportSetup();
    const body = {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: f.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    };
    const start = await f.admin('start', body);
    expect(start.error).toBeNull();
    const firstRun = start.data.receipt.result.runId;
    const sessionId = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version,state,closed_at) values('${f.eventId}','${firstRun}',2,'Printed',clock_timestamp()) returning id`
    )[0].id;
    const captureId = localOwnerSql(
      `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${f.eventId}','${firstRun}','${sessionId}',2,clock_timestamp(),'${randomUUID()}') returning id`
    )[0].id;
    localOwnerSql(
      `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${f.eventId}','${firstRun}','${sessionId}','${captureId}',2,'Guest','Printed','${randomUUID()}','${randomUUID()}')`
    );
    const finish = await f.admin('finish', {
      runId: firstRun,
      expectedRevision: start.data.revision,
    });
    expect(finish.error).toBeNull();
    expect(
      (await f.admin('start', { ...body, expectedRevision: finish.data.revision })).error?.message
    ).toBe('not_ready');
    const fresh = await f.reportSetup();
    expect(fresh.error).toBeNull();
    const second = await f.admin('start', {
      ...body,
      expectedRevision: finish.data.revision,
      readinessWindowId: fresh.data.readinessWindowId,
    });
    expect(second.error).toBeNull();
    expect(second.data.receipt.result.runId).not.toBe(firstRun);
    expect((await f.readAdmin()).data.counts).toMatchObject({ printed: 1, printsAvailable: 9 });
  } finally {
    await f.dispose();
  }
}, 30000);

it('rejects setup reports and mutations for terminal Events', async () => {
  const f = await createPackageFixture();
  try {
    const read = await f.readSetup();
    expect(read.error).toBeNull();
    expect((await f.admin('cancel', { expectedRevision: 1 })).error).toBeNull();
    expect((await f.readSetup()).error?.message).toBe('invalid_transition');
    expect(
      (
        await f.admin('report_setup_readiness', {
          readinessWindowId: read.data.readinessWindowId,
          deviceHash: f.deviceHash,
          printerId: 'fixture-printer',
          connectionGeneration: 0,
          observedAgeMs: 0,
          observation: {
            cameraPermission: true,
            cameraLive: true,
            serverReachable: true,
            printerConnected: true,
            printerReady: true,
            oldJobCleared: true,
          },
          filmLoadedConfirmed: true,
          powerConfirmed: true,
          guidedAccessConfirmed: true,
        })
      ).error?.message
    ).toBe('invalid_transition');
  } finally {
    await f.dispose();
  }
}, 30000);

it('keeps Finishing and device observation access until a pending attempt settles', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    const sessionId = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${f.eventId}','${f.runId}',2) returning id`
    )[0].id;
    const captureId = localOwnerSql(
      `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${f.eventId}','${f.runId}','${sessionId}',2,clock_timestamp(),'${randomUUID()}') returning id`
    )[0].id;
    const attemptId = localOwnerSql(
      `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${f.eventId}','${f.runId}','${sessionId}','${captureId}',2,'Guest','Pending','${randomUUID()}','${randomUUID()}') returning id`
    )[0].id;
    const finish = await f.admin('finish', { runId: f.runId, expectedRevision: 2 });
    expect(finish.error).toBeNull();
    expect(finish.data.receipt.result.state).toBe('Finishing');
    expect((await f.readBooth()).error).toBeNull();
    expect(
      (await f.admin('complete', { expectedRevision: finish.data.revision })).error?.message
    ).toBe('print_pending');
    localOwnerSql(
      `update public.print_attempts set state='Printed',resolved_at=clock_timestamp() where id='${attemptId}'`
    );
    expect(
      localOwnerSql(`select private.package_finish_if_clear('${f.eventId}','${f.runId}') result`)[0]
        .result
    ).toBe(true);
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finished');
    expect((await f.readBooth()).error?.message).toBe('access_required');
  } finally {
    await f.dispose();
  }
}, 30000);

it('serializes simultaneous starts and commits one run, grant and receipt', async () => {
  const f = await createPackageFixture();
  try {
    const setup = await f.reportSetup();
    const body = {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: f.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    };
    const [left, right] = await withGuardHeld(() =>
      Promise.all([f.admin('start', body), f.admin('start', body)])
    );
    expect([left.error?.message, right.error?.message].filter(Boolean)).toEqual(['stale_revision']);
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.booth_runs where event_id='${f.eventId}'`
      )[0].n
    ).toBe(1);
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.booth_grants where event_id='${f.eventId}'`
      )[0].n
    ).toBe(1);
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.operation_receipts where event_id='${f.eventId}' and operation_kind='start'`
      )[0].n
    ).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);

it('serializes pause against finish without losing the winning transition', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    const [pause, finish] = await withGuardHeld(() =>
      Promise.all([
        f.admin('pause', { runId: f.runId, expectedRevision: 2 }),
        f.admin('finish', { runId: f.runId, expectedRevision: 2 }),
      ])
    );
    expect([pause.error?.message, finish.error?.message].filter(Boolean)).toEqual([
      'stale_revision',
    ]);
    const state = localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0]
      .state;
    expect(['Paused', 'Finished']).toContain(state);
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.operation_receipts where event_id='${f.eventId}' and operation_kind in ('pause','finish')`
      )[0].n
    ).toBe(1);
    expect(
      localOwnerSql(`select state from public.booth_grants where id='${f.grantId}'`)[0].state
    ).toBe(state === 'Finished' ? 'Revoked' : 'Active');
  } finally {
    await f.dispose();
  }
}, 30000);

it('replays an authorized start receipt after the Event becomes terminal', async () => {
  const f = await createPackageFixture();
  try {
    const setup = await f.reportSetup();
    const key = randomUUID();
    const body = {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: f.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    };
    const started = await f.admin('start', body, key);
    expect(started.error).toBeNull();
    const finished = await f.admin('finish', {
      runId: started.data.receipt.result.runId,
      expectedRevision: started.data.revision,
    });
    expect(finished.error).toBeNull();
    expect(
      (await f.admin('complete', { expectedRevision: finished.data.revision })).error
    ).toBeNull();
    const replay = await f.admin('start', body, key);
    expect(replay.error).toBeNull();
    expect(replay.data.replayed).toBe(true);
    expect(replay.data.receipt.result.runId).toBe(started.data.receipt.result.runId);
  } finally {
    await f.dispose();
  }
}, 30000);
