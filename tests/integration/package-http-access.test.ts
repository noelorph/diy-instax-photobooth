// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));
import { createPackageFixture } from '../fixtures/package-contract';
import { localOwnerSql, localSupabaseStatus, ownerUpdate } from '../fixtures/local-supabase';
import { sessionCookies } from '../fixtures/admin-route-server';
import { hashSecret } from '@/lib/operations/booth-authority';
import { GET as boothState } from '@/app/api/booth/state/route';
import { GET as boothReceipt } from '@/app/api/booth/operations/[operationId]/route';
import { GET as adminState } from '@/app/api/admin/events/[eventId]/booth/state/route';
import { GET as adminReceipt } from '@/app/api/admin/events/[eventId]/operations/[operationId]/route';
import { POST as issueHandoff } from '@/app/api/admin/booth-handoffs/[handoffId]/issue/route';
import { POST as confirmHandoff } from '@/app/api/booth/handoff/confirm/route';
import {
  GET as setupRead,
  POST as setupReport,
} from '@/app/api/admin/events/[eventId]/booth/setup-readiness/route';
import { POST as startRoute } from '@/app/api/admin/events/[eventId]/booth/start/route';
import { POST as addPackages } from '@/app/api/admin/events/[eventId]/film-packages/route';
import { POST as pauseRoute } from '@/app/api/admin/events/[eventId]/booth/pause/route';
import { POST as completeRoute } from '@/app/api/admin/events/[eventId]/complete/route';
import { POST as cancelRoute } from '@/app/api/admin/events/[eventId]/cancel/route';
import { POST as deleteDraftRoute } from '@/app/api/admin/events/[eventId]/delete-draft/route';
import { POST as recoverAttemptRoute } from '@/app/api/admin/print-attempts/[attemptId]/recover/route';
import { POST as resolveAttemptRoute } from '@/app/api/admin/print-attempts/[attemptId]/resolve/route';
import { POST as captureRoute } from '@/app/api/booth/captures/route';
import { POST as startSessionRoute } from '@/app/api/booth/sessions/route';
import { POST as endSessionRoute } from '@/app/api/booth/sessions/[sessionId]/end/route';
import { POST as reconcileRoute } from '@/app/api/booth/print-attempts/[attemptId]/reconcile/route';

let priorPolicy: string;
beforeAll(() => {
  const status = localSupabaseStatus();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', status.API_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', status.ANON_KEY);
  vi.stubEnv('SUPABASE_SECRET_KEY', status.SERVICE_ROLE_KEY);
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
  priorPolicy = String(
    localOwnerSql('select mode from public.printer_completion_policy where id')[0].mode
  );
  localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
});
afterAll(() => {
  localOwnerSql(`update public.printer_completion_policy set mode='${priorPolicy}' where id`);
});
afterEach(() => jar.clear());
function request(body?: object, cookie = '', origin = 'https://booth.test') {
  return new Request('https://booth.test/api/test', {
    method: body ? 'POST' : 'GET',
    headers: { origin, cookie, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

it.each([
  [
    'complete',
    'event',
    (req: Request, id: string) => completeRoute(req, { params: Promise.resolve({ eventId: id }) }),
  ],
  [
    'cancel',
    'event',
    (req: Request, id: string) => cancelRoute(req, { params: Promise.resolve({ eventId: id }) }),
  ],
  [
    'delete Draft',
    'event',
    (req: Request, id: string) =>
      deleteDraftRoute(req, { params: Promise.resolve({ eventId: id }) }),
  ],
  [
    'recover attempt',
    'attempt',
    (req: Request, id: string) =>
      recoverAttemptRoute(req, { params: Promise.resolve({ attemptId: id }) }),
  ],
  [
    'resolve attempt',
    'attempt',
    (req: Request, id: string) =>
      resolveAttemptRoute(req, { params: Promise.resolve({ attemptId: id }) }),
  ],
] as const)(
  'maps a revoked Admin to the v2 error on shared %s',
  async (_name, resource, invoke) => {
    const fixture = await createPackageFixture();
    try {
      let id: string = fixture.eventId;
      if (resource === 'attempt') {
        fixture.seedRun();
        const sessionId = localOwnerSql(
          `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${fixture.eventId}','${fixture.runId}',2) returning id`
        )[0].id;
        const captureId = localOwnerSql(
          `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${fixture.eventId}','${fixture.runId}','${sessionId}',2,clock_timestamp(),'${randomUUID()}') returning id`
        )[0].id;
        id = String(
          localOwnerSql(
            `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${fixture.eventId}','${fixture.runId}','${sessionId}','${captureId}',2,'Guest','Reserved','${randomUUID()}','${randomUUID()}') returning id`
          )[0].id
        );
      }
      const session = (await fixture.adminClient.auth.getSession()).data.session!;
      const adminCookie = sessionCookies(session);
      for (const pair of adminCookie.split('; ')) {
        const [name, value] = pair.split('=');
        jar.set(name, value);
      }
      localOwnerSql(`delete from auth.sessions where id='${fixture.adminSessionId}'`);
      const response = await invoke(request({ operationId: randomUUID() }, adminCookie), id);
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('operation_forbidden');
    } finally {
      await fixture.dispose();
    }
  },
  30000
);

it('a failed local handoff issue leaves the initial run Paused', async () => {
  const fixture = await createPackageFixture();
  try {
    const setup = await fixture.reportSetup();
    const started = await fixture.admin('start', {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: fixture.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    });
    expect(started.error).toBeNull();
    const handoffId = started.data.receipt.result.handoffId;
    const issue = await fixture.local.service.rpc('package_issue_handoff', {
      p_handoff_id: handoffId,
      p_device_hash: fixture.deviceHash,
      p_operation_id: randomUUID(),
      p_grant_hash: fixture.grantHash,
    });
    expect(issue.data?.error).toBe('access_required');
    expect(
      localOwnerSql(`select state from public.booth_runs where event_id='${fixture.eventId}'`)[0]
        .state
    ).toBe('Paused');
    expect(
      localOwnerSql(`select state from public.booth_handoffs where id='${handoffId}'`)[0].state
    ).toBe('Failed');
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('aborts an unissued handoff when local sign-out itself fails', async () => {
  const fixture = await createPackageFixture();
  try {
    const setup = await fixture.reportSetup();
    const started = await fixture.admin('start', {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: fixture.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    });
    expect(started.error).toBeNull();
    const handoffId = started.data.receipt.result.handoffId;
    const aborted = await fixture.local.service.rpc(
      'package_fail_handoff' as never,
      {
        p_handoff_id: handoffId,
        p_device_hash: fixture.deviceHash,
      } as never
    );
    expect(aborted.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where event_id='${fixture.eventId}'`)[0]
        .state
    ).toBe('Paused');
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('aborts an issued grant when its transport response is lost before the cookie is sent', async () => {
  const fixture = await createPackageFixture();
  try {
    const setup = await fixture.reportSetup();
    const started = await fixture.admin('start', {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: fixture.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    });
    expect(started.error).toBeNull();
    const handoffId = started.data.receipt.result.handoffId;
    localOwnerSql(`delete from auth.sessions where id='${fixture.adminSessionId}'`);
    expect(
      (
        await fixture.local.service.rpc('package_issue_handoff', {
          p_handoff_id: handoffId,
          p_device_hash: fixture.deviceHash,
          p_operation_id: randomUUID(),
          p_grant_hash: fixture.grantHash,
        })
      ).error
    ).toBeNull();
    const aborted = await fixture.local.service.rpc(
      'package_fail_handoff' as never,
      {
        p_handoff_id: handoffId,
        p_device_hash: fixture.deviceHash,
      } as never
    );
    expect(aborted.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where event_id='${fixture.eventId}'`)[0]
        .state
    ).toBe('Paused');
    expect(
      localOwnerSql(
        `select state from public.booth_grants where run_id=(select id from public.booth_runs where event_id='${fixture.eventId}')`
      )[0].state
    ).toBe('Revoked');
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('Booth state and receipt reads stay scoped, private, and terminal-neutral', async () => {
  const fixture = await createPackageFixture();
  try {
    fixture.seedRun();
    const secret = 'c'.repeat(64);
    ownerUpdate('booth_grants', fixture.grantId, { secret_hash: hashSecret(secret) });
    const boothCookie = `__Host-booth-grant=${secret}`;
    const state = await boothState(request(undefined, boothCookie));
    expect(state.status).toBe(200);
    expect(
      state.headers.getSetCookie().find((value) => value.startsWith('__Host-booth-grant='))
    ).toContain('Expires=');
    expect(state.headers.get('cache-control')).toContain('no-store');
    const body = await state.json();
    expect(body.runId).toBe(fixture.runId);
    expect(body).toHaveProperty('allowedActions');
    expect(body).toHaveProperty('principalStatus');
    expect(JSON.stringify(body)).not.toContain('package@example.test');
    expect(JSON.stringify(body)).not.toContain('Client');
    const receipt = await boothReceipt(request(undefined, boothCookie), {
      params: Promise.resolve({ operationId: randomUUID() }),
    });
    expect(receipt.status).toBe(200);
    expect(
      receipt.headers.getSetCookie().find((value) => value.startsWith('__Host-booth-grant='))
    ).toContain('Expires=');
    expect((await receipt.json()).receipt).toBeNull();

    const session = (await fixture.adminClient.auth.getSession()).data.session!;
    for (const pair of sessionCookies(session).split('; ')) {
      const [name, value] = pair.split('=');
      jar.set(name, value);
    }
    const admin = await adminState(request(), {
      params: Promise.resolve({ eventId: fixture.eventId }),
    });
    expect(admin.status).toBe(200);
    expect(admin.headers.get('cache-control')).toContain('no-store');
    expect(await admin.json()).toHaveProperty('pendingAttempts');
    const adminLookup = await adminReceipt(request(), {
      params: Promise.resolve({ eventId: fixture.eventId, operationId: randomUUID() }),
    });
    expect(adminLookup.status).toBe(200);
    expect(adminLookup.headers.get('cache-control')).toContain('no-store');
    expect((await adminLookup.json()).receipt).toBeNull();

    ownerUpdate('booth_runs', fixture.runId, { state: 'Finished' });
    const finished = await boothState(request(undefined, boothCookie));
    expect(await finished.json()).toEqual({ state: 'Finished' });
    expect(finished.headers.getSetCookie()).toEqual([]);
    const noRenewal = await boothReceipt(request(undefined, boothCookie), {
      params: Promise.resolve({ operationId: randomUUID() }),
    });
    expect(noRenewal.status).toBe(401);
    localOwnerSql(
      `update public.booth_grants set created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' where id='${fixture.grantId}'`
    );
    expect((await boothState(request(undefined, boothCookie))).status).toBe(401);
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('accepts only the narrow pre-stop shutter report after Booth access is revoked', async () => {
  const fixture = await createPackageFixture();
  try {
    fixture.seedRun();
    const secret = 'e'.repeat(64);
    ownerUpdate('booth_grants', fixture.grantId, { secret_hash: hashSecret(secret) });
    localOwnerSql(
      `update public.booth_runs set readiness_observation='{"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${fixture.runId}'`
    );
    const boothCookie = `__Host-booth-grant=${secret}`;
    const sessionResponse = await startSessionRoute(
      request({ operationId: randomUUID(), expectedRevision: 2 }, boothCookie)
    );
    expect(sessionResponse.status).toBe(200);
    expect(
      sessionResponse.headers
        .getSetCookie()
        .find((value) => value.startsWith('__Host-booth-grant='))
    ).toContain('Expires=');
    const session = await sessionResponse.json();
    const shutterAt = String(
      localOwnerSql(
        `select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as captured_at`
      )[0].captured_at
    );
    const finished = await fixture.admin('finish', {
      runId: fixture.runId,
      expectedRevision: session.revision,
    });
    expect(finished.error).toBeNull();
    const first = await captureRoute(
      request(
        {
          operationId: randomUUID(),
          sessionId: session.receipt.result.sessionId,
          captureId: randomUUID(),
          capturedAt: shutterAt,
        },
        boothCookie
      )
    );
    expect(first.status).toBe(200);
    expect(first.headers.getSetCookie()).toEqual([]);
    expect(await (await boothState(request(undefined, boothCookie))).json()).toEqual({
      state: 'Finished',
    });
    const future = await captureRoute(
      request(
        {
          operationId: randomUUID(),
          sessionId: session.receipt.result.sessionId,
          captureId: randomUUID(),
          capturedAt: new Date(Date.now() + 1000).toISOString(),
        },
        boothCookie
      )
    );
    expect(future.status).toBe(401);
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('does not disclose another grant’s operation receipt', async () => {
  const source = await createPackageFixture();
  const reader = await createPackageFixture();
  try {
    source.seedRun();
    const sourceSecret = '7'.repeat(64);
    ownerUpdate('booth_grants', source.grantId, { secret_hash: hashSecret(sourceSecret) });
    localOwnerSql(
      `update public.booth_runs set readiness_observation='{"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${source.runId}'`
    );
    const operationId = randomUUID();
    const committed = await startSessionRoute(
      request({ operationId, expectedRevision: 2 }, `__Host-booth-grant=${sourceSecret}`)
    );
    expect(committed.status).toBe(200);
    ownerUpdate('events', source.eventId, { state: 'Completed', revision: 4 });
    reader.seedRun();
    const readerSecret = '8'.repeat(64);
    ownerUpdate('booth_grants', reader.grantId, { secret_hash: hashSecret(readerSecret) });
    const response = await boothReceipt(request(undefined, `__Host-booth-grant=${readerSecret}`), {
      params: Promise.resolve({ operationId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.json()).receipt).toBeNull();
  } finally {
    await source.dispose();
    await reader.dispose();
  }
}, 30000);

it('issues a bound inactive cookie after local sign-out while another Admin session survives', async () => {
  const fixture = await createPackageFixture();
  try {
    const device = 'd'.repeat(64);
    const setup = await fixture.reportSetup();
    expect(setup.error).toBeNull();
    const deviceHash = hashSecret(device);
    localOwnerSql(
      `update private.package_readiness_windows set device_hash='${deviceHash}' where id='${setup.data.readinessWindowId}'`
    );
    const started = await fixture.admin('start', {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    });
    expect(started.error).toBeNull();
    const handoffId = started.data.receipt.result.handoffId;
    const phone = await fixture.local.signIn(fixture.adminUser);
    const phoneSessionId = JSON.parse(
      Buffer.from(phone.session.access_token.split('.')[1], 'base64url').toString()
    ).session_id;
    const ipad = (await fixture.adminClient.auth.getSession()).data.session!;
    const adminCookie = sessionCookies(ipad);
    for (const pair of adminCookie.split('; ')) {
      const [name, value] = pair.split('=');
      jar.set(name, value);
    }
    const issueContext = { params: Promise.resolve({ handoffId }) };
    const issueCookie = `${adminCookie}; __Host-booth-device=${device}`;
    expect(
      (
        await issueHandoff(
          request({ operationId: randomUUID() }, issueCookie, 'https://evil.test'),
          issueContext
        )
      ).status
    ).toBe(403);
    expect(
      (
        await issueHandoff(
          request({ operationId: randomUUID(), padding: 'x'.repeat(8192) }, issueCookie),
          issueContext
        )
      ).status
    ).toBe(400);
    const issued = await issueHandoff(
      request({ operationId: randomUUID() }, issueCookie),
      issueContext
    );
    expect(issued.status).toBe(200);
    const grantCookie = issued.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-booth-grant='))!
      .split(';')[0];
    expect(grantCookie).toMatch(/^__Host-booth-grant=[0-9a-f]{64}$/);
    expect(JSON.stringify(await issued.json())).not.toContain(grantCookie.split('=')[1]);
    expect(
      localOwnerSql(`select count(*)::integer n from auth.sessions where id='${phoneSessionId}'`)[0]
        .n
    ).toBe(1);
    expect((await boothState(request(undefined, grantCookie))).status).toBe(401);
    const confirmation = { operationId: randomUUID(), handoffId };
    const confirmationCookie = `${grantCookie}; __Host-booth-device=${device}`;
    const confirmed = await confirmHandoff(request(confirmation, confirmationCookie));
    expect(confirmed.status).toBe(200);
    const committed = await confirmed.json();
    const replay = await confirmHandoff(request(confirmation, confirmationCookie));
    expect(replay.status).toBe(200);
    expect((await replay.json()).receipt).toEqual(committed.receipt);
    expect(
      confirmed.headers.getSetCookie().find((value) => value.startsWith('__Host-booth-grant='))
    ).toContain('Expires=');
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('binds setup readiness to the current Admin session and device before Start', async () => {
  const fixture = await createPackageFixture();
  try {
    const session = (await fixture.adminClient.auth.getSession()).data.session!;
    const adminCookie = sessionCookies(session);
    for (const pair of adminCookie.split('; ')) {
      const [name, value] = pair.split('=');
      jar.set(name, value);
    }
    const context = { params: Promise.resolve({ eventId: fixture.eventId }) };
    const read = await setupRead(
      new Request('https://booth.test/api/test?printerId=fixture-printer&connectionGeneration=0', {
        headers: { cookie: adminCookie },
      }),
      context
    );
    expect(read.status).toBe(200);
    expect(read.headers.get('cache-control')).toContain('no-store');
    const deviceCookie = read.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-booth-device='))!
      .split(';')[0];
    const readinessWindowId = (await read.json()).readinessWindowId;
    const reportBody = {
      operationId: randomUUID(),
      readinessWindowId,
      observedAgeMs: 0,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
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
    };
    expect(
      (
        await setupReport(
          request(reportBody, `${adminCookie}; ${deviceCookie}`, 'https://evil.test'),
          context
        )
      ).status
    ).toBe(403);
    expect(
      (
        await setupReport(
          request({ ...reportBody, padding: 'x'.repeat(8192) }, `${adminCookie}; ${deviceCookie}`),
          context
        )
      ).status
    ).toBe(400);
    const report = await setupReport(
      request(
        {
          ...reportBody,
        },
        `${adminCookie}; ${deviceCookie}`
      ),
      context
    );
    expect(report.status).toBe(200);
    const startBody = {
      operationId: randomUUID(),
      expectedRevision: 1,
      readinessWindowId,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    };
    const setupCookie = `${adminCookie}; ${deviceCookie}`;
    const started = await startRoute(request(startBody, setupCookie), context);
    expect(started.status).toBe(200);
    const committed = await started.json();
    expect(committed.receipt.result.purpose).toBe('initial');
    const replay = await startRoute(request(startBody, setupCookie), context);
    expect(replay.status).toBe(200);
    expect((await replay.json()).receipt).toEqual(committed.receipt);
    const conflict = await startRoute(
      request({ ...startBody, connectionGeneration: 1 }, setupCookie),
      context
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('operation_conflict');
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('recovers an uncertain package addition through its original receipt and rejects conflicts', async () => {
  const fixture = await createPackageFixture();
  try {
    fixture.seedRun();
    const session = (await fixture.adminClient.auth.getSession()).data.session!;
    const adminCookie = sessionCookies(session);
    for (const pair of adminCookie.split('; ')) {
      const [name, value] = pair.split('=');
      jar.set(name, value);
    }
    const context = { params: Promise.resolve({ eventId: fixture.eventId }) };
    const operationId = randomUUID();
    const body = {
      operationId,
      packages: 1,
      clientRequestNote: 'Client requested another package',
    };
    const first = await addPackages(request(body, adminCookie), context);
    expect(first.status).toBe(200);
    const committed = await first.json();
    const receipt = await adminReceipt(request(), {
      params: Promise.resolve({ eventId: fixture.eventId, operationId }),
    });
    expect((await receipt.json()).receipt).toEqual(committed.receipt);
    expect((await (await addPackages(request(body, adminCookie), context)).json()).replayed).toBe(
      true
    );
    const conflict = await addPackages(request({ ...body, packages: 2 }, adminCookie), context);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('operation_conflict');
    const stale = await pauseRoute(
      request(
        { operationId: randomUUID(), runId: fixture.runId, expectedRevision: 2 },
        adminCookie
      ),
      context
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe('stale_revision');
    localOwnerSql(`delete from auth.sessions where id='${fixture.adminSessionId}'`);
    const revoked = await addPackages(
      request({ ...body, operationId: randomUUID() }, adminCookie),
      context
    );
    expect([401, 403]).toContain(revoked.status);
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('scopes Admin run commands and replays only their original payload', async () => {
  const fixture = await createPackageFixture();
  try {
    fixture.seedRun();
    const session = (await fixture.adminClient.auth.getSession()).data.session!;
    const adminCookie = sessionCookies(session);
    for (const pair of adminCookie.split('; ')) {
      const [name, value] = pair.split('=');
      jar.set(name, value);
    }
    const context = { params: Promise.resolve({ eventId: fixture.eventId }) };
    const foreign = await pauseRoute(
      request({ operationId: randomUUID(), runId: randomUUID(), expectedRevision: 2 }, adminCookie),
      context
    );
    expect(foreign.status).toBe(409);
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${fixture.runId}'`)[0].state
    ).toBe('Active');
    const body = { operationId: randomUUID(), runId: fixture.runId, expectedRevision: 2 };
    const first = await pauseRoute(request(body, adminCookie), context);
    expect(first.status).toBe(200);
    const committed = await first.json();
    const replay = await pauseRoute(request(body, adminCookie), context);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, receipt: committed.receipt });
    const conflict = await pauseRoute(
      request({ ...body, expectedRevision: 3 }, adminCookie),
      context
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('operation_conflict');
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('scopes Admin attempt recovery and replays only its original inspection reason', async () => {
  const fixture = await createPackageFixture();
  try {
    fixture.seedRun();
    const sessionId = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${fixture.eventId}','${fixture.runId}',2) returning id`
    )[0].id;
    const captureId = localOwnerSql(
      `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${fixture.eventId}','${fixture.runId}','${sessionId}',2,clock_timestamp(),'${randomUUID()}') returning id`
    )[0].id;
    const attemptId = String(
      localOwnerSql(
        `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${fixture.eventId}','${fixture.runId}','${sessionId}','${captureId}',2,'Guest','Reserved','${randomUUID()}','${randomUUID()}') returning id`
      )[0].id
    );
    const session = (await fixture.adminClient.auth.getSession()).data.session!;
    const adminCookie = sessionCookies(session);
    for (const pair of adminCookie.split('; ')) {
      const [name, value] = pair.split('=');
      jar.set(name, value);
    }
    const context = { params: Promise.resolve({ attemptId }) };
    const body = {
      operationId: randomUUID(),
      expectedRevision: 2,
      reason: 'No dispatch committed',
    };
    const first = await recoverAttemptRoute(request(body, adminCookie), context);
    expect(first.status).toBe(200);
    const committed = await first.json();
    const replay = await recoverAttemptRoute(request(body, adminCookie), context);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, receipt: committed.receipt });
    const conflict = await recoverAttemptRoute(
      request({ ...body, reason: 'Different inspection' }, adminCookie),
      context
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('operation_conflict');
    localOwnerSql(`delete from auth.sessions where id='${fixture.adminSessionId}'`);
    const revoked = await recoverAttemptRoute(request(body, adminCookie), context);
    expect(revoked.status).toBe(403);
    expect((await revoked.json()).code).toBe('operation_forbidden');
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('replays Booth session creation and rejects a changed payload under the same key', async () => {
  const fixture = await createPackageFixture();
  try {
    fixture.seedRun();
    const secret = '5'.repeat(64);
    ownerUpdate('booth_grants', fixture.grantId, { secret_hash: hashSecret(secret) });
    localOwnerSql(
      `update public.booth_runs set readiness_observation='{"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${fixture.runId}'`
    );
    const boothCookie = `__Host-booth-grant=${secret}`;
    const body = { operationId: randomUUID(), expectedRevision: 2 };
    const first = await startSessionRoute(request(body, boothCookie));
    expect(first.status).toBe(200);
    const committed = await first.json();
    const replay = await startSessionRoute(request(body, boothCookie));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, receipt: committed.receipt });
    const conflict = await startSessionRoute(
      request({ ...body, expectedRevision: 3 }, boothCookie)
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('operation_conflict');
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('replays Booth attempt reconciliation and rejects a changed reason', async () => {
  const fixture = await createPackageFixture();
  try {
    fixture.seedRun();
    const secret = '6'.repeat(64);
    ownerUpdate('booth_grants', fixture.grantId, { secret_hash: hashSecret(secret) });
    const sessionId = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${fixture.eventId}','${fixture.runId}',2) returning id`
    )[0].id;
    const captureId = localOwnerSql(
      `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${fixture.eventId}','${fixture.runId}','${sessionId}',2,clock_timestamp(),'${randomUUID()}') returning id`
    )[0].id;
    const attemptId = String(
      localOwnerSql(
        `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${fixture.eventId}','${fixture.runId}','${sessionId}','${captureId}',2,'Guest','Reserved','${randomUUID()}','${randomUUID()}') returning id`
      )[0].id
    );
    const boothCookie = `__Host-booth-grant=${secret}`;
    const context = { params: Promise.resolve({ attemptId }) };
    const body = { operationId: randomUUID(), reason: 'Dispatch status unknown' };
    const first = await reconcileRoute(request(body, boothCookie), context);
    expect(first.status).toBe(200);
    const committed = await first.json();
    const replay = await reconcileRoute(request(body, boothCookie), context);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, receipt: committed.receipt });
    const conflict = await reconcileRoute(
      request({ ...body, reason: 'Different report' }, boothCookie),
      context
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('operation_conflict');
  } finally {
    await fixture.dispose();
  }
}, 30000);

it('denies a Booth grant access to another Event’s print attempt', async () => {
  const own = await createPackageFixture();
  const other = await createPackageFixture();
  try {
    other.seedRun();
    const sessionId = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${other.eventId}','${other.runId}',2) returning id`
    )[0].id;
    const captureId = localOwnerSql(
      `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${other.eventId}','${other.runId}','${sessionId}',2,clock_timestamp(),'${randomUUID()}') returning id`
    )[0].id;
    const attemptId = String(
      localOwnerSql(
        `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${other.eventId}','${other.runId}','${sessionId}','${captureId}',2,'Guest','Reserved','${randomUUID()}','${randomUUID()}') returning id`
      )[0].id
    );
    ownerUpdate('events', other.eventId, { state: 'Completed', revision: 3 });
    own.seedRun();
    const secret = 'f'.repeat(64);
    ownerUpdate('booth_grants', own.grantId, { secret_hash: hashSecret(secret) });
    const response = await reconcileRoute(
      request({ operationId: randomUUID(), reason: 'No output' }, `__Host-booth-grant=${secret}`),
      { params: Promise.resolve({ attemptId }) }
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('invalid_transition');
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Reserved');
    const foreignSession = await endSessionRoute(
      request({ operationId: randomUUID(), reason: 'Wrong run' }, `__Host-booth-grant=${secret}`),
      { params: Promise.resolve({ sessionId: String(sessionId) }) }
    );
    expect(foreignSession.status).toBe(409);
    expect((await foreignSession.json()).code).toBe('invalid_transition');
  } finally {
    await own.dispose();
    await other.dispose();
  }
}, 30000);

it.each(['evidence_discrepancy', 'qualification_required'])(
  'projects %s as unavailable at the Booth HTTP boundary',
  async (blocker) => {
    const f = await createPackageFixture();
    try {
      f.seedRun();
      const secret = 'd'.repeat(64);
      ownerUpdate('booth_grants', f.grantId, { secret_hash: hashSecret(secret) });
      localOwnerSql(
        `update public.booth_runs set blockers=array['${blocker}'],readiness_observation='{"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
      );
      const response = await boothState(request(undefined, `__Host-booth-grant=${secret}`));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.blockers).toContain(blocker);
      expect(body.principalStatus).toBe('printer_unavailable');
      expect(body.allowedActions.startGuest).toBe(false);
    } finally {
      await f.dispose();
    }
  },
  30000
);

it('rejects the retained legacy SQL redaction operation for package History', async () => {
  const f = await createPackageFixture();
  try {
    ownerUpdate('events', f.eventId, { state: 'Cancelled', revision: 2 });
    const args = {
      admin_user_id: f.adminUser.id,
      admin_session_id: f.adminSessionId,
      event_id: f.eventId,
      expected_revision: 2,
      operation_key: randomUUID(),
      action: 'redact_client',
    };
    expect((await f.local.service.rpc('begin_event_redaction', args)).error?.message).toBe(
      'state_conflict'
    );
    expect(
      localOwnerSql(
        `select client_name,media_removal_state,redacted_at from public.events where id='${f.eventId}'`
      )[0]
    ).toEqual({ client_name: 'Client', media_removal_state: 'none', redacted_at: null });
  } finally {
    await f.dispose();
  }
}, 30000);
