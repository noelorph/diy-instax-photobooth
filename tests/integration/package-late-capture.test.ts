import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createPackageFixture } from '../fixtures/package-contract';
import { localOwnerSql } from '../fixtures/local-supabase';

it('accepts only pre-stop shutter metadata for two minutes without renewing revoked access', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    localOwnerSql(
      `update public.booth_runs set readiness_observation='{"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
    );
    const started = await f.booth('start_session', { expectedRevision: 2 });
    expect(started.error).toBeNull();
    const sessionId = started.data.receipt.result.sessionId;
    const shutterAt = new Date().toISOString();
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
      `update public.booth_runs set readiness_observation='{"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
    );
    const started = await f.booth('start_session', { expectedRevision: 2 });
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
      `update public.booth_runs set readiness_observation='{"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
    );
    const started = await f.booth('start_session', { expectedRevision: 2 });
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
      `update public.booth_runs set readiness_observation='{"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":0}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
    );
    const started = await f.booth('start_session', { expectedRevision: 2 });
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
