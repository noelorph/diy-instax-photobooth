// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  rpc: vi.fn(),
  version: vi.fn(),
  simulator: vi.fn(),
}));
vi.mock('@/lib/operations/admin-authority', () => ({ requireAdminRequest: mocks.admin }));
vi.mock('@/lib/operations/package-rpc', () => ({ packageRpc: mocks.rpc }));
vi.mock('@/lib/operations/package-version', () => ({
  isPackageEvent: mocks.version,
  isPackageAttempt: mocks.version,
  isPackageGrant: mocks.version,
}));
vi.mock('@/lib/operations/printer-gate', () => ({ requireSimulator: mocks.simulator }));
vi.mock('@/lib/operations/privileged-client', () => ({
  createPrivilegedClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { event_id: eventId, accounting_version: 2 },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
import { packageActionSchemas } from '@/lib/operations/package-validation';
import { hashSecret } from '@/lib/operations/booth-authority';
import { PackageError } from '@/lib/operations/package-contract';
import { OperationError } from '@/lib/operations/types';
import { POST as start } from '@/app/api/admin/events/[eventId]/booth/start/route';
import { POST as recoverAccess } from '@/app/api/admin/events/[eventId]/booth/recover-access/route';
import { POST as pause } from '@/app/api/admin/events/[eventId]/booth/pause/route';
import { POST as resume } from '@/app/api/admin/events/[eventId]/booth/resume/route';
import { POST as finish } from '@/app/api/admin/events/[eventId]/booth/finish/route';
import { POST as complete } from '@/app/api/admin/events/[eventId]/complete/route';
import { POST as cancel } from '@/app/api/admin/events/[eventId]/cancel/route';
import { POST as addPackages } from '@/app/api/admin/events/[eventId]/film-packages/route';
import { POST as requestReload } from '@/app/api/admin/events/[eventId]/reload-requests/route';
import { POST as confirmReload } from '@/app/api/admin/events/[eventId]/reload-confirmations/route';
import { POST as recoverAttempt } from '@/app/api/admin/print-attempts/[attemptId]/recover/route';
import { POST as resolveAttempt } from '@/app/api/admin/print-attempts/[attemptId]/resolve/route';
import { POST as confirmHandoff } from '@/app/api/booth/handoff/confirm/route';
import { POST as startSession } from '@/app/api/booth/sessions/route';
import { POST as capture } from '@/app/api/booth/captures/route';
import { POST as endSession } from '@/app/api/booth/sessions/[sessionId]/end/route';
import { POST as reserve } from '@/app/api/booth/print-attempts/route';
import { POST as dispatch } from '@/app/api/booth/print-attempts/[attemptId]/dispatch/route';
import { POST as reconcile } from '@/app/api/booth/print-attempts/[attemptId]/reconcile/route';
import { POST as observe } from '@/app/api/booth/print-attempts/[attemptId]/observations/route';
import { POST as readiness } from '@/app/api/booth/readiness/route';
import {
  GET as setupRead,
  POST as setupReport,
} from '@/app/api/admin/events/[eventId]/booth/setup-readiness/route';

const eventId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';
const cookie = `__Host-booth-grant=${'a'.repeat(64)}; __Host-booth-device=${'b'.repeat(64)}`;
const readyObservation = {
  cameraPermission: true,
  cameraLive: true,
  serverReachable: true,
  printerConnected: true,
  printerReady: true,
  oldJobCleared: true,
};
function request(body: object, origin = 'https://booth.test', requestCookie = cookie) {
  return new Request('https://booth.test/api/test', {
    method: 'POST',
    headers: {
      origin,
      cookie: requestCookie,
      'content-type': 'application/json',
      'x-package-admin-id': id,
    },
    body: JSON.stringify(body),
  });
}
const ctx = (key: string, value: string) => ({ params: Promise.resolve({ [key]: value }) });
beforeEach(() => {
  mocks.admin.mockReset().mockResolvedValue({ userId: id, sessionId: sessionId });
  mocks.rpc.mockReset().mockResolvedValue({
    receipt: { operationId: id, kind: 'ok', committedRevision: 2, result: {} },
    revision: 2,
    replayed: false,
  });
  mocks.version.mockReset().mockResolvedValue(true);
  mocks.simulator.mockReset();
});

describe('package HTTP request contracts', () => {
  it('accepts the start command without caller-selected authority', () => {
    expect(
      packageActionSchemas.start.safeParse({
        operationId: '00000000-0000-4000-8000-000000000001',
        expectedRevision: 1,
        readinessWindowId: '00000000-0000-4000-8000-000000000002',
        printerId: 'instax',
        connectionGeneration: 0,
      }).success
    ).toBe(true);
  });
});

const adminRows = [
  [
    'start',
    start,
    { expectedRevision: 1, readinessWindowId: id, printerId: 'instax', connectionGeneration: 0 },
    'eventId',
    eventId,
  ],
  ['recover-access', recoverAccess, { expectedRevision: 2, runId: id }, 'eventId', eventId],
  ['pause', pause, { expectedRevision: 2, runId: id }, 'eventId', eventId],
  ['resume', resume, { expectedRevision: 2, runId: id }, 'eventId', eventId],
  ['finish', finish, { expectedRevision: 2, runId: id }, 'eventId', eventId],
  ['complete', complete, { expectedRevision: 2 }, 'eventId', eventId],
  ['cancel', cancel, { expectedRevision: 2 }, 'eventId', eventId],
  [
    'film-packages',
    addPackages,
    { packages: 1, clientRequestNote: 'One more' },
    'eventId',
    eventId,
  ],
  [
    'reload-requests',
    requestReload,
    {
      expectedRevision: 2,
      runId: id,
      printerId: 'instax',
      connectionGeneration: 0,
      reason: 'No film',
    },
    'eventId',
    eventId,
  ],
  [
    'reload-confirmations',
    confirmReload,
    { expectedRevision: 2, reloadRequestId: id, printerId: 'instax', connectionGeneration: 0 },
    'eventId',
    eventId,
  ],
  [
    'recover-attempt',
    recoverAttempt,
    { expectedRevision: 2, reason: 'Inspect' },
    'attemptId',
    attemptId,
  ],
  [
    'resolve-attempt',
    resolveAttempt,
    {
      expectedRevision: 2,
      outcome: 'printed',
      inspectionReason: 'Observed sheet',
      oldJobCleared: true,
    },
    'attemptId',
    attemptId,
  ],
] as const;
const boothRows = [
  ['confirm-handoff', confirmHandoff, { handoffId: id }, null, null],
  ['sessions', startSession, { expectedRevision: 2 }, null, null],
  [
    'captures',
    capture,
    { sessionId, captureId: id, capturedAt: '2026-10-21T00:00:00Z' },
    null,
    null,
  ],
  ['end-session', endSession, { reason: 'Done' }, 'sessionId', sessionId],
  ['reserve', reserve, { expectedRevision: 2, sessionId, captureId: id }, null, null],
  [
    'dispatch',
    dispatch,
    { expectedRevision: 2, printerId: 'instax', connectionGeneration: 0 },
    'attemptId',
    attemptId,
  ],
  ['reconcile', reconcile, { reason: 'Reconnected' }, 'attemptId', attemptId],
  [
    'observe',
    observe,
    {
      observationId: id,
      kind: 'outcome_unknown',
      evidenceVersion: 'simulator-v1',
      connectionGeneration: 0,
      metadata: {},
    },
    'attemptId',
    attemptId,
  ],
  [
    'readiness',
    readiness,
    {
      readinessWindowId: id,
      observedAgeMs: 0,
      printerId: 'instax',
      connectionGeneration: 0,
      observation: readyObservation,
    },
    null,
    null,
  ],
] as const;

const actionByRoute: Record<string, string> = {
  start: 'start',
  'recover-access': 'recover_access',
  pause: 'pause',
  resume: 'resume',
  finish: 'finish',
  complete: 'complete',
  cancel: 'cancel',
  'film-packages': 'add_packages',
  'reload-requests': 'request_reload',
  'reload-confirmations': 'confirm_reload',
  'recover-attempt': 'recover_attempt',
  'resolve-attempt': 'resolve_attempt',
  'confirm-handoff': 'confirm_handoff',
  sessions: 'start_session',
  captures: 'record_capture',
  'end-session': 'end_session',
  reserve: 'reserve',
  dispatch: 'dispatch',
  reconcile: 'reconcile',
  observe: 'observe',
  readiness: 'report_readiness',
};

describe.each([...adminRows, ...boothRows])(
  '%s HTTP boundary',
  (name, handler, fields, key, resourceId) => {
    const isAdmin = adminRows.some(([route]) => route === name);
    const call = (body: object, origin?: string, requestCookie?: string) =>
      key
        ? (handler as (request: Request, context: ReturnType<typeof ctx>) => Promise<Response>)(
            request(body, origin, requestCookie),
            ctx(key, resourceId!)
          )
        : (handler as (request: Request) => Promise<Response>)(
            request(body, origin, requestCookie)
          );
    it('returns a scoped receipt and rejects extra fields', async () => {
      const body = { operationId: id, ...fields };
      expect((await call(body)).status).toBe(200);
      const expectedPayload = {
        ...(isAdmin ? { eventId } : {}),
        ...fields,
        ...(key === 'attemptId' ? { attemptId: resourceId } : {}),
        ...(key === 'sessionId' ? { sessionId: resourceId } : {}),
        ...(name === 'start' || name === 'recover-access' || name === 'confirm-handoff'
          ? { deviceHash: hashSecret('b'.repeat(64)) }
          : {}),
      };
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
        isAdmin ? 'package_admin_operation' : 'package_booth_operation',
        isAdmin
          ? {
              p_admin_user_id: id,
              p_admin_session_id: sessionId,
              p_operation: actionByRoute[name],
              p_operation_id: id,
              p_payload: expectedPayload,
            }
          : {
              p_grant_hash: hashSecret('a'.repeat(64)),
              p_operation: actionByRoute[name],
              p_operation_id: id,
              p_payload: expectedPayload,
            }
      );
      const replay = {
        receipt: { operationId: id, kind: 'ok', committedRevision: 2, result: {} },
        revision: 2,
        replayed: true,
      };
      mocks.rpc.mockResolvedValueOnce(replay);
      expect(await (await call(body)).json()).toEqual(replay);
      expect(mocks.rpc).toHaveBeenCalledTimes(2);
      const invalid = await call({ ...body, actorId: randomUUID() });
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).code).toBe('invalid_input');
      expect(mocks.rpc).toHaveBeenCalledTimes(2);
    });
    it('denies missing authority and surfaces scoped ownership and conflict errors', async () => {
      const body = { operationId: id, ...fields };
      if (isAdmin) mocks.admin.mockRejectedValueOnce(new OperationError('unauthorized'));
      const denied = await call(body, undefined, isAdmin ? cookie : '');
      expect(denied.status).toBe(401);
      expect(mocks.rpc).not.toHaveBeenCalled();
      mocks.rpc.mockRejectedValueOnce(new PackageError('operation_forbidden'));
      const foreign = await call(body);
      expect(foreign.status).toBe(403);
      expect((await foreign.json()).code).toBe('operation_forbidden');
      mocks.rpc.mockRejectedValueOnce(new PackageError('operation_conflict'));
      const conflict = await call(body);
      expect(conflict.status).toBe(409);
      expect((await conflict.json()).code).toBe('operation_conflict');
      mocks.rpc.mockRejectedValueOnce(new PackageError('stale_revision'));
      const stale = await call(body);
      expect(stale.status).toBe(409);
      expect((await stale.json()).code).toBe('stale_revision');
    });
    it('rejects cross-origin and oversized bodies', async () => {
      expect((await call({ operationId: id, ...fields }, 'https://evil.test')).status).toBe(403);
      expect((await call({ operationId: id, ...fields, padding: 'x'.repeat(8192) })).status).toBe(
        400
      );
    });
  }
);

it('rejects a revoked Admin actor before calling package RPC', async () => {
  mocks.admin.mockRejectedValue(new OperationError('unauthorized'));
  const response = await pause(request({ operationId: id, runId: id, expectedRevision: 2 }), {
    params: Promise.resolve({ eventId }),
  });
  expect(response.status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('keeps inspected resolution and printer observations behind the simulator gate', async () => {
  mocks.simulator.mockImplementation(() => {
    throw new OperationError('state_conflict');
  });
  const resolution = await resolveAttempt(
    request({
      operationId: id,
      expectedRevision: 2,
      outcome: 'printed',
      inspectionReason: 'Visible sheet',
      oldJobCleared: true,
    }),
    { params: Promise.resolve({ attemptId }) }
  );
  expect(resolution.status).toBe(403);
  expect((await resolution.json()).code).toBe('qualification_required');
  const observation = await observe(
    request({
      operationId: id,
      observationId: id,
      kind: 'full_ejection_confirmed',
      evidenceVersion: 'simulator-v1',
      connectionGeneration: 0,
      metadata: {},
    }),
    { params: Promise.resolve({ attemptId }) }
  );
  expect(observation.status).toBe(403);
  expect((await observation.json()).code).toBe('qualification_required');
});

it('keeps setup readiness reads behind the simulator gate', async () => {
  mocks.simulator.mockImplementation(() => {
    throw new OperationError('state_conflict');
  });
  const response = await setupRead(
    new Request('https://booth.test/api/test?printerId=instax&connectionGeneration=0'),
    { params: Promise.resolve({ eventId }) }
  );
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('qualification_required');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('validates setup report origin, size, and server-derived device authority', async () => {
  const body = {
    operationId: id,
    readinessWindowId: id,
    observedAgeMs: 0,
    printerId: 'instax',
    connectionGeneration: 0,
    observation: readyObservation,
    filmLoadedConfirmed: true,
    powerConfirmed: true,
    guidedAccessConfirmed: true,
  };
  const context = { params: Promise.resolve({ eventId }) };
  expect((await setupReport(request(body, 'https://evil.test'), context)).status).toBe(403);
  expect((await setupReport(request({ ...body, padding: 'x'.repeat(8192) }), context)).status).toBe(
    400
  );
  expect(
    (await setupReport(request({ ...body, deviceHash: 'b'.repeat(64) }), context)).status
  ).toBe(400);
});

it('rejects a caller asserted terminal outcome in an observation', async () => {
  const response = await observe(
    request({
      operationId: id,
      observationId: id,
      kind: 'printed',
      evidenceVersion: 'simulator-v1',
      connectionGeneration: 0,
      metadata: {},
    }),
    { params: Promise.resolve({ attemptId }) }
  );
  expect(response.status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('returns an ambiguous 503 without exposing lower-layer details', async () => {
  mocks.rpc.mockRejectedValue(new Error('private database timeout with secret'));
  const response = await addPackages(
    request({ operationId: id, packages: 1, clientRequestNote: 'One more' }),
    { params: Promise.resolve({ eventId }) }
  );
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.code).toBe('operation_unavailable');
  expect(JSON.stringify(body)).not.toContain('secret');
});

it.each([null, '55555555-5555-4555-8555-555555555555'])(
  'denies a purchase without the matching expected Admin %s before its RPC',
  async (expectedAdmin) => {
    const req = request({ operationId: id, packages: 1, clientRequestNote: 'One more' });
    if (expectedAdmin) req.headers.set('x-package-admin-id', expectedAdmin);
    else req.headers.delete('x-package-admin-id');
    const response = await addPackages(req, { params: Promise.resolve({ eventId }) });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('operation_forbidden');
    expect(mocks.rpc).not.toHaveBeenCalled();
  }
);
