import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createPackageFixture } from '../fixtures/package-contract';
import { localOwnerSql, ownerUpdate } from '../fixtures/local-supabase';

it('renews only an active unexpired grant and rejects an inactive grant for booth state', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    localOwnerSql(
      `update public.booth_grants set expires_at=clock_timestamp()+interval '1 minute' where id='${f.grantId}'`
    );
    expect((await f.readBooth()).error).toBeNull();
    expect(
      localOwnerSql(
        `select expires_at>clock_timestamp()+interval '23 hours' as renewed from public.booth_grants where id='${f.grantId}'`
      )[0].renewed
    ).toBe(true);
    ownerUpdate('booth_grants', f.grantId, {
      state: 'Revoked',
      revoked_at: new Date().toISOString(),
    });
    expect((await f.readBooth()).error?.message).toBe('access_required');
    localOwnerSql(
      `update public.booth_grants set state='Active',revoked_at=null,created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' where id='${f.grantId}'`
    );
    expect((await f.readBooth()).error?.message).toBe('access_required');
  } finally {
    await f.dispose();
  }
}, 30000);

it('does not accept a grant that expires during a delayed database statement', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun();
    localOwnerSql(
      `update public.booth_grants set expires_at=clock_timestamp()+interval '1 second' where id='${f.grantId}'`
    );
    expect(() =>
      localOwnerSql(
        `with delayed as materialized (select pg_sleep(2)) select (private.package_require_booth('${f.grantHash}','read')).id from delayed`
      )
    ).toThrow(/access_required/);
  } finally {
    await f.dispose();
  }
}, 30000);

it('recovery cancels known unsent work but refuses possible output and cannot restart Finishing', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun('Paused');
    const sessionId = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${f.eventId}','${f.runId}',2) returning id`
    )[0].id;
    const captureId = localOwnerSql(
      `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${f.eventId}','${f.runId}','${sessionId}',2,clock_timestamp(),'${randomUUID()}') returning id`
    )[0].id;
    const attemptId = localOwnerSql(
      `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${f.eventId}','${f.runId}','${sessionId}','${captureId}',2,'Guest','Reserved','${randomUUID()}','${randomUUID()}') returning id`
    )[0].id;
    const recovered = await f.admin('recover_access', {
      runId: f.runId,
      expectedRevision: 2,
      deviceHash: f.deviceHash,
    });
    expect(recovered.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('NotPrinted');
    expect(
      localOwnerSql(`select state from public.booth_grants where id='${f.grantId}'`)[0].state
    ).toBe('Revoked');
    expect(recovered.data.receipt.result.purpose).toBe('recovery');
    expect(
      (
        await f.admin(
          'recover_access',
          { runId: f.runId, expectedRevision: 2, deviceHash: f.deviceHash },
          recovered.data.receipt.operationId
        )
      ).data.replayed
    ).toBe(true);
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.booth_grants where run_id='${f.runId}'`
      )[0].n
    ).toBe(2);
    localOwnerSql(`delete from auth.sessions where id='${f.adminSessionId}'`);
    const replacementHash = 'b'.repeat(64);
    const handoffId = recovered.data.receipt.result.handoffId;
    expect(
      (
        await f.local.service.rpc('package_issue_handoff', {
          p_handoff_id: handoffId,
          p_device_hash: f.deviceHash,
          p_operation_id: randomUUID(),
          p_grant_hash: replacementHash,
        })
      ).error
    ).toBeNull();
    expect(
      (
        await f.local.service.rpc('package_booth_operation', {
          p_grant_hash: replacementHash,
          p_operation: 'confirm_handoff',
          p_operation_id: randomUUID(),
          p_payload: { handoffId, deviceHash: f.deviceHash },
        })
      ).error
    ).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Paused');
  } finally {
    await f.dispose();
  }
}, 30000);

it('refuses recovery when output may have started or Finish was requested', async () => {
  const f = await createPackageFixture();
  try {
    f.seedRun('Paused');
    const sessionId = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${f.eventId}','${f.runId}',2) returning id`
    )[0].id;
    const captureId = localOwnerSql(
      `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${f.eventId}','${f.runId}','${sessionId}',2,clock_timestamp(),'${randomUUID()}') returning id`
    )[0].id;
    localOwnerSql(
      `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${f.eventId}','${f.runId}','${sessionId}','${captureId}',2,'Guest','Pending','${randomUUID()}','${randomUUID()}')`
    );
    expect(
      (
        await f.admin('recover_access', {
          runId: f.runId,
          expectedRevision: 2,
          deviceHash: f.deviceHash,
        })
      ).error?.message
    ).toBe('print_pending');
    const finish = await f.admin('finish', { runId: f.runId, expectedRevision: 2 });
    expect(finish.error).toBeNull();
    expect(
      (
        await f.admin('recover_access', {
          runId: f.runId,
          expectedRevision: finish.data.revision,
          deviceHash: f.deviceHash,
        })
      ).error?.message
    ).toBe('invalid_transition');
  } finally {
    await f.dispose();
  }
}, 30000);

it('activates a one-use initial handoff only after local sign-out and cannot override a pause', async () => {
  const f = await createPackageFixture();
  try {
    const setup = await f.reportSetup();
    const start = await f.admin('start', {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: f.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    });
    expect(start.error).toBeNull();
    const handoffId = start.data.receipt.result.handoffId;
    const issueKey = randomUUID();
    const issue = () =>
      f.local.service.rpc('package_issue_handoff', {
        p_handoff_id: handoffId,
        p_device_hash: f.deviceHash,
        p_operation_id: issueKey,
        p_grant_hash: f.grantHash,
      });
    expect((await issue()).error?.message).toBe('access_required');
    localOwnerSql(`delete from auth.sessions where id='${f.adminSessionId}'`);
    expect((await issue()).error).toBeNull();
    expect((await f.readBooth()).error?.message).toBe('access_required');
    const body = { handoffId, deviceHash: f.deviceHash };
    expect((await f.booth('confirm_handoff', body)).error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where event_id='${f.eventId}'`)[0].state
    ).toBe('Active');
    expect((await f.booth('confirm_handoff', body)).error?.message).toBe('invalid_transition');
    localOwnerSql(
      `update public.booth_handoffs set expires_at=clock_timestamp()-interval '1 second' where id='${handoffId}'`
    );
    expect((await issue()).error?.message).toBe('access_required');
  } finally {
    await f.dispose();
  }
}, 30000);

it('does not replay an issued handoff after Pause or Finish', async () => {
  const f = await createPackageFixture();
  try {
    const setup = await f.reportSetup();
    const start = await f.admin('start', {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: f.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    });
    expect(start.error).toBeNull();
    const { handoffId, runId } = start.data.receipt.result;
    const key = randomUUID();
    const issue = () =>
      f.local.service.rpc('package_issue_handoff', {
        p_handoff_id: handoffId,
        p_device_hash: f.deviceHash,
        p_operation_id: key,
        p_grant_hash: f.grantHash,
      });
    localOwnerSql(`delete from auth.sessions where id='${f.adminSessionId}'`);
    expect((await issue()).error).toBeNull();
    const confirmKey = randomUUID();
    const confirmBody = { handoffId, deviceHash: f.deviceHash };
    expect((await f.booth('confirm_handoff', confirmBody, confirmKey)).error).toBeNull();
    const signed = await f.local.signIn(f.adminUser);
    const newSessionId = JSON.parse(
      Buffer.from(signed.session.access_token.split('.')[1], 'base64url').toString()
    ).session_id;
    const admin = (operation: string, expectedRevision: number) =>
      f.local.service.rpc('package_admin_operation', {
        p_admin_user_id: f.adminUser.id,
        p_admin_session_id: newSessionId,
        p_operation: operation,
        p_operation_id: randomUUID(),
        p_payload: { eventId: f.eventId, runId, expectedRevision },
      });
    const revision = (
      await f.local.service.rpc('package_admin_read', {
        p_admin_user_id: f.adminUser.id,
        p_admin_session_id: newSessionId,
        p_event_id: f.eventId,
      })
    ).data.revision;
    const paused = await admin('pause', revision);
    expect(paused.error).toBeNull();
    expect((await issue()).error?.message).toBe('access_required');
    expect((await f.booth('confirm_handoff', confirmBody, confirmKey)).error?.message).toBe(
      'access_required'
    );
    const finished = await admin('finish', paused.data.revision);
    expect(finished.error).toBeNull();
    expect((await issue()).error?.message).toBe('access_required');
    expect((await f.booth('confirm_handoff', confirmBody, confirmKey)).error?.message).toBe(
      'access_required'
    );
  } finally {
    await f.dispose();
  }
}, 30000);

it('expires inactive handoff at five minutes and refuses an expired proof', async () => {
  const f = await createPackageFixture();
  try {
    const setup = await f.reportSetup();
    const start = await f.admin('start', {
      expectedRevision: 1,
      readinessWindowId: setup.data.readinessWindowId,
      deviceHash: f.deviceHash,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
    });
    const handoffId = start.data.receipt.result.handoffId;
    localOwnerSql(`delete from auth.sessions where id='${f.adminSessionId}'`);
    localOwnerSql(
      `update public.booth_handoffs set expires_at=clock_timestamp()-interval '1 second' where id='${handoffId}'`
    );
    expect(
      (
        await f.local.service.rpc('package_issue_handoff', {
          p_handoff_id: handoffId,
          p_device_hash: f.deviceHash,
          p_operation_id: randomUUID(),
          p_grant_hash: f.grantHash,
        })
      ).error?.message
    ).toBe('access_required');
    const signed = await f.local.signIn(f.adminUser);
    const sessionId = JSON.parse(
      Buffer.from(signed.session.access_token.split('.')[1], 'base64url').toString()
    ).session_id;
    await f.local.service.rpc('package_admin_read', {
      p_admin_user_id: f.adminUser.id,
      p_admin_session_id: sessionId,
      p_event_id: f.eventId,
    });
    expect(
      localOwnerSql(`select state from public.booth_runs where event_id='${f.eventId}'`)[0].state
    ).toBe('Paused');
  } finally {
    await f.dispose();
  }
}, 30000);
