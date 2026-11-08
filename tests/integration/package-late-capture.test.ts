import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPackageFixture } from '../fixtures/package-contract';
import { localOwnerSql } from '../fixtures/local-supabase';

let priorPolicy: unknown;
beforeAll(() => {
  priorPolicy = localOwnerSql('select mode from public.printer_completion_policy where id')[0].mode;
  localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
});
afterAll(() => {
  localOwnerSql(`update public.printer_completion_policy set mode='${priorPolicy}' where id`);
});

it('accepts only pre-stop shutter metadata for two minutes without renewing revoked access', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    localOwnerSql(
      `update public.booth_runs set readiness_observation='{"printerMode":"simulated","printerEvidence":{"adapterVersion":"simulator-v2","evidenceVersion":"simulator-v1","modelNumber":null,"firmwareRevision":null},"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
    );
    const started = await f.booth('start_session', { expectedRevision: 2 });
    expect(started.error).toBeNull();
    const sessionId = started.data.receipt.result.sessionId;
    const shutterAt = String(
      localOwnerSql(
        `select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as captured_at`
      )[0].captured_at
    );
    const finished = await f.admin('finish', {
      runId: f.runId,
      expectedRevision: started.data.revision,
    });
    expect(finished.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finished');
    const late = await f.booth('record_capture', {
      sessionId,
      captureId: randomUUID(),
      capturedAt: shutterAt,
    });
    expect(late.error).toBeNull();
    expect((await f.readBooth()).error?.message).toBe('access_required');
    expect(
      localOwnerSql(`select state from public.booth_grants where id='${f.grantId}'`)[0].state
    ).toBe('Revoked');
    expect(
      (
        await f.booth('record_capture', {
          sessionId,
          captureId: randomUUID(),
          capturedAt: new Date(Date.now() + 1000).toISOString(),
        })
      ).error
    ).not.toBeNull();
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.captures where session_id='${sessionId}'`
      )[0].n
    ).toBe(1);
    const completed = await f.admin('complete', { expectedRevision: late.data.revision });
    expect(completed.error).toBeNull();
    expect(
      (
        await f.booth('record_capture', {
          sessionId,
          captureId: randomUUID(),
          capturedAt: shutterAt,
        })
      ).error
    ).not.toBeNull();
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.captures where session_id='${sessionId}'`
      )[0].n
    ).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);

it('closes the late Capture exception two minutes after the session stop', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    localOwnerSql(
      `update public.booth_runs set readiness_observation='{"printerMode":"simulated","printerEvidence":{"adapterVersion":"simulator-v2","evidenceVersion":"simulator-v1","modelNumber":null,"firmwareRevision":null},"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
    );
    const started = await f.booth('start_session', { expectedRevision: 2 });
    expect(started.error).toBeNull();
    const sessionId = started.data.receipt.result.sessionId;
    expect(
      (await f.admin('finish', { runId: f.runId, expectedRevision: started.data.revision })).error
    ).toBeNull();
    localOwnerSql(
      `update public.guest_sessions set created_at=clock_timestamp()-interval '3 minutes',closed_at=clock_timestamp()-interval '121 seconds' where id='${sessionId}'`
    );
    expect(
      (
        await f.booth('record_capture', {
          sessionId,
          captureId: randomUUID(),
          capturedAt: new Date(Date.now() - 125_000).toISOString(),
        })
      ).error
    ).not.toBeNull();
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.captures where session_id='${sessionId}'`
      )[0].n
    ).toBe(0);
  } finally {
    await f.dispose();
  }
}, 30000);

it('rejects a claimed shutter before the matching session began', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    localOwnerSql(
      `update public.booth_runs set readiness_observation='{"printerMode":"simulated","printerEvidence":{"adapterVersion":"simulator-v2","evidenceVersion":"simulator-v1","modelNumber":null,"firmwareRevision":null},"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
    );
    const started = await f.booth('start_session', { expectedRevision: 2 });
    expect(started.error).toBeNull();
    const sessionId = started.data.receipt.result.sessionId;
    expect(
      (await f.admin('finish', { runId: f.runId, expectedRevision: started.data.revision })).error
    ).toBeNull();
    const bogus = await f.booth('record_capture', {
      sessionId,
      captureId: randomUUID(),
      capturedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(bogus.error?.message).toBe('invalid_transition');
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.captures where session_id='${sessionId}'`
      )[0].n
    ).toBe(0);
  } finally {
    await f.dispose();
  }
}, 30000);

it('rejects late Capture when the original grant would already be expired', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    localOwnerSql(
      `update public.booth_runs set readiness_observation='{"printerMode":"simulated","printerEvidence":{"adapterVersion":"simulator-v2","evidenceVersion":"simulator-v1","modelNumber":null,"firmwareRevision":null},"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
    );
    const started = await f.booth('start_session', { expectedRevision: 2 });
    expect(started.error).toBeNull();
    const sessionId = started.data.receipt.result.sessionId;
    const shutterAt = new Date().toISOString();
    expect(
      (await f.admin('finish', { runId: f.runId, expectedRevision: started.data.revision })).error
    ).toBeNull();
    localOwnerSql(
      `update public.booth_grants set expires_at=created_at+interval '1 millisecond' where id='${f.grantId}'`
    );
    const denied = await f.booth('record_capture', {
      sessionId,
      captureId: randomUUID(),
      capturedAt: shutterAt,
    });
    expect(denied.error).not.toBeNull();
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.captures where session_id='${sessionId}'`
      )[0].n
    ).toBe(0);
  } finally {
    await f.dispose();
  }
}, 30000);

it.each(['pause', 'finish'])(
  'preserves exact pre-stop metadata receipts after %s without restoring Guest authority',
  async (action) => {
    const f = await createPackageFixture();
    try {
      f.seedRun();
      localOwnerSql(
        `update public.booth_runs set readiness_observation='{"printerMode":"simulated","printerEvidence":{"adapterVersion":"simulator-v2","evidenceVersion":"simulator-v1","modelNumber":null,"firmwareRevision":null},"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
      );
      const session = await f.booth('start_session', { expectedRevision: 2 });
      expect(session.error).toBeNull();
      const sessionId = session.data.receipt.result.sessionId;
      const capturedAt = String(localOwnerSql('select clock_timestamp() as at')[0].at);
      const stop = await f.admin(action, {
        runId: f.runId,
        expectedRevision: session.data.revision,
      });
      expect(stop.error).toBeNull();
      const input = { sessionId, captureId: randomUUID(), capturedAt },
        key = randomUUID();
      const late = await f.booth('record_capture', input, key);
      expect(late.error).toBeNull();
      const replay = await f.booth('record_capture', input, key);
      expect(replay.error).toBeNull();
      expect(replay.data.replayed).toBe(true);
      expect(replay.data.receipt).toEqual(late.data.receipt);
      expect(
        (await f.booth('record_capture', { ...input, captureId: randomUUID() }, key)).error?.message
      ).toBe('operation_conflict');
      expect(
        (await f.booth('record_capture', { ...input, sessionId: randomUUID() })).error?.message
      ).toBe('invalid_transition');
      expect(
        (await f.booth('start_session', { expectedRevision: late.data.revision })).error
      ).not.toBeNull();
      expect(
        (
          await f.booth('reserve', {
            sessionId,
            captureId: input.captureId,
            expectedRevision: late.data.revision,
          })
        ).error
      ).not.toBeNull();
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.captures where event_id='${f.eventId}'`
        )[0].n
      ).toBe(1);
    } finally {
      await f.dispose();
    }
  },
  30000
);
