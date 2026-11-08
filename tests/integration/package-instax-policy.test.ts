import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPackageFixture, type PackageFixture } from '../fixtures/package-contract';
import { localOwnerSql, ownerUpdate } from '../fixtures/local-supabase';

const evidence = {
  adapterVersion: 'instax-mini-link3-v1',
  evidenceVersion: 'instax-fi033-0102-dev-v1',
  modelNumber: 'FI033',
  firmwareRevision: '0102',
} as const;
let priorPolicy: string | undefined;
beforeAll(() => {
  priorPolicy = String(
    localOwnerSql('select mode from public.printer_completion_policy where id')[0].mode
  );
  localOwnerSql("update public.printer_completion_policy set mode='instax-development' where id");
});
afterAll(() => {
  if (priorPolicy)
    localOwnerSql(`update public.printer_completion_policy set mode='${priorPolicy}' where id`);
});
function fresh(f: PackageFixture) {
  ownerUpdate('booth_runs', f.runId, {
    readiness_observation: {
      cameraPermission: true,
      cameraLive: true,
      serverReachable: true,
      printerConnected: true,
      printerReady: true,
      oldJobCleared: true,
      connectionGeneration: 0,
      printerEvidence: evidence,
      printerMode: 'instax-development',
    },
    observed_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
  });
}
async function dispatched(f: PackageFixture) {
  f.seedRun('Active', 'instax-fi033-0102-dev-v1');
  fresh(f);
  const started = await f.booth('start_session', {
    expectedRevision: 2,
    printerMode: 'instax-development',
  });
  expect(started.error).toBeNull();
  const sessionId = started.data.receipt.result.sessionId;
  const captureId = randomUUID();
  expect(
    (
      await f.booth('record_capture', {
        sessionId,
        captureId,
        capturedAt: new Date().toISOString(),
      })
    ).error
  ).toBeNull();
  fresh(f);
  const reserved = await f.booth('reserve', {
    sessionId,
    captureId,
    printerMode: 'instax-development',
    expectedRevision: (await f.readBooth()).data.revision,
  });
  expect(reserved.error).toBeNull();
  fresh(f);
  const sent = await f.booth('dispatch', {
    attemptId: reserved.data.receipt.result.attemptId,
    printerId: 'fixture-printer',
    connectionGeneration: 0,
    printerMode: 'instax-development',
    expectedRevision: reserved.data.revision,
  });
  expect(sent.error).toBeNull();
  return sent.data.authorization as {
    attemptId: string;
    dispatchId: string;
    printerId: string;
    connectionGeneration: number;
  };
}
function report(
  f: PackageFixture,
  a: Awaited<ReturnType<typeof dispatched>>,
  kind: string,
  changes = {},
  id = randomUUID()
) {
  return f.booth(
    'observe',
    {
      ...a,
      kind,
      observationId: id,
      adapterVersion: evidence.adapterVersion,
      evidenceVersion: evidence.evidenceVersion,
      metadata: {},
      ...changes,
    },
    id
  );
}
it('physical policy rejects simulator or mismatched dispatch evidence', async () => {
  const f = await createPackageFixture();
  try {
    const a = await dispatched(f);
    for (const changes of [
      { printerId: 'other' },
      { dispatchId: randomUUID() },
      { connectionGeneration: 1 },
      { adapterVersion: 'simulator-v2' },
      { evidenceVersion: 'simulator-v1' },
      { dispatchId: null },
    ]) {
      expect((await report(f, a, 'full_ejection_confirmed', changes)).error).not.toBeNull();
    }
    expect((await report(f, a, 'no_film_rejected')).error).not.toBeNull();
    const before = (await f.readBooth()).data;
    const id = randomUUID();
    expect((await report(f, a, 'full_ejection_confirmed', {}, id)).error).toBeNull();
    const afterFirst = (await f.readBooth()).data;
    expect(afterFirst.counts.printed).toBe(before.counts.printed + 1);
    expect((await report(f, a, 'full_ejection_confirmed', {}, id)).data.replayed).toBe(true);
    expect((await f.readBooth()).data.counts.printed).toBe(afterFirst.counts.printed);
    expect((await report(f, a, 'definitely_not_sent')).error).toBeNull();
    expect((await f.readBooth()).data.blockers).toContain('evidence_discrepancy');
    expect((await f.readBooth()).data.counts.printed).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);
it('run evidence policy cannot change mid-run', async () => {
  const f = await createPackageFixture();
  try {
    await dispatched(f);
    expect(() =>
      ownerUpdate('booth_runs', f.runId, { evidence_policy_version: 'simulator-v1' })
    ).toThrow();
    const denied = await f.local.client().rpc('package_booth_operation', {
      p_grant_hash: f.grantHash,
      p_operation: 'observe',
      p_operation_id: randomUUID(),
      p_payload: {},
    });
    expect(denied.error).not.toBeNull();
  } finally {
    await f.dispose();
  }
}, 30000);
it('only matching uninterrupted normal completion can establish normal job readiness', async () => {
  for (const interrupted of [false, true]) {
    const f = await createPackageFixture();
    try {
      const a = await dispatched(f);
      expect((await report(f, a, 'ready_for_new_job')).error).not.toBeNull();
      if (interrupted) expect((await report(f, a, 'outcome_unknown')).error).toBeNull();
      expect((await report(f, a, 'full_ejection_confirmed')).error).toBeNull();
      const ready = await report(f, a, 'ready_for_new_job');
      if (interrupted) expect(ready.error).not.toBeNull();
      else expect(ready.error).toBeNull();
      expect(
        localOwnerSql(
          `select old_job_safety_confirmed safe from public.booth_runs where id='${f.runId}'`
        )[0].safe
      ).toBe(!interrupted);
    } finally {
      await f.dispose();
    }
  }
}, 30000);
it('mode change permits settlement but no new dispatch', async () => {
  const f = await createPackageFixture();
  try {
    const a = await dispatched(f);
    localOwnerSql("update public.printer_completion_policy set mode='disabled' where id");
    expect(
      (
        await f.booth('dispatch', {
          attemptId: a.attemptId,
          printerId: a.printerId,
          connectionGeneration: 0,
          expectedRevision: (await f.readBooth()).data.revision,
          printerMode: 'instax-development',
        })
      ).error?.message
    ).toBe('qualification_required');
    expect((await report(f, a, 'full_ejection_confirmed')).error).toBeNull();
    expect((await report(f, a, 'ready_for_new_job')).error).toBeNull();
    expect(
      (
        await f.booth('start_session', {
          expectedRevision: (await f.readBooth()).data.revision,
          printerMode: 'disabled',
        })
      ).error?.message
    ).toBe('qualification_required');
  } finally {
    localOwnerSql("update public.printer_completion_policy set mode='instax-development' where id");
    await f.dispose();
  }
}, 30000);
it('proven pre-write non-send preserves existing safety', async () => {
  for (const safe of [false, true]) {
    const f = await createPackageFixture();
    try {
      const a = await dispatched(f);
      ownerUpdate('booth_runs', f.runId, { old_job_safety_confirmed: safe });
      expect((await report(f, a, 'definitely_not_sent')).error).toBeNull();
      expect((await f.readBooth()).data.counts).toMatchObject({ printed: 0, unresolved: 0 });
      expect(
        localOwnerSql(
          `select old_job_safety_confirmed safe from public.booth_runs where id='${f.runId}'`
        )[0].safe
      ).toBe(safe);
    } finally {
      await f.dispose();
    }
  }
}, 30000);
it('unsafe physical Finish cannot be bypassed by a new Event/run', async () => {
  const f = await createPackageFixture();
  const next = await createPackageFixture();
  try {
    const a = await dispatched(f);
    expect((await report(f, a, 'outcome_unknown')).error).toBeNull();
    expect(
      (
        await f.admin('resolve_attempt', {
          attemptId: a.attemptId,
          outcome: 'not_printed',
          inspectionReason: 'Unqualified clearance',
          oldJobCleared: true,
          expectedRevision: (await f.readAdmin()).data.revision,
        })
      ).error
    ).not.toBeNull();
    expect(
      (
        await f.admin('resolve_attempt', {
          attemptId: a.attemptId,
          outcome: 'printed',
          inspectionReason: 'Sheet inspected',
          oldJobCleared: true,
          expectedRevision: (await f.readAdmin()).data.revision,
        })
      ).error
    ).toBeNull();
    expect(
      (
        await f.admin('finish', {
          runId: f.runId,
          expectedRevision: (await f.readAdmin()).data.revision,
        })
      ).error
    ).toBeNull();
    const unsafeRun = localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0];
    expect(unsafeRun.state).toBe('Finishing');
    expect((await report(f, a, 'ready_for_new_job')).error).not.toBeNull();
    // Owner fixture simulates a stale historic Finished row; its unsafe job must still block Start.
    ownerUpdate('booth_runs', f.runId, { state: 'Finished' });
    ownerUpdate('events', f.eventId, { state: 'Completed' });
    const setup = await next.reportSetup(evidence, 'instax-development');
    expect(setup.error).toBeNull();
    const start = await next.admin('start', {
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: next.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      printerMode: 'instax-development',
      expectedRevision: (await next.readAdmin()).data.revision,
    });
    expect(start.error?.message).toBe('print_pending');
  } finally {
    await next.dispose();
    await f.dispose();
  }
}, 30000);
it('committed receipt survives reconnect without accepting a fresh stale report', async () => {
  const f = await createPackageFixture();
  try {
    const a = await dispatched(f);
    const id = randomUUID();
    expect((await report(f, a, 'command_accepted', {}, id)).error).toBeNull();
    ownerUpdate('booth_runs', f.runId, { connection_generation: 1 });
    expect((await report(f, a, 'command_accepted', {}, id)).data.replayed).toBe(true);
    expect((await report(f, a, 'full_ejection_confirmed')).error).not.toBeNull();
  } finally {
    await f.dispose();
  }
}, 30000);

it('setup rejects unsupported physical model, firmware and mixed adapter evidence through privileged RPC', async () => {
  const f = await createPackageFixture();
  try {
    for (const change of [
      { modelNumber: 'FI032' },
      { firmwareRevision: '0103' },
      { adapterVersion: 'simulator-v2' },
      { evidenceVersion: 'simulator-v1' },
    ]) {
      const read = await f.readSetup();
      expect(read.error).toBeNull();
      const result = await f.admin('report_setup_readiness', {
        readinessWindowId: read.data.readinessWindowId,
        deviceHash: f.deviceHash,
        printerId: 'fixture-printer',
        connectionGeneration: 0,
        observedAgeMs: 0,
        printerMode: 'instax-development',
        printerEvidence: { ...evidence, ...change },
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
      });
      expect(result.error).not.toBeNull();
    }
  } finally {
    await f.dispose();
  }
}, 30000);
it('physical Finish retains the reporting grant through the final valid ready report', async () => {
  const f = await createPackageFixture();
  try {
    const a = await dispatched(f);
    expect(
      (
        await f.admin('finish', {
          runId: f.runId,
          expectedRevision: (await f.readAdmin()).data.revision,
        })
      ).error
    ).toBeNull();
    expect((await report(f, a, 'full_ejection_confirmed')).error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finishing');
    expect(
      localOwnerSql(`select state from public.booth_grants where id='${f.grantId}'`)[0].state
    ).toBe('Active');
    expect((await report(f, a, 'ready_for_new_job')).error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finished');
    expect(
      localOwnerSql(`select state from public.booth_grants where id='${f.grantId}'`)[0].state
    ).toBe('Revoked');
    expect((await f.readAdmin()).data.counts.printed).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);

it.each(['outcome_unknown', 'readiness_fault'] as const)(
  'physical %s before acceptance prevents later non-send from releasing the hold',
  async (interruption) => {
    const f = await createPackageFixture();
    try {
      const a = await dispatched(f);
      if (interruption === 'outcome_unknown') {
        expect((await report(f, a, 'outcome_unknown')).error).toBeNull();
      } else {
        const state = await f.readBooth();
        expect(state.error).toBeNull();
        const fault = await f.booth('report_readiness', {
          readinessWindowId: state.data.readinessWindowId,
          observedAgeMs: 0,
          printerId: a.printerId,
          connectionGeneration: a.connectionGeneration,
          printerMode: 'instax-development',
          printerEvidence: evidence,
          observation: {
            cameraPermission: true,
            cameraLive: true,
            serverReachable: true,
            printerConnected: true,
            printerReady: false,
            oldJobCleared: false,
            loadFault: 'cover_open',
            loadFaultId: randomUUID(),
          },
        });
        expect(fault.error).toBeNull();
      }
      expect(
        localOwnerSql(`select accepted_at from public.print_attempts where id='${a.attemptId}'`)[0]
          .accepted_at
      ).toBeNull();
      const id = randomUUID();
      const contradicted = await report(f, a, 'definitely_not_sent', {}, id);
      expect(contradicted.error).toBeNull();
      expect(contradicted.data.receipt.result).toMatchObject({
        state: 'Pending',
        discrepancy: true,
      });
      expect((await f.readBooth()).data.counts).toMatchObject({
        printed: 0,
        unresolved: 1,
        printsAvailable: 9,
      });
      expect((await f.readBooth()).data.blockers).toContain('evidence_discrepancy');
      expect(
        localOwnerSql(
          `select old_job_safety_confirmed safe from public.booth_runs where id='${f.runId}'`
        )[0].safe
      ).toBe(false);
      expect((await report(f, a, 'definitely_not_sent', {}, id)).data.replayed).toBe(true);
      expect((await f.readBooth()).data.counts.unresolved).toBe(1);
    } finally {
      await f.dispose();
    }
  },
  30000
);

it('conflicting terminal physical inspection preserves Printed accounting and blocks Finish and later Start', async () => {
  const f = await createPackageFixture();
  const next = await createPackageFixture();
  try {
    const a = await dispatched(f);
    expect((await report(f, a, 'full_ejection_confirmed')).error).toBeNull();
    expect((await report(f, a, 'ready_for_new_job')).error).toBeNull();
    expect(
      localOwnerSql(
        `select old_job_safety_confirmed safe from public.booth_runs where id='${f.runId}'`
      )[0].safe
    ).toBe(true);
    const conflict = await f.admin('resolve_attempt', {
      attemptId: a.attemptId,
      outcome: 'not_printed',
      inspectionReason: 'Inspection contradicts normal output',
      oldJobCleared: true,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(conflict.error).toBeNull();
    expect(conflict.data.receipt.result).toMatchObject({ state: 'Printed', discrepancy: true });
    expect((await f.readAdmin()).data.counts).toMatchObject({
      printed: 1,
      unresolved: 0,
      printsAvailable: 9,
    });
    expect(
      localOwnerSql(
        `select old_job_safety_confirmed safe from public.booth_runs where id='${f.runId}'`
      )[0].safe
    ).toBe(false);
    expect((await f.readBooth()).data.blockers).toContain('evidence_discrepancy');
    expect(
      (
        await f.admin('finish', {
          runId: f.runId,
          expectedRevision: (await f.readAdmin()).data.revision,
        })
      ).error
    ).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finishing');
    expect(
      (await f.admin('complete', { expectedRevision: (await f.readAdmin()).data.revision })).error
        ?.message
    ).toBe('print_pending');
    expect((await report(f, a, 'ready_for_new_job')).error).not.toBeNull();
    // A stale historical terminal row must not hide the persisted physical conflict.
    ownerUpdate('booth_runs', f.runId, { state: 'Finished' });
    ownerUpdate('events', f.eventId, { state: 'Completed' });
    const setup = await next.reportSetup(evidence, 'instax-development');
    expect(setup.error).toBeNull();
    const start = await next.admin('start', {
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: next.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      printerMode: 'instax-development',
      expectedRevision: (await next.readAdmin()).data.revision,
    });
    expect(start.error?.message).toBe('print_pending');
    expect((await f.readAdmin()).data.counts.printed).toBe(1);
  } finally {
    await next.dispose();
    await f.dispose();
  }
}, 30000);
