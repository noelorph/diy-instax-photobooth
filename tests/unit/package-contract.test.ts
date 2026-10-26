// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  packageCounts,
  packageErrorStatus,
  PackageError,
  runStates,
  attemptStates,
} from '@/lib/operations/package-contract';
import {
  addPackagesSchema,
  parsePackageOperation,
  packageActionSchemas,
} from '@/lib/operations/package-validation';
const id = '11111111-1111-4111-8111-111111111111';
const request = (body: unknown) =>
  new Request('https://booth.test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('package accounting contract', () => {
  it('counts the last held print without consuming it', () => {
    expect(packageCounts(5, 0, 49, 1)).toEqual({
      originalPackages: 5,
      additionalPackages: 0,
      totalBookedPrints: 50,
      printed: 49,
      unresolved: 1,
      printsRemaining: 1,
      printsAvailable: 0,
    });
    expect(packageCounts(0, 0, 0, 0).printsAvailable).toBe(0);
    expect(packageCounts(214_748_364, 0, 0, 0).totalBookedPrints).toBe(2_147_483_640);
  });
  it.each([
    [214_748_364, 1, 0, 0],
    [-1, 0, 0, 0],
    [0.5, 0, 0, 0],
    [1, 0, 11, 0],
    [1, 0, 0, 2],
    [1, 0, -1, 0],
    [1, 0, 0.5, 0],
    [NaN, 0, 0, 0],
    [Infinity, 0, 0, 0],
  ])('rejects impossible counts %j', (...counts) => {
    expect(() => packageCounts(...(counts as [number, number, number, number]))).toThrow(
      PackageError
    );
  });
  it('accepts only approved run and attempt states', () => {
    expect(runStates).toEqual(['Prepared', 'Active', 'Paused', 'Finishing', 'Finished']);
    expect(attemptStates).toEqual([
      'Reserved',
      'Dispatching',
      'Accepted',
      'Pending',
      'Printed',
      'NotPrinted',
    ]);
  });
  it('maps exactly the approved safe errors', () => {
    expect(packageErrorStatus).toEqual({
      invalid_input: 400,
      access_required: 401,
      operation_forbidden: 403,
      qualification_required: 403,
      stale_revision: 409,
      operation_conflict: 409,
      not_ready: 409,
      print_pending: 409,
      booked_prints_exhausted: 409,
      invalid_transition: 409,
      operation_unavailable: 503,
    });
  });
});
describe('strict package request boundaries', () => {
  it('requires positive package additions with a note', async () => {
    expect(
      await parsePackageOperation(
        request({ operationId: id, packages: 1, clientRequestNote: ' Client asked ' }),
        addPackagesSchema
      )
    ).toEqual({ operationId: id, packages: 1, clientRequestNote: 'Client asked' });
  });
  it.each([0, -1, 1.5, 214_748_365, Infinity])(
    'rejects invalid additional package count %s',
    (packages) => {
      expect(
        addPackagesSchema.safeParse({ operationId: id, packages, clientRequestNote: 'requested' })
          .success
      ).toBe(false);
    }
  );
  it.each(['', '   '])('requires a meaningful client request note', (clientRequestNote) => {
    expect(
      addPackagesSchema.safeParse({ operationId: id, packages: 1, clientRequestNote }).success
    ).toBe(false);
  });
  it.each([
    'prints',
    'adminUserId',
    'grantHash',
    'version',
    'photo',
    'base64',
    'rawPacket',
    'expectedRevision',
    'operationKey',
  ])('rejects extra %s', async (field) => {
    await expect(
      parsePackageOperation(
        request({ operationId: id, packages: 1, clientRequestNote: 'requested', [field]: 1 }),
        addPackagesSchema
      )
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
  it('retains semantic note changes for receipt fingerprints', () => {
    const first = addPackagesSchema.parse({
      operationId: id,
      packages: 1,
      clientRequestNote: 'First',
    });
    expect(addPackagesSchema.parse({ ...first, clientRequestNote: 'first' })).not.toEqual(first);
  });
  it('requires bounded revisions on revision guarded actions', () => {
    for (const schema of [
      packageActionSchemas.pause,
      packageActionSchemas.resume,
      packageActionSchemas.finish,
      packageActionSchemas.recoverAccess,
    ]) {
      expect(schema.safeParse({ operationId: id, runId: id, expectedRevision: 1 }).success).toBe(
        true
      );
      for (const expectedRevision of [0, 1.5, 2_147_483_648])
        expect(schema.safeParse({ operationId: id, runId: id, expectedRevision }).success).toBe(
          false
        );
    }
  });
  it('maps malformed and oversized JSON to invalid_input', async () => {
    for (const body of [
      '{',
      JSON.stringify({ operationId: id, packages: 1, clientRequestNote: 'x'.repeat(8200) }),
    ]) {
      await expect(
        parsePackageOperation(
          new Request('https://booth.test', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          }),
          addPackagesSchema
        )
      ).rejects.toMatchObject({ code: 'invalid_input' });
    }
  });
});

it('accepts opaque physical printer identities and initial generation zero', () => {
  for (const schema of [packageActionSchemas.dispatch, packageActionSchemas.confirmReload]) {
    const body = {
      operationId: id,
      expectedRevision: 1,
      printerId: 'Mini Link 3:device-01',
      connectionGeneration: 0,
      ...(schema === packageActionSchemas.confirmReload ? { reloadRequestId: id } : {}),
    };
    expect(schema.safeParse(body).success).toBe(true);
    for (const printerId of ['', ' ', 'x'.repeat(129)])
      expect(schema.safeParse({ ...body, printerId }).success).toBe(false);
    for (const connectionGeneration of [-1, 0.5, 2_147_483_648])
      expect(schema.safeParse({ ...body, connectionGeneration }).success).toBe(false);
  }
});
it('accepts each specified action shape and rejects authority or missing operation IDs', () => {
  const base = { operationId: id };
  const revision = { ...base, expectedRevision: 1 };
  const fixtures = {
    addPackages: { ...base, packages: 1, clientRequestNote: 'Requested' },
    confirmHandoff: { ...base, handoffId: id },
    recoverAccess: { ...revision, runId: id },
    pause: { ...revision, runId: id },
    resume: { ...revision, runId: id },
    finish: { ...revision, runId: id },
    complete: revision,
    cancel: revision,
    deleteDraft: revision,
    confirmReload: {
      ...revision,
      reloadRequestId: id,
      printerId: 'printer',
      connectionGeneration: 0,
    },
    recoverAttempt: { ...revision, reason: 'reload' },
    resolveAttempt: {
      ...revision,
      outcome: 'not_printed',
      inspectionReason: 'job cleared',
      oldJobCleared: true,
    },
    startSession: revision,
    recordCapture: { ...base, sessionId: id, captureId: id, capturedAt: '2026-10-21T00:00:00Z' },
    endSession: { ...base, reason: 'abandoned' },
    reserve: { ...revision, sessionId: id, captureId: id },
    dispatch: { ...revision, printerId: 'printer', connectionGeneration: 0 },
    reconcile: { ...base, reason: 'reload' },
    observe: {
      ...base,
      attemptId: id,
      observationId: id,
      kind: 'full_ejection_confirmed',
      evidenceVersion: 'simulator-v1',
      connectionGeneration: 0,
      metadata: {},
    },
  };
  for (const action of Object.keys(fixtures) as (keyof typeof fixtures)[]) {
    const schema = packageActionSchemas[action];
    expect(schema.safeParse(fixtures[action]).success, action).toBe(true);
    expect(schema.safeParse({ ...fixtures[action], operationId: undefined }).success, action).toBe(
      false
    );
    for (const key of ['adminUserId', 'grantHash', 'version', 'photo', 'printQuantity']) {
      expect(
        schema.safeParse({ ...fixtures[action], [key]: 'untrusted' }).success,
        `${action}:${key}`
      ).toBe(false);
    }
  }
});

it('accepts only bounded safe outcome observation fields', () => {
  const observation = {
    operationId: id,
    attemptId: id,
    observationId: id,
    kind: 'full_ejection_confirmed',
    evidenceVersion: 'simulator-v1',
    connectionGeneration: 0,
    metadata: {},
  };
  expect(packageActionSchemas.observe.safeParse(observation).success).toBe(true);
  for (const change of [
    { kind: 'raw_status' },
    { evidenceVersion: 'unknown' },
    { metadata: { rawStatus: 'abc' } },
    { connectionGeneration: -1 },
  ])
    expect(packageActionSchemas.observe.safeParse({ ...observation, ...change }).success).toBe(
      false
    );
});

it('validates readiness heartbeat, connection change and reload boundaries strictly', () => {
  const heartbeat = {
    operationId: id,
    readinessWindowId: id,
    observedAgeMs: 0,
    printerId: 'printer',
    connectionGeneration: 0,
    observation: {
      cameraPermission: true,
      cameraLive: true,
      serverReachable: true,
      printerConnected: true,
      printerReady: true,
      oldJobCleared: true,
    },
  };
  expect(packageActionSchemas.reportReadiness.safeParse(heartbeat).success).toBe(true);
  for (const extra of [
    { observedAt: '2099-01-01T00:00:00Z' },
    { filmLoadedConfirmed: true },
    { adminUserId: id },
    { observedAgeMs: -1 },
    { observedAgeMs: 5001 },
  ]) {
    expect(packageActionSchemas.reportReadiness.safeParse({ ...heartbeat, ...extra }).success).toBe(
      false
    );
  }
  const changed = {
    operationId: id,
    kind: 'connection_changed',
    readinessWindowId: id,
    printerId: 'printer',
    connectionGeneration: 1,
    expectedRevision: 1,
  };
  expect(packageActionSchemas.reportReadiness.safeParse(changed).success).toBe(true);
  expect(
    packageActionSchemas.reportReadiness.safeParse({ ...changed, observedAgeMs: 0 }).success
  ).toBe(false);
  expect(
    packageActionSchemas.reportSetupReadiness.safeParse({
      ...heartbeat,
      deviceHash: 'a'.repeat(64),
      filmLoadedConfirmed: true,
      powerConfirmed: true,
      guidedAccessConfirmed: true,
    }).success
  ).toBe(true);
  const reload = {
    operationId: id,
    expectedRevision: 1,
    runId: id,
    printerId: 'printer',
    connectionGeneration: 0,
    reason: 'Physical reload',
  };
  expect(packageActionSchemas.requestReload.safeParse(reload).success).toBe(true);
  for (const extra of [
    { reason: ' ' },
    { printerId: ' ' },
    { expectedRevision: 0 },
    { connectionGeneration: -1 },
    { runId: undefined },
  ])
    expect(packageActionSchemas.requestReload.safeParse({ ...reload, ...extra }).success).toBe(
      false
    );
});
