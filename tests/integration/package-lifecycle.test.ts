import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPackageFixture, type PackageFixture } from '../fixtures/package-contract';
import { localOwnerSql, ownerInsert } from '../fixtures/local-supabase';

async function withGuardHeld<T>(work: () => Promise<T>, duringHold?: () => void) {
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
  await new Promise((resolve) => setTimeout(resolve, 750));
  duringHold?.();
  await new Promise((resolve) => setTimeout(resolve, 750));
  child.stdin.write('commit;\n\\q\n');
  const result = await pending;
  await done;
  return result;
}

async function withEventHeld<T>(
  eventId: string,
  work: () => Promise<T>,
  duringHold: () => void
): Promise<T> {
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
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stdin.write(
    `begin;\nselect id from public.events where id='${eventId}' for update;\nselect 'HOLDER:'||pg_backend_pid();\n`
  );
  let pending: Promise<T> | undefined;
  try {
    const deadline = Date.now() + 10000;
    while (!/HOLDER:\d+\r?\n/.test(output)) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error('Event holder did not acquire lock');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const holder = Number(output.match(/HOLDER:(\d+)/)?.[1]);
    expect(Number.isInteger(holder)).toBe(true);
    pending = work();
    // Observe the actual blocker; elapsed time cannot prove the operation reached the Event lock.
    while (
      !localOwnerSql(
        `select exists(select 1 from pg_stat_activity where ${holder}=any(pg_blocking_pids(pid))) waiting`
      )[0].waiting
    ) {
      if (Date.now() > deadline) throw new Error('Operation did not wait on the Event holder');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    duringHold();
  } finally {
    child.stdin.end('rollback;\n\\q\n');
    await done;
    // Settle the operation before its caller removes fixtures, including barrier failures.
    if (pending) await pending;
  }
  return pending!;
}

const packageOperations = ['add_packages', 'request_reload', 'confirm_reload'] as const;

function packageSnapshot(f: PackageFixture) {
  return {
    event: localOwnerSql(
      `select state,revision,film_package_count from public.events where id='${f.eventId}'`
    )[0],
    counts: localOwnerSql(`select private.package_counts('${f.eventId}') counts`)[0].counts,
    run: localOwnerSql(
      `select state,film_loaded_confirmed,power_confirmed,guided_access_confirmed,printer_id,connection_generation from public.booth_runs where id='${f.runId}'`
    )[0],
    packages: localOwnerSql(
      `select * from public.additional_film_package_entries where event_id='${f.eventId}' order by id`
    ),
    reloads: localOwnerSql(
      `select * from public.booth_reload_requests where event_id='${f.eventId}' order by id`
    ),
    receipts: localOwnerSql(
      `select id from public.operation_receipts where event_id='${f.eventId}' order by id`
    ),
    activities: localOwnerSql(
      `select id from public.activity_events where event_id='${f.eventId}' order by id`
    ),
  };
}

async function preparePackageOperation(f: PackageFixture, operation: string) {
  f.seedRun('Paused');
  if (operation === 'add_packages') return { packages: 1, clientRequestNote: 'Client request' };
  const request = {
    runId: f.runId,
    printerId: 'fixture-printer',
    connectionGeneration: 0,
    expectedRevision: 2,
    reason: 'Physical reload requested',
  };
  if (operation === 'request_reload') return request;
  const asked = await f.admin('request_reload', request, randomUUID());
  expect(asked.error).toBeNull();
  return {
    reloadRequestId: asked.data.receipt.result.reloadRequestId,
    printerId: request.printerId,
    connectionGeneration: request.connectionGeneration,
    expectedRevision: asked.data.revision,
  };
}

it.each(
  packageOperations.flatMap((operation) =>
    ['revoked', 'expired'].flatMap((loss) =>
      ['fresh', 'replay'].map((request) => ({ operation, loss, request }))
    )
  )
)(
  'rejects $request $operation when authority is $loss during the Event lock wait',
  async ({ operation, loss, request }) => {
    const f = await createPackageFixture();
    try {
      const payload = await preparePackageOperation(f, operation);
      const key = randomUUID();
      if (request === 'replay') {
        expect((await f.admin(operation, payload, key)).error).toBeNull();
      }
      const before = packageSnapshot(f);
      const result = await withEventHeld(
        f.eventId,
        () => Promise.resolve(f.admin(operation, payload, key)),
        () =>
          localOwnerSql(
            loss === 'revoked'
              ? `delete from auth.sessions where id='${f.adminSessionId}'`
              : `update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${f.adminSessionId}'`
          )
      );
      const after = packageSnapshot(f);
      expect(result.error?.message).toBe('access_required');
      expect(result.data).toBeNull();
      expect(after).toEqual(before);
    } finally {
      await f.dispose();
    }
  },
  30000
);

it.each(packageOperations)(
  'allows still-authorized %s after the Event lock wait without changing unrelated state',
  async (operation) => {
    const f = await createPackageFixture();
    try {
      const payload = await preparePackageOperation(f, operation);
      const key = randomUUID();
      const before = packageSnapshot(f);
      const result = await withEventHeld(
        f.eventId,
        () => Promise.resolve(f.admin(operation, payload, key)),
        () => {}
      );
      expect(result.error).toBeNull();
      const after = packageSnapshot(f);
      expect(after.event).toEqual({ ...before.event, revision: Number(before.event.revision) + 1 });
      expect(result.data.revision).toBe(after.event.revision);
      expect(after.receipts).toHaveLength(before.receipts.length + 1);
      expect(after.activities).toHaveLength(before.activities.length + 1);
      expect(after.receipts).toEqual(expect.arrayContaining(before.receipts));
      expect(after.activities).toEqual(expect.arrayContaining(before.activities));
      expect(after.run).toEqual({
        ...before.run,
        film_loaded_confirmed: operation === 'request_reload' ? false : true,
      });
      if (operation === 'add_packages') {
        expect(before.counts).toMatchObject({ totalBookedPrints: 10 });
        expect(after.counts).toEqual({
          ...(before.counts as object),
          additionalPackages: 1,
          totalBookedPrints: 20,
          printsRemaining: 20,
          printsAvailable: 20,
        });
        expect(after.packages).toHaveLength(1);
        expect(after.packages[0]).toMatchObject({
          packages: 1,
          client_request_note: 'Client request',
        });
        expect(after.reloads).toEqual(before.reloads);
      } else {
        expect(after.counts).toEqual(before.counts);
        expect(after.packages).toEqual(before.packages);
        expect(after.reloads).toHaveLength(1);
        const reloadRequestId = result.data.receipt.result.reloadRequestId;
        expect(after.reloads[0]).toMatchObject({
          id: reloadRequestId,
          state: operation === 'request_reload' ? 'Open' : 'Confirmed',
          run_id: f.runId,
          printer_id: 'fixture-printer',
          connection_generation: 0,
        });
        if (operation === 'confirm_reload') expect(reloadRequestId).toBe(before.reloads[0].id);
        // Reload receipt replay and changed-payload conflicts must also precede revision checks.
        const replay = await f.admin(operation, payload, key);
        expect(replay.error).toBeNull();
        expect(replay.data).toMatchObject({ receipt: result.data.receipt, replayed: true });
        expect(
          (await f.admin(operation, { ...payload, connectionGeneration: 1 }, key)).error?.message
        ).toBe('operation_conflict');
        expect(packageSnapshot(f)).toEqual(after);
      }
    } finally {
      await f.dispose();
    }
  },
  30000
);

it.each([
  ['cancel', 'revoked'],
  ['cancel', 'expired'],
  ['begin_delete_draft', 'revoked'],
  ['begin_delete_draft', 'expired'],
])(
  'rejects lost authority while waiting for the Event lock: %s / %s',
  async (operation, loss) => {
    const f = await createPackageFixture();
    try {
      const original = localOwnerSql(
        `select state,revision,deleted_at,client_name,client_email,client_phone,venue_address from public.events where id='${f.eventId}'`
      )[0];
      const result = await withEventHeld(
        f.eventId,
        () => Promise.resolve(f.admin(operation, { expectedRevision: original.revision })),
        () =>
          localOwnerSql(
            loss === 'revoked'
              ? `delete from auth.sessions where id='${f.adminSessionId}'`
              : `update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${f.adminSessionId}'`
          )
      );
      expect(result.error?.message).toBe('access_required');
      const event = localOwnerSql(
        `select state,revision,deleted_at,client_name,client_email,client_phone,venue_address from public.events where id='${f.eventId}'`
      )[0];
      expect(event).toMatchObject({
        state: 'Draft',
        revision: original.revision,
        deleted_at: null,
      });
      expect(event).toEqual(original);
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.operation_receipts where event_id='${f.eventId}'`
        )[0].n
      ).toBe(0);
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.activity_events where event_id='${f.eventId}'`
        )[0].n
      ).toBe(0);
    } finally {
      await f.dispose();
    }
  },
  30000
);

it.each(['cancel', 'begin_delete_draft'])(
  'allows still-authorized %s after the Event lock wait',
  async (operation) => {
    const f = await createPackageFixture();
    try {
      const result = await withEventHeld(
        f.eventId,
        () => Promise.resolve(f.admin(operation, { expectedRevision: 1 })),
        () => {}
      );
      expect(result.error).toBeNull();
      expect(result.data.revision).toBe(2);
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.operation_receipts where event_id='${f.eventId}'`
        )[0].n
      ).toBe(1);
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.activity_events where event_id='${f.eventId}'`
        )[0].n
      ).toBe(1);
    } finally {
      await f.dispose();
    }
  },
  30000
);

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

it('resumes a ready Paused run but refuses to resume while a print is Pending', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    const pause = await f.admin('pause', { runId: f.runId, expectedRevision: 2 });
    expect(pause.error).toBeNull();
    const fresh = () =>
      localOwnerSql(
        `update public.booth_runs set readiness_observation='{"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
      );
    fresh();
    const resume = await f.admin('resume', {
      runId: f.runId,
      expectedRevision: pause.data.revision,
    });
    expect(resume.error).toBeNull();
    expect(resume.data.receipt.result.state).toBe('Active');
    const sessionId = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${f.eventId}','${f.runId}',2) returning id`
    )[0].id;
    const captureId = localOwnerSql(
      `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${f.eventId}','${f.runId}','${sessionId}',2,clock_timestamp(),'${randomUUID()}') returning id`
    )[0].id;
    localOwnerSql(
      `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${f.eventId}','${f.runId}','${sessionId}','${captureId}',2,'Guest','Pending','${randomUUID()}','${randomUUID()}')`
    );
    const secondPause = await f.admin('pause', {
      runId: f.runId,
      expectedRevision: resume.data.revision,
    });
    expect(secondPause.error).toBeNull();
    fresh();
    expect(
      (await f.admin('resume', { runId: f.runId, expectedRevision: secondPause.data.revision }))
        .error?.message
    ).toBe('not_ready');
  } finally {
    await f.dispose();
  }
}, 30000);

it('audits Finish exactly once and does not audit its receipt replay', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    const key = randomUUID();
    const body = { runId: f.runId, expectedRevision: 2 };
    const finish = await f.admin('finish', body, key);
    expect(finish.error).toBeNull();
    const replay = await f.admin('finish', body, key);
    expect(replay.error).toBeNull();
    expect(replay.data.replayed).toBe(true);
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.activity_events where event_id='${f.eventId}' and operation_kind='finish'`
      )[0].n
    ).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);

it('rejects an Admin receipt replay when its session is revoked during the guard wait', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    const key = randomUUID();
    const body = { runId: f.runId, expectedRevision: 2 };
    expect((await f.admin('pause', body, key)).error).toBeNull();
    const replay = await withGuardHeld(
      () => Promise.resolve(f.admin('pause', body, key)),
      () => localOwnerSql(`delete from auth.sessions where id='${f.adminSessionId}'`)
    );
    expect(replay.error?.message).toBe('access_required');
  } finally {
    await f.dispose();
  }
}, 30000);

it('rejects a deleted Draft receipt read when its Admin session expires during the guard wait', async () => {
  const f = await createPackageFixture();
  try {
    const begun = await f.admin('begin_delete_draft', { expectedRevision: 1 });
    expect(begun.error).toBeNull();
    localOwnerSql(
      `update auth.sessions set not_after=clock_timestamp()+interval '1 second' where id='${f.adminSessionId}'`
    );
    const read = await withGuardHeld(() =>
      Promise.resolve(f.readAdmin(begun.data.receipt.operationId))
    );
    expect(read.error?.message).toBe('access_required');
  } finally {
    await f.dispose();
  }
}, 30000);

it('keeps Draft deletion pending for an earlier media authorization without claiming backend cleanup', async () => {
  const f = await createPackageFixture();
  try {
    // Synthetic pre-hold authorization only: no transfer or backend cleanup probe.
    const assetId = randomUUID();
    ownerInsert('event_media_assets', {
      id: assetId,
      event_id: f.eventId,
      kind: 'background',
      path: `${f.eventId}/${assetId}`,
      uploaded_by: f.adminUser.id,
    });
    const begun = await f.admin('begin_delete_draft', { expectedRevision: 1 });
    expect(begun.error).toBeNull();
    const receipt = await f.readAdmin(begun.data.receipt.operationId);
    expect(receipt.error).toBeNull();
    expect(receipt.data.receipt.kind).toBe('begin_delete_draft');
    expect(
      localOwnerSql(`select media_removal_state from public.events where id='${f.eventId}'`)[0]
        .media_removal_state
    ).toBe('pending');
    expect(
      (await f.admin('complete_delete_draft', { expectedRevision: begun.data.revision })).error
        ?.message
    ).toBe('not_ready');
    expect(
      localOwnerSql(`select state from public.event_media_assets where id='${assetId}'`)[0].state
    ).toBe('cleanup_pending');
    expect(
      localOwnerSql(
        `select deleted_at is not null as deleted,client_name from public.events where id='${f.eventId}'`
      )[0]
    ).toEqual({ deleted: true, client_name: null });
    expect(
      (
        await f.admin('start', {
          expectedRevision: begun.data.revision,
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

it.each(['complete', 'cancel'])(
  'retains the terminal %s record only after every run and attempt settles',
  async (action) => {
    const f = await createPackageFixture();
    try {
      f.seedRun('Paused');
      expect((await f.admin(action, { expectedRevision: 2 })).error?.message).toBe('print_pending');
      const sessionId = localOwnerSql(
        `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${f.eventId}','${f.runId}',2) returning id`
      )[0].id;
      const captureId = localOwnerSql(
        `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${f.eventId}','${f.runId}','${sessionId}',2,clock_timestamp(),gen_random_uuid()) returning id`
      )[0].id;
      const attemptId = localOwnerSql(
        `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${f.eventId}','${f.runId}','${sessionId}','${captureId}',2,'Guest','Pending',gen_random_uuid(),gen_random_uuid()) returning id`
      )[0].id;
      const finish = await f.admin('finish', { runId: f.runId, expectedRevision: 2 });
      expect(finish.data.receipt.result.state).toBe('Finishing');
      expect(
        (await f.admin(action, { expectedRevision: finish.data.revision })).error?.message
      ).toBe('print_pending');
      localOwnerSql(
        `update public.print_attempts set state='Printed',resolved_at=clock_timestamp() where id='${attemptId}'`
      );
      localOwnerSql(`select private.package_finish_if_clear('${f.eventId}','${f.runId}')`);
      const current = await f.readAdmin();
      const terminal = await f.admin(action, { expectedRevision: current.data.revision });
      expect(terminal.error).toBeNull();
      expect(
        localOwnerSql(
          `select state,client_name,deleted_at from public.events where id='${f.eventId}'`
        )[0]
      ).toEqual({
        state: action === 'complete' ? 'Completed' : 'Cancelled',
        client_name: 'Client',
        deleted_at: null,
      });
      expect(
        localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
      ).toBe('Printed');
      expect((await f.readAdmin()).data.counts).toMatchObject({
        printed: 1,
        unresolved: 0,
        printsAvailable: 9,
      });
      expect(
        localOwnerSql(`select count(*)::integer n from public.captures where id='${captureId}'`)[0]
          .n
      ).toBe(1);
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.activity_events where event_id='${f.eventId}' and operation_kind='${action}'`
        )[0].n
      ).toBe(1);
    } finally {
      await f.dispose();
    }
  },
  30000
);
