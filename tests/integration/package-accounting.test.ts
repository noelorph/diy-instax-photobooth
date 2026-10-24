import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createPackageFixture } from '../fixtures/package-contract';
import {
  localOwnerSql,
  localSupabaseStatus,
  ownerInsert,
  ownerUpdate,
} from '../fixtures/local-supabase';

it('counts packages and commits one immutable entry, audit and receipt across retries and concurrent additions', async () => {
  const f = await createPackageFixture({ originalPackages: 5 });
  try {
    ownerUpdate('events', f.eventId, { state: 'Live', revision: 2 });
    const key = randomUUID(),
      payload = { packages: 1, clientRequestNote: 'Client request' };
    const first = await f.admin('add_packages', payload, key);
    expect(first.error).toBeNull();
    expect(first.data.receipt.result).toMatchObject({
      originalPackages: 5,
      additionalPackages: 1,
      totalBookedPrints: 60,
      printed: 0,
      unresolved: 0,
      printsRemaining: 60,
      printsAvailable: 60,
    });
    expect(first.data.receipt.committedRevision).toBe(3);
    const replay = await f.admin('add_packages', payload, key);
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ receipt: first.data.receipt, replayed: true });
    expect((await f.admin('add_packages', { ...payload, packages: 2 }, key)).error?.message).toBe(
      'operation_conflict'
    );
    expect((await f.admin('pause', payload, key)).error?.message).toBe('operation_conflict');
    const concurrentKey = randomUUID();
    const results = await Promise.all([
      f.admin('add_packages', payload, concurrentKey),
      f.admin('add_packages', payload, concurrentKey),
    ]);
    expect(results.map((r) => r.error)).toEqual([null, null]);
    expect(results.map((r) => r.data.replayed).sort()).toEqual([false, true]);
    const distinct = await Promise.all([
      f.admin('add_packages', payload),
      f.admin('add_packages', payload),
    ]);
    expect(distinct.map((r) => r.error)).toEqual([null, null]);
    expect(
      localOwnerSql(
        `select (select count(*)::int from public.additional_film_package_entries where event_id='${f.eventId}') entries,(select count(*)::int from public.operation_receipts where event_id='${f.eventId}') receipts,(select count(*)::int from public.activity_events where event_id='${f.eventId}') audits`
      )
    ).toEqual([{ entries: 4, receipts: 4, audits: 4 }]);
    const lookup = await f.readAdmin(key);
    expect(lookup.error).toBeNull();
    expect(lookup.data.receipt).toEqual(first.data.receipt);
    expect(lookup.data.revision).toBe(6);
    expect(lookup.data.counts.totalBookedPrints).toBe(90);
    await f.adminClient.auth.signOut({ scope: 'global' });
    expect((await f.admin('add_packages', payload, key)).error?.message).toBe('access_required');
  } finally {
    await f.dispose();
  }
}, 30000);

it('allows additions only while Live and rejects invalid input and integer overflow without side effects', async () => {
  const f = await createPackageFixture();
  try {
    const payload = { packages: 1, clientRequestNote: 'Request' };
    expect((await f.admin('add_packages', payload)).error?.message).toBe('invalid_transition');
    ownerUpdate('events', f.eventId, { state: 'Live', revision: 2 });
    for (const packages of [0, -1, 1.5, 214748365, '1', null]) {
      expect((await f.admin('add_packages', { ...payload, packages })).error?.message).toBe(
        'invalid_input'
      );
    }
    for (const clientRequestNote of ['', '  ', null, 7]) {
      expect(
        (await f.admin('add_packages', { ...payload, clientRequestNote })).error?.message
      ).toBe('invalid_input');
    }
    expect((await f.admin('add_packages', { ...payload, extra: true })).error?.message).toBe(
      'invalid_input'
    );
    ownerUpdate('events', f.eventId, { film_package_count: 214748364, revision: 3 });
    expect((await f.admin('add_packages', payload)).error?.message).toBe('invalid_input');
    ownerUpdate('events', f.eventId, { state: 'Completed', revision: 4 });
    expect((await f.admin('add_packages', payload)).error?.message).toBe('invalid_transition');
    ownerUpdate('events', f.eventId, { state: 'Cancelled', revision: 5 });
    expect((await f.admin('add_packages', payload)).error?.message).toBe('invalid_transition');
    expect(
      localOwnerSql(
        `select count(*)::int n from public.operation_receipts where event_id='${f.eventId}'`
      )
    ).toEqual([{ n: 0 }]);
  } finally {
    await f.dispose();
  }
}, 30000);

it('derives counts solely from v2 Guest outcomes and permits additions in Paused and Finished runs', async () => {
  const f = await createPackageFixture({ originalPackages: 5 });
  try {
    expect((await f.readAdmin()).data.counts).toMatchObject({
      totalBookedPrints: 50,
      printsAvailable: 50,
    });
    ownerUpdate('events', f.eventId, { state: 'Live', revision: 2 });
    ownerInsert('booth_runs', {
      id: f.runId,
      event_id: f.eventId,
      accounting_version: 2,
      state: 'Paused',
      device_hash: f.deviceHash,
    });
    const session = ownerInsert('guest_sessions', {
      event_id: f.eventId,
      run_id: f.runId,
      accounting_version: 2,
    }).data.id;
    const capture = ownerInsert('captures', {
      event_id: f.eventId,
      run_id: f.runId,
      session_id: session,
      accounting_version: 2,
      captured_at: new Date().toISOString(),
      shutter_operation_id: randomUUID(),
    }).data.id;
    const attempt = ownerInsert('print_attempts', {
      event_id: f.eventId,
      run_id: f.runId,
      session_id: session,
      capture_id: capture,
      accounting_version: 2,
      kind: 'Guest',
      state: 'Reserved',
      request_key: randomUUID(),
      connection_id: randomUUID(),
    }).data.id;
    for (const state of ['Reserved', 'Dispatching', 'Accepted', 'Pending']) {
      ownerUpdate('print_attempts', attempt, { state });
      expect((await f.readAdmin()).data.counts).toMatchObject({
        printed: 0,
        unresolved: 1,
        printsRemaining: 50,
        printsAvailable: 49,
      });
    }
    ownerUpdate('print_attempts', attempt, { state: 'Printed' });
    expect((await f.readAdmin()).data.counts).toMatchObject({
      printed: 1,
      unresolved: 0,
      printsRemaining: 49,
      printsAvailable: 49,
    });
    ownerUpdate('print_attempts', attempt, { state: 'NotPrinted' });
    ownerInsert('additional_print_entries', {
      event_id: f.eventId,
      quantity: 999,
      actor_id: f.adminUser.id,
    });
    ownerInsert('print_attempts', {
      event_id: f.eventId,
      kind: 'Test',
      state: 'Confirmed',
      request_key: randomUUID(),
      connection_id: randomUUID(),
    });
    expect((await f.readAdmin()).data.counts).toMatchObject({
      printed: 0,
      unresolved: 0,
      printsAvailable: 50,
    });
    expect(
      (await f.admin('add_packages', { packages: 1, clientRequestNote: ' Request ' })).error
    ).toBeNull();
    ownerUpdate('booth_runs', f.runId, { state: 'Finished' });
    const added = await f.admin('add_packages', { packages: 1, clientRequestNote: 'Request' });
    expect(added.error).toBeNull();
    expect(added.data.receipt.result.totalBookedPrints).toBe(70);
    expect(localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)).toEqual([
      { state: 'Finished' },
    ]);
    for (const client of [f.local.client(), f.adminClient]) {
      expect(
        (
          await client.rpc('package_admin_read', {
            p_admin_user_id: f.adminUser.id,
            p_admin_session_id: f.adminSessionId,
            p_event_id: f.eventId,
          })
        ).error?.code
      ).toBe('42501');
    }
    const entryId = added.data.receipt.result.entryId;
    ownerUpdate('events', f.eventId, { state: 'Completed', revision: 5 });
    for (const client of [f.local.client(), f.adminClient, f.local.service]) {
      expect(
        (
          await client
            .from('additional_film_package_entries')
            .update({ packages: 2 })
            .eq('id', entryId)
        ).error?.code
      ).toBe('42501');
      expect(
        (await client.from('additional_film_package_entries').delete().eq('id', entryId)).error
          ?.code
      ).toBe('42501');
    }
  } finally {
    await f.dispose();
  }
}, 30000);

it('normalizes whole JSON decimal packages before committing and replaying receipts', async () => {
  const f = await createPackageFixture();
  try {
    ownerUpdate('events', f.eventId, { state: 'Live', revision: 2 });
    const key = randomUUID();
    const args = {
      p_admin_user_id: f.adminUser.id,
      p_admin_session_id: f.adminSessionId,
      p_operation: 'add_packages',
      p_operation_id: key,
      p_payload: { eventId: f.eventId, packages: 1, clientRequestNote: 'Request' },
    };
    const raw = JSON.stringify(args).replace('"packages":1', '"packages":1.0');
    const { API_URL, SERVICE_ROLE_KEY } = localSupabaseStatus();
    const response = await fetch(`${API_URL}/rest/v1/rpc/package_admin_operation`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: raw,
    });
    const first = await response.json();
    expect(response.status, JSON.stringify(first)).toBe(200);
    const replay = await f.admin('add_packages', args.p_payload, key);
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ receipt: first.receipt, replayed: true });
    expect(
      (await f.admin('add_packages', { packages: 2, clientRequestNote: 'Request' }, key)).error
        ?.message
    ).toBe('operation_conflict');
    expect(
      localOwnerSql(
        `select count(*)::int n from public.additional_film_package_entries where event_id='${f.eventId}'`
      )
    ).toEqual([{ n: 1 }]);
  } finally {
    await f.dispose();
  }
}, 30000);
