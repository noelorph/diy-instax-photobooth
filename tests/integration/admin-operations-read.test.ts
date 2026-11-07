// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  localSupabase,
  ownerInsert,
  ownerUpdate,
  cleanupEvents,
  localOwnerSql,
} from '../fixtures/local-supabase';
import { createPackageFixture } from '../fixtures/package-contract';
import { getOperationalEvent, listLiveEvents } from '@/features/admin/operations/read';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { listHistory, getHistoryEvent } from '@/lib/events/history';
import { packageCounts } from '@/lib/operations/package-contract';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/operations/privileged-client', () => ({ createPrivilegedClient: vi.fn() }));
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: vi.fn() }));
const local = localSupabase();
afterEach(async () => {
  await local.cleanup();
});

it('reads real package totals independently of the attempt page, including the last pending print', async () => {
  const f = await createPackageFixture({ originalPackages: 5 });
  try {
    vi.mocked(createClient).mockResolvedValue(f.adminClient);
    vi.mocked(createPrivilegedClient).mockReturnValue(f.local.service);
    vi.mocked(requireAdmin).mockResolvedValue({
      userId: f.adminUser.id,
      sessionId: f.adminSessionId,
    });
    f.seedRun('Paused');
    localOwnerSql(`insert into public.guest_sessions(id,event_id,run_id,accounting_version,state,closed_at) select gen_random_uuid(),'${f.eventId}','${f.runId}',2,'Printed',now() from generate_series(1,150);
      insert into public.captures(id,event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) select gen_random_uuid(),event_id,run_id,id,2,now(),gen_random_uuid() from public.guest_sessions where event_id='${f.eventId}';
      insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id,created_at) select event_id,run_id,session_id,id,2,'Guest',case when row_number() over(order by id)=50 then 'Pending' when row_number() over(order by id)<50 then 'Printed' else 'NotPrinted' end,gen_random_uuid(),gen_random_uuid(),now() - row_number() over(order by id) * interval '1 minute' from public.captures where event_id='${f.eventId}';
`);
    const oracle = packageCounts(5, 0, 49, 1);
    expect(oracle).toMatchObject({
      totalBookedPrints: 50,
      printed: 49,
      unresolved: 1,
      printsRemaining: 1,
      printsAvailable: 0,
    });
    const server = await f.readAdmin();
    expect(server.error).toBeNull();
    expect(server.data.counts).toEqual(oracle);
    const first = await getOperationalEvent(f.eventId),
      older = await getOperationalEvent(f.eventId, 1);
    expect(first.status).toBe('success');
    expect(older.status).toBe('success');
    if (first.status === 'success' && older.status === 'success') {
      expect(first.adminUserId).toBe(f.adminUser.id);
      expect(older.adminUserId).toBe(f.adminUser.id);
      expect(first.event.counts).toEqual(server.data.counts);
      expect(older.event.counts).toEqual(server.data.counts);
      expect(older.event.possibleDelivery).toBe(true);
      expect(first.event.runId).toBe(f.runId);
      expect(first.event.runState).toBe('Paused');
      expect(first.event.resumeAllowed).toBe(false);
      expect(first.event.blockers).toContain('print_pending');
      expect(first.event.captures).toBe(150);
      expect(first.event.attempts).toHaveLength(100);
      expect(first.event.hasOlderAttempts).toBe(true);
      expect(older.event.attempts).toHaveLength(50);
      expect(older.event.hasOlderAttempts).toBe(false);
      expect(first.event.attempts.some((a) => a.state === 'Pending')).toBe(true);
      expect(first.event).not.toHaveProperty('onHand');
      expect(first.event).not.toHaveProperty('originalAllowance');
    }
    expect((await getOperationalEvent(randomUUID())).status).toBe('not_found');
    const addition = await f.admin('add_packages', {
      packages: 2,
      clientRequestNote: 'Client requested more film',
    });
    expect(addition.error).toBeNull();
    const added = await getOperationalEvent(f.eventId);
    expect(added.status).toBe('success');
    if (added.status === 'success') expect(added.event.counts).toEqual(packageCounts(5, 2, 49, 1));
    await f.adminClient.auth.signOut({ scope: 'global' });
    expect((await getOperationalEvent(f.eventId)).status).toBe('unavailable');
  } finally {
    await f.dispose();
  }
}, 30000);
it('returns unavailable without fabricated counts when authorization cannot be read', async () => {
  vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('Unavailable'));
  expect(await getOperationalEvent(randomUUID())).toEqual({
    status: 'unavailable',
    error: 'Unable to load Event operations. Reload to try again.',
  });
});

it('excludes legacy Live Events while preserving current additional package totals', async () => {
  const admin = await local.provisionUser();
  expect((await local.allowlist(admin.id)).error).toBeNull();
  const signed = await local.signIn(admin);
  vi.mocked(createClient).mockResolvedValue(signed.client);
  const [legacyId, currentId] = [randomUUID(), randomUUID()];
  const ids = [legacyId, currentId];
  const booking = {
    client_name: 'Client',
    client_email: 'live-read@example.test',
    client_phone: '123',
    venue_address: 'Hall',
    time_zone: 'Asia/Manila',
    starts_at: '2026-11-01T10:00:00Z',
    ends_at: '2026-11-01T11:00:00Z',
  };
  try {
    ownerInsert('events', {
      id: legacyId,
      ...booking,
      title: 'Legacy Live',
      accounting_version: 1,
      film_package_count: 2,
      original_print_allowance: 17,
    });
    ownerInsert('events', {
      id: currentId,
      ...booking,
      title: 'Current Live',
      accounting_version: 2,
      film_package_count: 3,
    });
    ownerUpdate('events', legacyId, { state: 'Live', revision: 2 });
    const visible = await signed.client.from('events').select('id').in('id', ids);
    expect(visible.error).toBeNull();
    expect(visible.data?.map((row) => row.id).sort()).toEqual([...ids].sort());
    expect(await listLiveEvents()).toEqual({ status: 'success', events: [] });
    ownerUpdate('events', legacyId, { state: 'Cancelled', revision: 3 });
    ownerUpdate('events', currentId, { state: 'Live', revision: 2 });
    ownerInsert('additional_film_package_entries', {
      event_id: currentId,
      packages: 2,
      client_request_note: 'Client requested two more packages',
      actor_id: admin.id,
      operation_key: randomUUID(),
    });
    expect(await listLiveEvents()).toEqual({
      status: 'success',
      events: [
        {
          id: currentId,
          title: 'Current Live',
          venueAddress: 'Hall',
          timeZone: 'Asia/Manila',
          startsAtUtc: '2026-11-01T10:00:00+00:00',
          endsAtUtc: '2026-11-01T11:00:00+00:00',
          filmPackageCount: 5,
          state: 'Live',
        },
      ],
    });
  } finally {
    cleanupEvents(ids);
  }
});

it('distinguishes a known unsent reservation from possible delivery in the recovery read model', async () => {
  const f = await createPackageFixture();
  try {
    vi.mocked(createClient).mockResolvedValue(f.adminClient);
    vi.mocked(createPrivilegedClient).mockReturnValue(f.local.service);
    vi.mocked(requireAdmin).mockResolvedValue({
      userId: f.adminUser.id,
      sessionId: f.adminSessionId,
    });

    f.seedRun('Paused');
    const sessionId = localOwnerSql(
      `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${f.eventId}','${f.runId}',2) returning id`
    )[0].id;
    const captureId = localOwnerSql(
      `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${f.eventId}','${f.runId}','${sessionId}',2,clock_timestamp(),gen_random_uuid()) returning id`
    )[0].id;
    localOwnerSql(
      `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${f.eventId}','${f.runId}','${sessionId}','${captureId}',2,'Guest','Reserved',gen_random_uuid(),gen_random_uuid())`
    );
    const current = await getOperationalEvent(f.eventId);
    expect(current.status).toBe('success');
    if (current.status === 'success') {
      expect(current.event.counts.unresolved).toBe(1);
      expect(current.event.possibleDelivery).toBe(false);
    }
  } finally {
    await f.dispose();
  }
}, 30000);

it('projects equipment observations with their original expiry and rejects a mismatched generation', async () => {
  const f = await createPackageFixture();
  try {
    vi.mocked(createClient).mockResolvedValue(f.adminClient);
    vi.mocked(createPrivilegedClient).mockReturnValue(f.local.service);
    vi.mocked(requireAdmin).mockResolvedValue({
      userId: f.adminUser.id,
      sessionId: f.adminSessionId,
    });
    f.seedRun('Paused');
    const at = new Date().toISOString();
    const observation = {
      cameraLive: true,
      cameraPermission: true,
      printerConnected: false,
      serverReachable: true,
      printerReady: false,
      oldJobCleared: true,
      connectionGeneration: 0,
    };
    ownerUpdate('booth_runs', f.runId, {
      readiness_observation: observation,
      observed_at: at,
      received_at: at,
    });
    const read = await getOperationalEvent(f.eventId);
    expect(read.status).toBe('success');
    if (read.status !== 'success') throw new Error('Equipment projection failed');
    expect(read.event.equipment).toEqual({
      cameraLive: true,
      printerConnected: false,
      serverReachable: true,
      filmLoaded: true,
      expiresAt: new Date(Date.parse(at) + 5000).toISOString(),
    });
    ownerUpdate('booth_runs', f.runId, { connection_generation: 1 });
    const mismatched = await getOperationalEvent(f.eventId);
    expect(mismatched.status).toBe('success');
    if (mismatched.status === 'success') expect(mismatched.event.equipment?.expiresAt).toBeNull();
  } finally {
    await f.dispose();
  }
}, 30000);

it('History filters retain immutable package records', async () => {
  const f = await createPackageFixture({ originalPackages: 3 });
  const [cancelledId, deletedId, legacyId] = [randomUUID(), randomUUID(), randomUUID()];
  try {
    vi.mocked(createClient).mockResolvedValue(f.adminClient);
    vi.mocked(createPrivilegedClient).mockReturnValue(f.local.service);
    vi.mocked(requireAdmin).mockResolvedValue({
      userId: f.adminUser.id,
      sessionId: f.adminSessionId,
    });
    f.seedRun('Finished');
    ownerInsert('additional_film_package_entries', {
      event_id: f.eventId,
      packages: 2,
      client_request_note: 'Client requested two packages',
      actor_id: f.adminUser.id,
      operation_key: randomUUID(),
    });
    localOwnerSql(`insert into public.guest_sessions(id,event_id,run_id,accounting_version,state,closed_at) select gen_random_uuid(),'${f.eventId}','${f.runId}',2,'Printed',now() from generate_series(1,13);
      insert into public.captures(id,event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) select gen_random_uuid(),event_id,run_id,id,2,now(),gen_random_uuid() from public.guest_sessions where event_id='${f.eventId}';
      insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) select event_id,run_id,session_id,id,2,'Guest','Printed',gen_random_uuid(),gen_random_uuid() from public.captures where event_id='${f.eventId}';
      insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state,evidence_kind,evidence_policy_version,reason) select id,2,'admin:fixture','Diagnostic','inspection','simulator-v1','Sheet fully ejected but image unusable' from public.print_attempts where event_id='${f.eventId}' limit 1;
      insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) select event_id,run_id,id,2,now()+interval '1 second',gen_random_uuid() from public.guest_sessions where event_id='${f.eventId}' limit 1;
      insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind,created_at) select '${f.eventId}',2,'admin:fixture','observe','2026-01-01T10:00:00Z' from generate_series(1,27);`);
    // One fully ejected sheet was unusable; quality does not refund a Confirmed Print.
    ownerUpdate('events', f.eventId, { state: 'Completed', revision: 3 });
    for (const [id, state, version] of [
      [cancelledId, 'Cancelled', 2],
      [deletedId, 'Draft', 2],
      [legacyId, 'Completed', 1],
    ] as const) {
      ownerInsert('events', {
        id,
        accounting_version: version,
        state,
        title: 'Other booking',
        client_name: 'Retained client',
        client_email: 'retained@example.test',
        client_phone: '123',
        venue_address: 'Hall',
        time_zone: 'Asia/Manila',
        starts_at: '2026-12-01T10:00:00Z',
        ends_at: '2026-12-01T12:00:00Z',
        film_package_count: 2,
        ...(version === 1 ? { original_print_allowance: 17 } : {}),
        ...(id === deletedId
          ? {
              deleted_at: new Date().toISOString(),
              title: null,
              client_name: null,
              client_email: null,
              client_phone: null,
              venue_address: null,
              time_zone: null,
              starts_at: null,
              ends_at: null,
              media_removal_state: 'complete',
            }
          : {}),
      });
    }
    const all = await listHistory();
    expect(all.status).toBe('success');
    if (all.status !== 'success') throw new Error('History unavailable');
    expect(all.events.map((event) => event.id).sort()).toEqual([f.eventId, cancelledId].sort());
    const completed = all.events.find((event) => event.id === f.eventId)!;
    expect(completed.counts).toMatchObject({
      originalPackages: 3,
      additionalPackages: 2,
      totalBookedPrints: 50,
      printed: 13,
      unresolved: 0,
      printsRemaining: 37,
    });
    expect(completed.counts).not.toHaveProperty('originalPrintAllowance');
    expect(completed).toMatchObject({
      client_name: 'Client',
      client_email: 'package@example.test',
      client_phone: '123',
      venue_address: 'Hall',
      time_zone: 'Asia/Manila',
      starts_at: '2026-12-01T10:00:00+00:00',
      ends_at: '2026-12-01T12:00:00+00:00',
    });
    for (const [filter, id] of [
      ['Completed', f.eventId],
      ['Cancelled', cancelledId],
    ] as const) {
      const filtered = await listHistory(filter);
      expect(filtered.status).toBe('success');
      if (filtered.status === 'success')
        expect(filtered.events.map((event) => event.id)).toEqual([id]);
    }
    const detail = await getHistoryEvent(f.eventId);
    const older = await getHistoryEvent(f.eventId, 1);
    expect(detail.status).toBe('success');
    expect(older.status).toBe('success');
    if (detail.status !== 'success' || older.status !== 'success')
      throw new Error('Detail unavailable');
    expect(detail.event).toEqual(completed);
    expect(detail.captures).toBe(14);
    expect(detail.mediaAssetCount).toBe(0);
    expect(detail.activity).toHaveLength(25);
    expect(detail.hasNextPage).toBe(true);
    expect(older.activity).toHaveLength(2);
    expect(older.hasNextPage).toBe(false);
    expect([...detail.activity, ...older.activity].map((item) => item.id)).toEqual(
      [...detail.activity, ...older.activity]
        .map((item) => item.id)
        .sort()
        .reverse()
    );
    expect(detail.activity[0].occurredAt).toBe('2026-01-01T10:00:00+00:00');
    expect(detail.activity[0]).not.toHaveProperty('actor_scope');
    expect(await getHistoryEvent(f.eventId, -1)).toEqual(detail);
    expect(await getHistoryEvent(f.eventId, Number.MAX_SAFE_INTEGER)).toEqual(detail);
    expect((await getHistoryEvent(cancelledId)).status).toBe('success');
    for (const id of [deletedId, legacyId, randomUUID()])
      expect(await getHistoryEvent(id)).toEqual({ status: 'not_found' });
    for (const operation of ['add_packages', 'complete', 'cancel', 'begin_delete_draft']) {
      const payload =
        operation === 'add_packages'
          ? { packages: 1, clientRequestNote: 'Denied terminal mutation' }
          : { expectedRevision: 3 };
      expect((await f.admin(operation, payload)).error?.message).toBe('invalid_transition');
    }
    await f.adminClient.auth.signOut({ scope: 'global' });
    expect((await getHistoryEvent(f.eventId)).status).not.toBe('success');
  } finally {
    cleanupEvents([cancelledId, deletedId, legacyId]);
    await f.dispose();
  }
}, 30000);

it('terminal media state never treats a failed read as no attachment', async () => {
  const f = await createPackageFixture();
  try {
    vi.mocked(createClient).mockResolvedValue(f.adminClient);
    vi.mocked(createPrivilegedClient).mockReturnValue(f.local.service);
    vi.mocked(requireAdmin).mockResolvedValue({
      userId: f.adminUser.id,
      sessionId: f.adminSessionId,
    });
    ownerUpdate('events', f.eventId, { state: 'Cancelled', revision: 2 });
    const empty = await getHistoryEvent(f.eventId);
    expect(empty).toMatchObject({ status: 'success', mediaAssetCount: 0 });
    expect(await listHistory('Completed')).toEqual({ status: 'success', events: [] });
    for (const [kind, state] of [
      ['background', 'attached'],
      ['montage', 'uploading'],
    ] as const) {
      const id = randomUUID();
      ownerInsert('event_media_assets', {
        id,
        event_id: f.eventId,
        kind,
        state,
        path: `${f.eventId}/${id}`,
        uploaded_by: f.adminUser.id,
        ...(state === 'attached' ? { content_type: 'image/jpeg', byte_length: 123 } : {}),
      });
    }
    const attached = await getHistoryEvent(f.eventId);
    expect(attached).toMatchObject({ status: 'success', mediaAssetCount: 1 });
    expect(JSON.stringify(attached)).not.toMatch(/signed|storage\/v1|uploaded_by|path/);
    localOwnerSql('revoke select on public.event_media_assets from authenticated');
    try {
      expect(await getHistoryEvent(f.eventId)).toEqual({
        status: 'unavailable',
        error: 'Unable to load Events. Try again.',
      });
    } finally {
      localOwnerSql('grant select on public.event_media_assets to authenticated');
    }
    localOwnerSql(
      'revoke execute on function public.package_admin_read(uuid,uuid,uuid,uuid) from service_role'
    );
    try {
      expect((await listHistory()).status).toBe('unavailable');
      expect((await getHistoryEvent(f.eventId)).status).toBe('unavailable');
    } finally {
      localOwnerSql(
        'grant execute on function public.package_admin_read(uuid,uuid,uuid,uuid) to service_role'
      );
    }
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('Revoked Admin'));
    expect((await getHistoryEvent(f.eventId)).status).toBe('unavailable');
  } finally {
    await f.dispose();
  }
}, 30000);
