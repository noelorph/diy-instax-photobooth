import { testStack } from '../fixtures/test-stack.mjs';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPackageFixture } from '../fixtures/package-contract';
import { cleanupEvents, localOwnerSql } from '../fixtures/local-supabase';

let priorPolicy: unknown;
beforeAll(() => {
  priorPolicy = localOwnerSql('select mode from public.printer_completion_policy where id')[0].mode;
  localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
});
afterAll(() => {
  localOwnerSql(`update public.printer_completion_policy set mode='${priorPolicy}' where id`);
});

function captureTime() {
  return localOwnerSql('select clock_timestamp() as captured_at')[0].captured_at as string;
}

function ready(runId: string) {
  localOwnerSql(
    `update public.booth_runs set readiness_observation='{"printerMode":"simulated","printerEvidence":{"adapterVersion":"simulator-v2","evidenceVersion":"simulator-v1","modelNumber":null,"firmwareRevision":null},"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb, observed_at=clock_timestamp(), received_at=clock_timestamp() where id='${runId}'`
  );
}

async function raceBehindGuard<T, U>(first: () => Promise<T>, second: () => Promise<U>) {
  const child = spawn('docker', [
    'exec',
    '-i',
    testStack.databaseContainer,
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
  });
  async function waitForQueued(count: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const observed = localOwnerSql(
        "select wait_event_type from pg_stat_activity where pid<>pg_backend_pid() and state='active'"
      );
      const waiting = observed.filter((row) => row.wait_event_type === 'Lock').length;
      if (waiting >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Expected ${count} queued database operations`);
  }
  const a = first();
  let b: Promise<U> | undefined;
  try {
    await waitForQueued(1);
    b = second();
    await waitForQueued(2);
  } finally {
    child.stdin.write('commit;\n\\q\n');
  }
  if (!b) throw new Error('Second database operation was not queued');
  const result = await Promise.all([a, b] as const);
  await done;
  return result;
}

function directRpc(
  query: string
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  return new Promise((resolve) => {
    const child = spawn('docker', [
      'exec',
      '-i',
      testStack.databaseContainer,
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
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      error += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ data: JSON.parse(output.trim().split('\n').at(-1)!), error: null });
      else
        resolve({ data: null, error: { message: error.match(/ERROR:\s*([^\n]+)/)?.[1] ?? error } });
    });
    child.stdin.end(`set role service_role;\n${query}\n`);
  });
}

async function reserved(f: Awaited<ReturnType<typeof createPackageFixture>>) {
  f.seedRun();
  ready(f.runId);
  const sessionId = (await f.booth('start_session', { expectedRevision: 2 })).data.receipt.result
    .sessionId as string;
  const captureId = randomUUID();
  const capture = await f.booth('record_capture', {
    sessionId,
    captureId,
    capturedAt: captureTime(),
  });
  expect(capture.error).toBeNull();
  ready(f.runId);
  const held = await f.booth('reserve', {
    sessionId,
    captureId,
    expectedRevision: capture.data.revision,
  });
  expect(held.error).toBeNull();
  return { sessionId, captureId, attemptId: held.data.receipt.result.attemptId as string };
}

it('starts one guest only when the scoped run is ready', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    ready(f.runId);
    const started = await f.booth('start_session', { expectedRevision: 2 });
    expect(started.error).toBeNull();
    expect(started.data.receipt.result.sessionId).toBeTruthy();
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.guest_sessions where run_id='${f.runId}'`
      )[0].n
    ).toBe(1);
    expect(
      (await f.booth('start_session', { expectedRevision: started.data.revision }, randomUUID()))
        .error?.message
    ).toBe('not_ready');
  } finally {
    await f.dispose();
  }
}, 30000);

it('records one completed shutter by its stable operation ID', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    ready(f.runId);
    const sessionId = (await f.booth('start_session', { expectedRevision: 2 })).data.receipt.result
      .sessionId;
    const captureId = randomUUID();
    const operationId = randomUUID();
    const input = { sessionId, captureId, capturedAt: captureTime() };
    const first = await f.booth('record_capture', input, operationId);
    expect(first.error).toBeNull();
    expect((await f.booth('record_capture', input, operationId)).data.replayed).toBe(true);
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.captures where session_id='${sessionId}'`
      )[0].n
    ).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);

it('reserves only the newest acknowledged Capture and holds one unit', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    ready(f.runId);
    const sessionId = (await f.booth('start_session', { expectedRevision: 2 })).data.receipt.result
      .sessionId;
    const firstCapture = randomUUID();
    const currentCapture = randomUUID();
    expect(
      (
        await f.booth('record_capture', {
          sessionId,
          captureId: firstCapture,
          capturedAt: captureTime(),
        })
      ).error
    ).toBeNull();
    expect(
      (
        await f.booth('record_capture', {
          sessionId,
          captureId: currentCapture,
          capturedAt: captureTime(),
        })
      ).error
    ).toBeNull();
    ready(f.runId);
    const revision = (await f.readBooth()).data.revision;
    expect(
      (await f.booth('reserve', { sessionId, captureId: firstCapture, expectedRevision: revision }))
        .error?.message
    ).toBe('invalid_transition');
    const reservationId = randomUUID();
    const input = {
      sessionId,
      captureId: currentCapture,
      expectedRevision: revision,
    };
    const reserved = await f.booth('reserve', input, reservationId);
    expect(reserved.error).toBeNull();
    expect((await f.booth('reserve', input, reservationId)).data.replayed).toBe(true);
    expect(
      (await f.booth('reserve', { ...input, expectedRevision: reserved.data.revision })).error
        ?.message
    ).toBe('not_ready');
    const receiptRead = await f.local.service.rpc('package_booth_read', {
      p_grant_hash: f.grantHash,
      p_operation_id: reservationId,
    });
    expect(receiptRead.data.receipt.result.attemptId).toBe(reserved.data.receipt.result.attemptId);
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
    expect(
      localOwnerSql(
        `select state,capture_id from public.print_attempts where id='${reserved.data.receipt.result.attemptId}'`
      )[0]
    ).toMatchObject({ state: 'Reserved', capture_id: currentCapture });
  } finally {
    await f.dispose();
  }
}, 30000);

it('reserves the newest shutter despite reversed metadata arrival', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    ready(f.runId);
    const sessionId = (await f.booth('start_session', { expectedRevision: 2 })).data.receipt.result
      .sessionId;
    const captureA = randomUUID();
    const captureB = randomUUID();
    const timeA = captureTime();
    const timeB = captureTime();
    expect(Date.parse(timeB)).toBeGreaterThan(Date.parse(timeA));
    expect(
      (await f.booth('record_capture', { sessionId, captureId: captureB, capturedAt: timeB })).error
    ).toBeNull();
    const older = await f.booth('record_capture', {
      sessionId,
      captureId: captureA,
      capturedAt: timeA,
    });
    expect(older.error).toBeNull();
    ready(f.runId);
    expect(
      (
        await f.booth('reserve', {
          sessionId,
          captureId: captureA,
          expectedRevision: older.data.revision,
        })
      ).error?.message
    ).toBe('invalid_transition');
    const held = await f.booth('reserve', {
      sessionId,
      captureId: captureB,
      expectedRevision: older.data.revision,
    });
    expect(held.error).toBeNull();
    expect(
      localOwnerSql(
        `select capture_id from public.print_attempts where id='${held.data.receipt.result.attemptId}'`
      )[0].capture_id
    ).toBe(captureB);
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.captures where session_id='${sessionId}'`
      )[0].n
    ).toBe(2);
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
  } finally {
    await f.dispose();
  }
}, 30000);

it('dispatches the selected capture after older metadata arrives', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    ready(f.runId);
    const sessionId = (await f.booth('start_session', { expectedRevision: 2 })).data.receipt.result
      .sessionId;
    const captureA = randomUUID();
    const captureB = randomUUID();
    const timeA = captureTime();
    const newer = await f.booth('record_capture', {
      sessionId,
      captureId: captureB,
      capturedAt: captureTime(),
    });
    expect(newer.error).toBeNull();
    ready(f.runId);
    const held = await f.booth('reserve', {
      sessionId,
      captureId: captureB,
      expectedRevision: newer.data.revision,
    });
    expect(held.error).toBeNull();
    const older = await f.booth('record_capture', {
      sessionId,
      captureId: captureA,
      capturedAt: timeA,
    });
    expect(older.error).toBeNull();
    ready(f.runId);
    const operationId = randomUUID();
    const input = {
      attemptId: held.data.receipt.result.attemptId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: older.data.revision,
    };
    const dispatched = await f.booth('dispatch', input, operationId);
    expect(dispatched.error).toBeNull();
    expect(dispatched.data.sendAllowed).toBe(true);
    const replayed = await f.booth('dispatch', input, operationId);
    expect(replayed.error).toBeNull();
    expect(replayed.data.sendAllowed).toBe(false);
    const boundCaptureId = localOwnerSql(
      `select capture_id from public.print_attempts where id='${input.attemptId}'`
    )[0].capture_id;
    expect(boundCaptureId).toBe(captureB);
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.captures where session_id='${sessionId}'`
      )[0].n
    ).toBe(2);
  } finally {
    await f.dispose();
  }
}, 30000);

it.each([0, 1])(
  'permits explicitly selected tied shutter %i regardless of arrival or UUID order',
  async (selected) => {
    const f = await createPackageFixture();
    try {
      f.seedRun();
      ready(f.runId);
      const sessionId = (await f.booth('start_session', { expectedRevision: 2 })).data.receipt
        .result.sessionId;
      const captures = [randomUUID(), randomUUID(), randomUUID()].sort().reverse();
      const capturedAt = captureTime();
      for (const captureId of captures.slice(0, 2)) {
        expect(
          (await f.booth('record_capture', { sessionId, captureId, capturedAt })).error
        ).toBeNull();
      }
      ready(f.runId);
      const held = await f.booth('reserve', {
        sessionId,
        captureId: captures[selected],
        expectedRevision: (await f.readBooth()).data.revision,
      });
      expect(held.error).toBeNull();
      const tied = await f.booth('record_capture', {
        sessionId,
        captureId: captures[2],
        capturedAt,
      });
      expect(tied.error).toBeNull();
      ready(f.runId);
      const dispatched = await f.booth('dispatch', {
        attemptId: held.data.receipt.result.attemptId,
        printerId: 'fixture-printer',
        connectionGeneration: 0,
        expectedRevision: tied.data.revision,
      });
      expect(dispatched.error).toBeNull();
      expect(dispatched.data.sendAllowed).toBe(true);
      expect(
        localOwnerSql(
          `select capture_id from public.print_attempts where id='${held.data.receipt.result.attemptId}'`
        )[0].capture_id
      ).toBe(captures[selected]);
    } finally {
      await f.dispose();
    }
  },
  30000
);

it('rejects dispatch after a genuinely newer shutter and reconciles the unsent hold', async () => {
  const f = await createPackageFixture();
  try {
    const { sessionId, captureId, attemptId } = await reserved(f);
    const newer = await f.booth('record_capture', {
      sessionId,
      captureId: randomUUID(),
      capturedAt: captureTime(),
    });
    expect(newer.error).toBeNull();
    ready(f.runId);
    const dispatched = await f.booth('dispatch', {
      attemptId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: newer.data.revision,
    });
    expect(dispatched.error?.message).toBe('invalid_transition');
    expect(dispatched.data).toBeNull();
    expect(
      localOwnerSql(
        `select state,dispatch_id,capture_id from public.print_attempts where id='${attemptId}'`
      )[0]
    ).toMatchObject({ state: 'Reserved', dispatch_id: null, capture_id: captureId });
    const reconciled = await f.booth('reconcile', { attemptId, reason: 'newer_capture' });
    expect(reconciled.error).toBeNull();
    expect(reconciled.data.receipt.result.state).toBe('NotPrinted');
    expect(
      localOwnerSql(`select dispatch_id from public.print_attempts where id='${attemptId}'`)[0]
        .dispatch_id
    ).toBeNull();
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 0, printsAvailable: 10 });
  } finally {
    await f.dispose();
  }
}, 30000);

it('authorizes only the first dispatch response and keeps authorization out of receipts', async () => {
  const f = await createPackageFixture();
  try {
    const { attemptId } = await reserved(f);
    ready(f.runId);
    const operationId = randomUUID();
    const input = {
      attemptId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: (await f.readBooth()).data.revision,
    };
    const first = await f.booth('dispatch', input, operationId);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ sendAllowed: true });
    expect(first.data.authorization.dispatchId).toBeTruthy();
    const replay = await f.booth('dispatch', input, operationId);
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ sendAllowed: false, replayed: true });
    expect(replay.data.authorization).toBeUndefined();
    const receipt = await f.local.service.rpc('package_booth_read', {
      p_grant_hash: f.grantHash,
      p_operation_id: operationId,
    });
    expect(receipt.data.receipt.result.authorization).toBeUndefined();
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
    expect(
      localOwnerSql(
        `select state,dispatch_id from public.print_attempts where id='${attemptId}'`
      )[0]
    ).toMatchObject({ state: 'Dispatching', dispatch_id: first.data.authorization.dispatchId });
  } finally {
    await f.dispose();
  }
}, 30000);

it('ends the Guest Session without claiming that its Reserved attempt printed', async () => {
  const f = await createPackageFixture();
  try {
    const { sessionId, attemptId, captureId } = await reserved(f);
    const ended = await f.booth('end_session', { sessionId, reason: 'page_reload' });
    expect(ended.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.guest_sessions where id='${sessionId}'`)[0].state
    ).toBe('Abandoned');
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Reserved');
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
    expect(
      (
        await f.booth('reserve', {
          sessionId,
          captureId,
          expectedRevision: ended.data.revision,
        })
      ).error?.message
    ).toBe('invalid_transition');
  } finally {
    await f.dispose();
  }
}, 30000);

it('reconciles a server-proven unsent reservation as NotPrinted and releases its hold', async () => {
  const f = await createPackageFixture();
  try {
    const { sessionId, attemptId } = await reserved(f);
    const reconciled = await f.booth('reconcile', { attemptId, reason: 'response_lost' });
    expect(reconciled.error).toBeNull();
    expect(reconciled.data.receipt.result).toMatchObject({ attemptId, state: 'NotPrinted' });
    expect(
      localOwnerSql(`select state from public.guest_sessions where id='${sessionId}'`)[0].state
    ).toBe('Abandoned');
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 0, printsAvailable: 10 });
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('NotPrinted');
  } finally {
    await f.dispose();
  }
}, 30000);

it('keeps a dispatch with possible delivery Pending after session recovery', async () => {
  const f = await createPackageFixture();
  try {
    const { sessionId, attemptId } = await reserved(f);
    ready(f.runId);
    const sent = await f.booth('dispatch', {
      attemptId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: (await f.readBooth()).data.revision,
    });
    expect(sent.error).toBeNull();
    const result = await f.booth('reconcile', { attemptId, reason: 'page_reload' });
    expect(result.error).toBeNull();
    expect(result.data.receipt.result).toMatchObject({ attemptId, state: 'Pending' });
    expect(
      localOwnerSql(`select state from public.guest_sessions where id='${sessionId}'`)[0].state
    ).toBe('Abandoned');
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
    expect(
      (await f.booth('reconcile', { attemptId, reason: 'again' })).data.receipt.result.state
    ).toBe('Pending');
  } finally {
    await f.dispose();
  }
}, 30000);

it('lets the Admin recover a proven unsent attempt without revoking the Booth grant', async () => {
  const f = await createPackageFixture();
  try {
    const { attemptId } = await reserved(f);
    const revision = (await f.readAdmin()).data.revision;
    const operationId = randomUUID();
    const input = {
      attemptId,
      reason: 'device journal lost',
      expectedRevision: revision,
    };
    const recovered = await f.admin('recover_attempt', input, operationId);
    expect(recovered.error).toBeNull();
    expect(recovered.data.receipt.result).toMatchObject({ attemptId, state: 'NotPrinted' });
    expect((await f.admin('recover_attempt', input, operationId)).data.replayed).toBe(true);
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 0, printsAvailable: 10 });
    expect(
      localOwnerSql(`select state from public.booth_grants where id='${f.grantId}'`)[0].state
    ).toBe('Active');
  } finally {
    await f.dispose();
  }
}, 30000);

it('keeps possible delivery Pending during Admin recovery', async () => {
  const f = await createPackageFixture();
  try {
    const { attemptId } = await reserved(f);
    ready(f.runId);
    const sent = await f.booth('dispatch', {
      attemptId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: (await f.readBooth()).data.revision,
    });
    expect(sent.error).toBeNull();
    const recovered = await f.admin('recover_attempt', {
      attemptId,
      reason: 'device lost',
      expectedRevision: sent.data.revision,
    });
    expect(recovered.error).toBeNull();
    expect(recovered.data.receipt.result.state).toBe('Pending');
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
    expect(
      localOwnerSql(`select state from public.booth_grants where id='${f.grantId}'`)[0].state
    ).toBe('Active');
  } finally {
    await f.dispose();
  }
}, 30000);

it('keeps a Completed Event immutable against a new Admin recovery request', async () => {
  const f = await createPackageFixture();
  try {
    const { attemptId } = await reserved(f);
    const recovered = await f.admin('recover_attempt', {
      attemptId,
      reason: 'journal lost',
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(recovered.error).toBeNull();
    const finished = await f.admin('finish', {
      runId: f.runId,
      expectedRevision: recovered.data.revision,
    });
    expect(finished.error).toBeNull();
    const completed = await f.admin('complete', { expectedRevision: finished.data.revision });
    expect(completed.error).toBeNull();
    const denied = await f.admin('recover_attempt', {
      attemptId,
      reason: 'again',
      expectedRevision: completed.data.revision,
    });
    expect(denied.error?.message).toBe('invalid_transition');
    expect(
      localOwnerSql(`select revision from public.events where id='${f.eventId}'`)[0].revision
    ).toBe(completed.data.revision);
  } finally {
    await f.dispose();
  }
}, 30000);

it('dispatches the final reserved unit when available capacity is zero', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    localOwnerSql(`do $$ declare sid uuid; cid uuid; begin
      for i in 1..9 loop
        sid:=gen_random_uuid(); cid:=gen_random_uuid();
        insert into public.guest_sessions(id,event_id,run_id,accounting_version,state,closed_at)
          values(sid,'${f.eventId}','${f.runId}',2,'Printed',clock_timestamp());
        insert into public.captures(id,event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id)
          values(cid,'${f.eventId}','${f.runId}',sid,2,clock_timestamp(),gen_random_uuid());
        insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id)
          values('${f.eventId}','${f.runId}',sid,cid,2,'Guest','Printed',gen_random_uuid(),gen_random_uuid());
      end loop;
    end $$`);
    ready(f.runId);
    const start = await f.booth('start_session', { expectedRevision: 2 });
    expect(start.error).toBeNull();
    const sessionId = start.data.receipt.result.sessionId;
    const captureId = randomUUID();
    const capture = await f.booth('record_capture', {
      sessionId,
      captureId,
      capturedAt: captureTime(),
    });
    expect(capture.error).toBeNull();
    ready(f.runId);
    const hold = await f.booth('reserve', {
      sessionId,
      captureId,
      expectedRevision: capture.data.revision,
    });
    expect(hold.error).toBeNull();
    expect((await f.readBooth()).data.counts).toMatchObject({
      printed: 9,
      unresolved: 1,
      printsAvailable: 0,
    });
    ready(f.runId);
    const sent = await f.booth('dispatch', {
      attemptId: hold.data.receipt.result.attemptId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: hold.data.revision,
    });
    expect(sent.error).toBeNull();
    expect(sent.data.sendAllowed).toBe(true);
  } finally {
    await f.dispose();
  }
}, 30000);

it('denies dispatch when a competing Admin pause gets the guard first', async () => {
  const f = await createPackageFixture();
  try {
    const { attemptId } = await reserved(f);
    ready(f.runId);
    const revision = (await f.readBooth()).data.revision;
    const [paused, dispatch] = await raceBehindGuard(
      () =>
        directRpc(
          `select public.package_admin_operation('${f.adminUser.id}','${f.adminSessionId}','pause','${randomUUID()}','{"eventId":"${f.eventId}","runId":"${f.runId}","expectedRevision":${revision}}'::jsonb);`
        ),
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','dispatch','${randomUUID()}','{"attemptId":"${attemptId}","printerId":"fixture-printer","connectionGeneration":0,"expectedRevision":${revision}}'::jsonb);`
        )
    );
    expect(paused.error).toBeNull();
    expect(dispatch.error).not.toBeNull();
    expect(
      localOwnerSql(
        `select state,dispatch_id from public.print_attempts where id='${attemptId}'`
      )[0]
    ).toMatchObject({ state: 'NotPrinted', dispatch_id: null });
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 0, printsAvailable: 10 });
  } finally {
    await f.dispose();
  }
}, 30000);

it('preserves physical possibility when dispatch gets the guard before Admin pause', async () => {
  const f = await createPackageFixture();
  try {
    const { attemptId } = await reserved(f);
    ready(f.runId);
    const revision = (await f.readBooth()).data.revision;
    const [dispatch, stalePause] = await raceBehindGuard(
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','dispatch','${randomUUID()}','{"attemptId":"${attemptId}","printerId":"fixture-printer","connectionGeneration":0,"expectedRevision":${revision}}'::jsonb);`
        ),
      () =>
        directRpc(
          `select public.package_admin_operation('${f.adminUser.id}','${f.adminSessionId}','pause','${randomUUID()}','{"eventId":"${f.eventId}","runId":"${f.runId}","expectedRevision":${revision}}'::jsonb);`
        )
    );
    expect(dispatch.error).toBeNull();
    if (!dispatch.data) throw new Error('Dispatch response missing');
    expect(dispatch.data.sendAllowed).toBe(true);
    expect(stalePause.error?.message).toBe('stale_revision');
    const paused = await f.admin('pause', {
      runId: f.runId,
      expectedRevision: dispatch.data.revision,
    });
    expect(paused.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Dispatching');
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
  } finally {
    await f.dispose();
  }
}, 30000);

it('rejects a delayed reservation after session end wins the guard', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    ready(f.runId);
    const started = await f.booth('start_session', { expectedRevision: 2 });
    const sessionId = started.data.receipt.result.sessionId;
    const captureId = randomUUID();
    const captured = await f.booth('record_capture', {
      sessionId,
      captureId,
      capturedAt: captureTime(),
    });
    expect(captured.error).toBeNull();
    ready(f.runId);
    const reservationId = randomUUID();
    const [ended, delayed] = await raceBehindGuard(
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','end_session','${randomUUID()}','{"sessionId":"${sessionId}","reason":"reload"}'::jsonb);`
        ),
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','reserve','${reservationId}','{"sessionId":"${sessionId}","captureId":"${captureId}","expectedRevision":${captured.data.revision}}'::jsonb);`
        )
    );
    expect(ended.error).toBeNull();
    expect(delayed.error).not.toBeNull();
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.print_attempts where session_id='${sessionId}'`
      )[0].n
    ).toBe(0);
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 0, printsAvailable: 10 });
    const lookup = await f.local.service.rpc('package_booth_read', {
      p_grant_hash: f.grantHash,
      p_operation_id: reservationId,
    });
    expect(lookup.data.receipt).toBeNull();
  } finally {
    await f.dispose();
  }
}, 30000);

it('denies dispatch when a competing Finish gets the guard first', async () => {
  const f = await createPackageFixture();
  try {
    const { attemptId } = await reserved(f);
    ready(f.runId);
    const revision = (await f.readBooth()).data.revision;
    const [finished, dispatch] = await raceBehindGuard(
      () =>
        directRpc(
          `select public.package_admin_operation('${f.adminUser.id}','${f.adminSessionId}','finish','${randomUUID()}','{"eventId":"${f.eventId}","runId":"${f.runId}","expectedRevision":${revision}}'::jsonb);`
        ),
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','dispatch','${randomUUID()}','{"attemptId":"${attemptId}","printerId":"fixture-printer","connectionGeneration":0,"expectedRevision":${revision}}'::jsonb);`
        )
    );
    expect(finished.error).toBeNull();
    expect(dispatch.error).not.toBeNull();
    expect(
      localOwnerSql(
        `select state,dispatch_id from public.print_attempts where id='${attemptId}'`
      )[0]
    ).toMatchObject({ state: 'NotPrinted', dispatch_id: null });
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finished');
    expect((await f.readAdmin()).data.counts).toMatchObject({ unresolved: 0, printsAvailable: 10 });
  } finally {
    await f.dispose();
  }
}, 30000);

it('keeps Finish waiting for a possible print when dispatch wins the guard', async () => {
  const f = await createPackageFixture();
  try {
    const { attemptId } = await reserved(f);
    ready(f.runId);
    const revision = (await f.readBooth()).data.revision;
    const [dispatch, staleFinish] = await raceBehindGuard(
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','dispatch','${randomUUID()}','{"attemptId":"${attemptId}","printerId":"fixture-printer","connectionGeneration":0,"expectedRevision":${revision}}'::jsonb);`
        ),
      () =>
        directRpc(
          `select public.package_admin_operation('${f.adminUser.id}','${f.adminSessionId}','finish','${randomUUID()}','{"eventId":"${f.eventId}","runId":"${f.runId}","expectedRevision":${revision}}'::jsonb);`
        )
    );
    expect(dispatch.error).toBeNull();
    expect(dispatch.data?.sendAllowed).toBe(true);
    expect(staleFinish.error?.message).toBe('stale_revision');
    const finish = await f.admin('finish', {
      runId: f.runId,
      expectedRevision: dispatch.data?.revision,
    });
    expect(finish.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finishing');
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Dispatching');
    const beforeAdmission = (await f.readAdmin()).data.counts;
    expect(beforeAdmission).toMatchObject({ unresolved: 1, printsAvailable: 9 });
    const newSession = await f.booth('start_session', { expectedRevision: finish.data.revision });
    expect(newSession.error).not.toBeNull();
    expect(newSession.data).toBeNull();
    expect((await f.readAdmin()).data.counts).toEqual(beforeAdmission);
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).not.toBe('NotPrinted');
  } finally {
    await f.dispose();
  }
}, 30000);

it('denies dispatch after a competing session end closes the Capture', async () => {
  const f = await createPackageFixture();
  try {
    const { sessionId, attemptId } = await reserved(f);
    ready(f.runId);
    const revision = (await f.readBooth()).data.revision;
    const [ended, dispatch] = await raceBehindGuard(
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','end_session','${randomUUID()}','{"sessionId":"${sessionId}","reason":"reload"}'::jsonb);`
        ),
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','dispatch','${randomUUID()}','{"attemptId":"${attemptId}","printerId":"fixture-printer","connectionGeneration":0,"expectedRevision":${revision}}'::jsonb);`
        )
    );
    expect(ended.error).toBeNull();
    expect(dispatch.error).not.toBeNull();
    expect(
      localOwnerSql(
        `select state,dispatch_id from public.print_attempts where id='${attemptId}'`
      )[0]
    ).toMatchObject({ state: 'Reserved', dispatch_id: null });
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
  } finally {
    await f.dispose();
  }
}, 30000);

it('keeps session end from cancelling a competing committed dispatch', async () => {
  const f = await createPackageFixture();
  try {
    const { sessionId, attemptId } = await reserved(f);
    ready(f.runId);
    const revision = (await f.readBooth()).data.revision;
    const [dispatch, ended] = await raceBehindGuard(
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','dispatch','${randomUUID()}','{"attemptId":"${attemptId}","printerId":"fixture-printer","connectionGeneration":0,"expectedRevision":${revision}}'::jsonb);`
        ),
      () =>
        directRpc(
          `select public.package_booth_operation('${f.grantHash}','end_session','${randomUUID()}','{"sessionId":"${sessionId}","reason":"reload"}'::jsonb);`
        )
    );
    expect(dispatch.error).toBeNull();
    expect(dispatch.data?.sendAllowed).toBe(true);
    expect(ended.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Dispatching');
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
  } finally {
    await f.dispose();
  }
}, 30000);

function legacyEvent(f: Awaited<ReturnType<typeof createPackageFixture>>, id: string) {
  localOwnerSql(
    `insert into public.events(id,accounting_version,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance) select '${id}',1,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,1,10 from public.events where id='${f.eventId}'`
  );
  localOwnerSql(
    `insert into public.film_stock_entries(event_id,kind,signed_sheets,actor_scope) values('${id}','Addition',10,'fixture')`
  );
  localOwnerSql(
    'update public.film_stock_balance set on_hand=(select sum(signed_sheets) from public.film_stock_entries)'
  );
  return id;
}
function cleanupLegacy(id: string) {
  cleanupEvents([id]);
  localOwnerSql(
    'update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries)'
  );
}

it('rejects legacy Test while a v2 run is Paused', async () => {
  const f = await createPackageFixture();
  const id = randomUUID();
  try {
    legacyEvent(f, id);
    f.seedRun('Paused');
    const result = await f.local.service.rpc('reserve_test_attempt', {
      admin_user_id: f.adminUser.id,
      admin_session_id: f.adminSessionId,
      event_id: id,
      connection_id: randomUUID(),
      operation_key: randomUUID(),
    });
    expect(result.error?.message).toBe('state_conflict');
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.print_attempts where event_id='${id}'`
      )[0].n
    ).toBe(0);
  } finally {
    try {
      cleanupLegacy(id);
    } finally {
      await f.dispose();
    }
  }
}, 30000);

it.each([true, false])(
  'serializes legacy Test and v2 start with Test first=%s',
  async (testFirst) => {
    const f = await createPackageFixture();
    const id = randomUUID();
    try {
      legacyEvent(f, id);
      const setup = await f.reportSetup();
      expect(setup.error).toBeNull();
      const payload = {
        eventId: f.eventId,
        expectedRevision: 1,
        readinessWindowId: setup.data.readinessWindowId,
        deviceHash: f.deviceHash,
        printerId: 'fixture-printer',
        connectionGeneration: 0,
      };
      const test = () =>
        directRpc(
          `select public.reserve_test_attempt('${f.adminUser.id}','${f.adminSessionId}','${id}','${randomUUID()}','${randomUUID()}');`
        );
      const start = () =>
        directRpc(
          `select public.package_admin_operation('${f.adminUser.id}','${f.adminSessionId}','start','${randomUUID()}','${JSON.stringify(payload)}'::jsonb);`
        );
      const [first, second] = await raceBehindGuard(
        testFirst ? test : start,
        testFirst ? start : test
      );
      expect(first.error).toBeNull();
      expect(second.error?.message).toBe(testFirst ? 'invalid_transition' : 'state_conflict');
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.booth_runs where event_id='${f.eventId}'`
        )[0].n
      ).toBe(testFirst ? 0 : 1);
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.print_attempts where event_id='${id}'`
        )[0].n
      ).toBe(testFirst ? 1 : 0);
    } finally {
      try {
        cleanupLegacy(id);
      } finally {
        await f.dispose();
      }
    }
  },
  30000
);
