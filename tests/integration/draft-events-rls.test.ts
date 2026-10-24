// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseDraftEventInput } from '@/features/admin/events/draft-event.schema';
import { localSupabase, cleanupEvents } from '../fixtures/local-supabase';

const booking = {
  title: 'Evening celebration',
  client_name: 'Alex Client',
  client_email: 'alex@example.test',
  client_phone: '+639171234567',
  venue_address: 'Manila venue',
  time_zone: 'Asia/Manila',
  starts_at: '2026-12-01T10:00:00+00:00',
  ends_at: '2026-12-01T12:00:00+00:00',
  film_package_count: 0,
  original_print_allowance: 0,
};

describe('Draft Event storage through local Auth and the Data API', () => {
  let local: ReturnType<typeof localSupabase>;
  const eventIds: string[] = [];
  beforeAll(() => {
    local = localSupabase();
  });
  afterEach(async () => {
    if (eventIds.length) {
      cleanupEvents(eventIds.splice(0));
    }
    await local.cleanup();
  });

  async function admin() {
    const user = await local.provisionUser();
    expect((await local.allowlist(user.id)).error).toBeNull();
    return { ...(await local.signIn(user)), user };
  }

  function payload(overrides: Record<string, unknown> = {}) {
    const id = randomUUID();
    eventIds.push(id);
    return { ...booking, id, ...overrides };
  }

  async function create(client: SupabaseClient) {
    const result = await client.from('events').insert(payload()).select().single();
    expect(result.error).toBeNull();
    return result.data!;
  }

  it('persists parsed booking values, defaults to Draft revision 1, and edits every booking field', async () => {
    const first = await admin();
    const parsed = parseDraftEventInput({
      title: 'Evening celebration',
      clientName: 'Alex Client',
      clientEmail: 'alex@example.test',
      clientPhone: '+639171234567',
      venueAddress: 'Manila venue',
      timeZone: 'Asia/Manila',
      startsAtLocal: '2026-12-01T18:00',
      endsAtLocal: '2026-12-01T20:00',
      filmPackageCount: 0,
      originalPrintAllowance: 0,
    });
    const inserted = await first.client
      .from('events')
      .insert(
        payload({
          starts_at: parsed.startsAtUtc,
          ends_at: parsed.endsAtUtc,
        })
      )
      .select()
      .single();
    expect(inserted.error).toBeNull();
    expect(inserted.data).toMatchObject({ ...booking, state: 'Draft', revision: 1 });
    const changes = {
      title: 'Updated celebration',
      client_name: 'Robin Client',
      client_email: 'robin@example.test',
      client_phone: '+12025550123',
      venue_address: 'New York venue',
      time_zone: 'America/New_York',
      starts_at: '2026-12-02T17:00:00+00:00',
      ends_at: '2026-12-02T20:00:00+00:00',
      film_package_count: 3,
      original_print_allowance: 17,
      revision: 2,
    };
    const changed = await first.client
      .from('events')
      .update(changes)
      .eq('id', inserted.data!.id)
      .eq('revision', 1)
      .select()
      .single();
    expect(changed.error).toBeNull();
    const fresh = await local.signIn(first.user);
    const read = await fresh.client.from('events').select().eq('id', inserted.data!.id).single();
    expect(read.error).toBeNull();
    expect(read.data).toMatchObject({ ...changes, state: 'Draft' });
    expect((await fresh.client.from('events').select().eq('id', randomUUID())).data).toEqual([]);
  });

  it('retains independent Client snapshots for two Events', async () => {
    const { client } = await admin();
    const first = await create(client);
    const second = await create(client);
    expect(
      (
        await client
          .from('events')
          .update({
            client_name: 'Changed',
            client_email: 'changed@example.test',
            client_phone: '123',
            revision: 2,
          })
          .eq('id', first.id)
      ).error
    ).toBeNull();
    expect((await client.from('events').select().eq('id', second.id).single()).data).toMatchObject({
      client_name: 'Alex Client',
      client_email: 'alex@example.test',
      client_phone: '+639171234567',
      revision: 1,
    });
  });

  it.each(['signed-out', 'non-Admin', 'revoked-session', 'removed-Admin'] as const)(
    'denies %s list, detail, create, update, and delete requests',
    async (identity) => {
      const owner = await admin();
      const event = await create(owner.client);
      let denied = local.client();
      if (identity === 'non-Admin')
        denied = (await local.signIn(await local.provisionUser())).client;
      if (identity === 'revoked-session') {
        expect((await owner.client.auth.signOut({ scope: 'global' })).error).toBeNull();
        expect(owner.session.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
        denied = local.tokenClient(owner.session.access_token);
      }
      if (identity === 'removed-Admin') {
        expect(
          (await local.service.from('admin_profiles').delete().eq('id', owner.user.id)).error
        ).toBeNull();
        denied = local.tokenClient(owner.session.access_token);
      }
      for (const read of [
        await denied.from('events').select(),
        await denied.from('events').select().eq('id', event.id),
      ]) {
        if (identity === 'signed-out') expect(read.error?.code).toBe('42501');
        else {
          expect(read.error).toBeNull();
          expect(read.data).toEqual([]);
        }
      }
      expect((await denied.from('events').insert(payload())).error?.code).toBe('42501');
      const changed = await denied
        .from('events')
        .update({ title: 'Unauthorized', revision: 2 })
        .eq('id', event.id)
        .select();
      if (identity === 'signed-out') expect(changed.error?.code).toBe('42501');
      else {
        expect(changed.error).toBeNull();
        expect(changed.data).toEqual([]);
      }
      expect((await denied.from('events').delete().eq('id', event.id)).error?.code).toBe('42501');
      expect(
        (await local.service.from('events').select().eq('id', event.id).single()).data
      ).toMatchObject({ title: 'Evening celebration', revision: 1 });
    }
  );

  it('denies Admin deletion and identity reassignment', async () => {
    const { client } = await admin();
    const event = await create(client);
    expect((await client.from('events').delete().eq('id', event.id)).error?.code).toBe('42501');
    expect(
      (await client.from('events').update({ id: randomUUID(), revision: 2 }).eq('id', event.id))
        .error?.code
    ).toBe('42501');
    expect((await client.from('events').select().eq('id', event.id).single()).data?.revision).toBe(
      1
    );
  });

  it.each(['Live', 'Completed', 'Cancelled'])(
    'rejects %s on both insert and update',
    async (state) => {
      const { client } = await admin();
      const event = await create(client);
      expect((await client.from('events').insert(payload({ state }))).error?.code).toBe('42501');
      expect(
        (await client.from('events').update({ state, revision: 2 }).eq('id', event.id)).error?.code
      ).toBe('42501');
      expect((await client.from('events').select().eq('id', event.id).single()).data).toMatchObject(
        { state: 'Draft', revision: 1 }
      );
    }
  );

  it.each([
    ['negative package count', { film_package_count: -1 }, '23514'],
    ['fractional package count', { film_package_count: 1.5 }, '22P02'],
    ['overflow package count', { film_package_count: 2147483648 }, '22003'],
    ['negative allowance', { original_print_allowance: -1 }, '23514'],
    ['fractional allowance', { original_print_allowance: 1.5 }, '22P02'],
    ['overflow allowance', { original_print_allowance: 2147483648 }, '22003'],
    ['end before start', { ends_at: '2026-12-01T09:00:00Z' }, '23514'],
    ['equal start and end', { ends_at: booking.starts_at }, '23514'],
    ['infinite start', { starts_at: '-infinity' }, '23514'],
    ['blank title', { title: ' \t\n' }, '23514'],
    ['blank Client name', { client_name: ' ' }, '23514'],
    ['invalid email', { client_email: 'invalid' }, '23514'],
    ['blank phone', { client_phone: ' ' }, '23514'],
    ['blank venue', { venue_address: ' ' }, '23514'],
    ['unknown zone', { time_zone: 'Invalid/Zone' }, '23514'],
    ['null required field', { client_name: null }, '23502'],
  ])('rejects %s without changing the saved row', async (_name, invalid, code) => {
    const { client } = await admin();
    const event = await create(client);
    expect(
      (await client.from('events').insert(payload(invalid as Record<string, unknown>))).error?.code
    ).toBe(code);
    expect(
      (
        await client
          .from('events')
          .update({ ...(invalid as object), revision: 2 })
          .eq('id', event.id)
      ).error?.code
    ).toBe(code);
    expect((await client.from('events').select().eq('id', event.id).single()).data).toMatchObject({
      ...booking,
      revision: 1,
    });
  });

  it('accepts the maximum whole count for both independent counts', async () => {
    const { client } = await admin();
    const result = await client
      .from('events')
      .insert(payload({ film_package_count: 2147483647, original_print_allowance: 2147483647 }))
      .select()
      .single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      film_package_count: 2147483647,
      original_print_allowance: 2147483647,
    });
  });

  it('requires revision 1 on creation and exactly one increment for every direct update', async () => {
    const owner = await admin();
    expect((await owner.client.from('events').insert(payload({ revision: 2 }))).error?.code).toBe(
      '23514'
    );
    const event = await create(owner.client);
    const secondDevice = await local.signIn(owner.user);
    const firstSave = await owner.client
      .from('events')
      .update({ title: 'First save', revision: 2 })
      .eq('id', event.id)
      .eq('revision', 1)
      .select();
    expect(firstSave.error).toBeNull();
    expect(firstSave.data).toHaveLength(1);
    const filtered = await secondDevice.client
      .from('events')
      .update({ title: 'Stale save', revision: 2 })
      .eq('id', event.id)
      .eq('revision', 1)
      .select();
    expect(filtered.error).toBeNull();
    expect(filtered.data).toEqual([]);
    for (const update of [
      { title: 'Omitted revision' },
      { title: 'Stale revision', revision: 2 },
      { title: 'Skipped revision', revision: 4 },
    ]) {
      expect(
        (await secondDevice.client.from('events').update(update).eq('id', event.id)).error?.code
      ).toBe('23514');
    }
    expect(
      (await owner.client.from('events').select().eq('id', event.id).single()).data
    ).toMatchObject({ title: 'First save', revision: 2 });
  });
});
