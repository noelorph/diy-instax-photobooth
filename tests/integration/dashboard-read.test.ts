// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { cleanupEvents, localOwnerSql, ownerInsert, ownerUpdate } from '../fixtures/local-supabase';
import { createPackageFixture } from '../fixtures/package-contract';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { readDashboard } from '@/features/admin/dashboard/read';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/operations/privileged-client', () => ({ createPrivilegedClient: vi.fn() }));
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: vi.fn() }));
vi.setConfig({ testTimeout: 30000 });
const now = '2026-11-06T12:00:00Z';
async function fixture() {
  const f = await createPackageFixture({ originalPackages: 5 });
  vi.mocked(createClient).mockResolvedValue(f.adminClient);
  vi.mocked(createPrivilegedClient).mockReturnValue(f.local.service);
  vi.mocked(requireAdmin).mockResolvedValue({
    userId: f.adminUser.id,
    sessionId: f.adminSessionId,
  });
  return f;
}
it('monthly Events includes Draft Live Completed and excludes Cancelled', async () => {
  const f = await fixture();
  const extra = [randomUUID(), randomUUID(), randomUUID()];
  try {
    ownerUpdate('events', f.eventId, {
      revision: 2,
      starts_at: now,
      ends_at: '2026-11-06T14:00:00Z',
    });
    for (const [index, state] of ['Live', 'Completed', 'Cancelled'].entries())
      ownerInsert('events', {
        id: extra[index],
        accounting_version: 2,
        state,
        title: state,
        client_name: 'Client',
        client_email: 'test@example.test',
        client_phone: '123',
        starts_at: now,
        ends_at: '2026-11-06T14:00:00Z',
        time_zone: 'Asia/Manila',
        venue_address: 'Hall',
        film_package_count: 1,
      });
    ownerInsert(
      'activity_events',
      Array.from({ length: 26 }, () => ({
        event_id: f.eventId,
        accounting_version: 2,
        actor_scope: 'admin:fixture',
        operation_kind: 'create_draft',
        created_at: now,
      }))
    );
    const result = await readDashboard({ now, activityDays: 7, page: 0 });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.summary.monthEvents).toBe(3);
    expect(result.summary.totalBookedEvents).toBe(3);
    expect(result.activity).toHaveLength(25);
    expect(result.hasNextPage).toBe(true);
    expect(result.activity[0]).not.toHaveProperty('client_email');
    ownerUpdate('events', f.eventId, { state: 'Cancelled', revision: 3 });
    const cancelled = await readDashboard({ now, activityDays: 7, page: 0 });
    expect(cancelled.status === 'success' && cancelled.summary).toMatchObject({
      monthEvents: 2,
      totalBookedEvents: 2,
    });
    expect(
      (await f.local.service.from('events').select('id').eq('state', 'Cancelled')).data
    ).toHaveLength(2);
  } finally {
    cleanupEvents(extra);
    await f.dispose();
  }
});

it('uses venue-local month boundaries through DST and orders future Draft/Live starts by instant then ID', async () => {
  const f = await fixture();
  const ids = Array.from({ length: 5 }, () => randomUUID()).sort();
  try {
    ownerUpdate('events', f.eventId, { state: 'Cancelled', revision: 2 });
    ownerInsert(
      'events',
      ids.map((id, index) => ({
        id,
        accounting_version: 2,
        state: index === 4 ? 'Completed' : 'Draft',
        title: `Event ${index}`,
        client_name: 'Client',
        client_email: 'test@example.test',
        client_phone: '123',
        venue_address: 'Hall',
        film_package_count: 1,
        time_zone: 'America/New_York',
        starts_at: [
          '2026-11-01T03:59:59Z',
          '2026-11-01T04:00:00Z',
          '2026-12-01T04:59:59Z',
          '2026-12-01T04:59:59Z',
          '2026-12-01T05:00:00Z',
        ][index],
        ends_at: '2026-12-02T08:00:00Z',
      }))
    );
    const result = await readDashboard({ now, activityDays: 7, page: 0 });
    expect(result.status === 'success' && result.summary).toMatchObject({
      monthEvents: 3,
      totalBookedEvents: 5,
      upcomingEvents: 2,
      nextEvent: { id: ids[2] },
    });
    const boundary = await readDashboard({ now: '2026-11-01T03:59:59Z', activityDays: 7, page: 0 });
    expect(boundary.status === 'success' && boundary.summary.monthEvents).toBe(1);
  } finally {
    cleanupEvents(ids);
    await f.dispose();
  }
});

it('retains safe activity across tied timestamps and 7/30-day inclusion boundaries with stable pages', async () => {
  const f = await fixture();
  try {
    ownerUpdate('events', f.eventId, {
      deleted_at: now,
      revision: 2,
      title: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      venue_address: null,
      time_zone: null,
      starts_at: null,
      ends_at: null,
      media_removal_state: 'complete',
    });
    const ids = Array.from({ length: 27 }, () => randomUUID())
      .sort()
      .reverse();
    ownerInsert(
      'activity_events',
      ids.map((id) => ({
        id,
        event_id: f.eventId,
        accounting_version: 2,
        actor_scope: 'admin:test',
        operation_kind: 'unknown_future_action',
        created_at: now,
      }))
    );
    const boundaries = [
      ['2026-10-30T12:00:00Z', 'seven_in'],
      ['2026-10-30T11:59:59.999Z', 'seven_out'],
      ['2026-10-07T12:00:00Z', 'thirty_in'],
      ['2026-10-07T11:59:59.999Z', 'thirty_out'],
      ['2026-11-06T12:00:00.001Z', 'future'],
    ];
    ownerInsert(
      'activity_events',
      boundaries.map(([created_at, operation_kind]) => ({
        event_id: f.eventId,
        accounting_version: 2,
        actor_scope: 'admin:test',
        operation_kind,
        created_at,
      }))
    );
    const first = await readDashboard({ now, activityDays: 7, page: 0 });
    const again = await readDashboard({ now, activityDays: 7, page: 0 });
    const second = await readDashboard({ now, activityDays: 7, page: 1 });
    const thirty = await readDashboard({ now, activityDays: 30, page: 1 });
    expect(first).toEqual(again);
    expect(first.status).toBe('success');
    if (first.status !== 'success' || second.status !== 'success' || thirty.status !== 'success')
      throw new Error('Dashboard read unavailable');
    expect(first.activity).toHaveLength(25);
    expect(first.hasNextPage).toBe(true);
    expect(first.activity[0]).not.toHaveProperty('client_email');
    expect(Object.keys(first.activity[0]).sort()).toEqual([
      'eventId',
      'id',
      'occurredAt',
      'operationKind',
    ]);
    expect(first.activity.map((item) => item.id)).toEqual(ids.slice(0, 25));
    expect(first.activity.every((item) => item.eventId === null)).toBe(true);
    expect(second.activity.map((item) => item.operationKind)).toEqual([
      'unknown_future_action',
      'unknown_future_action',
      'seven_in',
    ]);
    expect(second.hasNextPage).toBe(false);
    expect(thirty.activity.map((item) => item.operationKind)).toEqual([
      'unknown_future_action',
      'unknown_future_action',
      'seven_in',
      'seven_out',
      'thirty_in',
    ]);
    expect(await readDashboard({ now, activityDays: 99 as 7, page: -1 })).toEqual(first);
    expect(await readDashboard({ now, activityDays: 7, page: Number.MAX_SAFE_INTEGER })).toEqual(
      first
    );
  } finally {
    await f.dispose();
  }
});

it('does not silently cap booked and monthly summaries and excludes deleted Drafts', async () => {
  const f = await fixture();
  const ids = Array.from({ length: 1001 }, () => randomUUID());
  try {
    ownerUpdate('events', f.eventId, {
      deleted_at: now,
      revision: 2,
      title: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      venue_address: null,
      time_zone: null,
      starts_at: null,
      ends_at: null,
      media_removal_state: 'complete',
    });
    for (let offset = 0; offset < ids.length; offset += 100)
      ownerInsert(
        'events',
        ids.slice(offset, offset + 100).map((id) => ({
          id,
          accounting_version: 2,
          state: 'Draft',
          title: 'Bulk fixture',
          client_name: 'Client',
          client_email: 'test@example.test',
          client_phone: '123',
          starts_at: now,
          ends_at: '2026-11-06T14:00:00Z',
          time_zone: 'Asia/Manila',
          venue_address: 'Hall',
          film_package_count: 0,
        }))
      );
    const result = await readDashboard({ now, activityDays: 7, page: 0 });
    expect(result.status === 'success' && result.summary).toMatchObject({
      monthEvents: 1001,
      totalBookedEvents: 1001,
      upcomingEvents: 0,
      nextEvent: null,
    });
    expect(result.status === 'success' && result.liveEvent).toBeNull();
  } finally {
    try {
      for (let offset = 0; offset < ids.length; offset += 100)
        cleanupEvents(ids.slice(offset, offset + 100));
    } finally {
      await f.dispose();
    }
  }
}, 90000);

it('reads authoritative Live counts and Active Paused Finished and no-run states', async () => {
  const f = await fixture();
  try {
    ownerUpdate('events', f.eventId, { state: 'Live', revision: 2 });
    let result = await readDashboard({ now, activityDays: 7, page: 0 });
    expect(result.status === 'success' && result.liveEvent?.runState).toBeNull();
    ownerInsert('booth_runs', {
      id: f.runId,
      event_id: f.eventId,
      accounting_version: 2,
      state: 'Active',
      device_hash: f.deviceHash,
      printer_id: 'fixture-printer',
    });
    ownerInsert('additional_film_package_entries', {
      event_id: f.eventId,
      packages: 1,
      client_request_note: 'Client requested one package',
      actor_id: f.adminUser.id,
      operation_key: randomUUID(),
    });
    localOwnerSql(`insert into public.guest_sessions(id,event_id,run_id,accounting_version,state,closed_at) select gen_random_uuid(),'${f.eventId}','${f.runId}',2,'Printed',now() from generate_series(1,38);
      insert into public.captures(id,event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) select gen_random_uuid(),event_id,run_id,id,2,now(),gen_random_uuid() from public.guest_sessions where event_id='${f.eventId}';
      insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) select event_id,run_id,session_id,id,2,'Guest',case when row_number() over(order by id)=38 then 'Pending' else 'Printed' end,gen_random_uuid(),gen_random_uuid() from public.captures where event_id='${f.eventId}';`);
    for (const state of ['Active', 'Paused', 'Finished']) {
      ownerUpdate('booth_runs', f.runId, { state });
      result = await readDashboard({ now, activityDays: 7, page: 0 });
      expect(result.status === 'success' && result.liveEvent).toMatchObject({
        id: f.eventId,
        runState: state,
        counts: {
          originalPackages: 5,
          additionalPackages: 1,
          totalBookedPrints: 60,
          printed: 37,
          unresolved: 1,
          printsAvailable: 22,
        },
      });
    }
    await f.adminClient.auth.signOut({ scope: 'global' });
    expect((await readDashboard({ now, activityDays: 7, page: 0 })).status).toBe('unavailable');
  } finally {
    await f.dispose();
  }
});

it('returns unavailable rather than invented zero summaries when a required database read fails', async () => {
  const f = await fixture();
  try {
    localOwnerSql('revoke select on public.activity_events from authenticated');
    expect(await readDashboard({ now, activityDays: 7, page: 0 })).toEqual({
      status: 'unavailable',
      error: 'Unable to load Dashboard. Reload to try again.',
    });
  } finally {
    localOwnerSql('grant select on public.activity_events to authenticated');
    await f.dispose();
  }
});

it('returns unavailable when an authorized Live package-count dependency fails while Event and activity reads succeed', async () => {
  const f = await fixture();
  const activityId = randomUUID();
  try {
    f.seedRun('Active');
    ownerInsert('activity_events', {
      id: activityId,
      event_id: f.eventId,
      accounting_version: 2,
      actor_scope: 'admin:fixture',
      operation_kind: 'start',
      created_at: now,
    });
    const before = await readDashboard({ now, activityDays: 7, page: 0 });
    expect(before.status === 'success' && before.liveEvent).toMatchObject({
      id: f.eventId,
      counts: { totalBookedPrints: 50 },
    });
    localOwnerSql(
      'revoke execute on function public.package_admin_read(uuid,uuid,uuid,uuid) from service_role'
    );
    const event = await f.adminClient
      .from('events')
      .select('id,state')
      .eq('id', f.eventId)
      .single();
    const activity = await f.adminClient
      .from('activity_events')
      .select('id')
      .eq('id', activityId)
      .single();
    expect(event.error).toBeNull();
    expect(event.data).toEqual({ id: f.eventId, state: 'Live' });
    expect(activity.error).toBeNull();
    expect(activity.data).toEqual({ id: activityId });
    expect((await f.readAdmin()).error).not.toBeNull();
    expect(await readDashboard({ now, activityDays: 7, page: 0 })).toEqual({
      status: 'unavailable',
      error: 'Unable to load Dashboard. Reload to try again.',
    });
  } finally {
    try {
      localOwnerSql(
        'grant execute on function public.package_admin_read(uuid,uuid,uuid,uuid) to service_role'
      );
      expect((await f.readAdmin()).error).toBeNull();
    } finally {
      await f.dispose();
    }
  }
});
