// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  localSupabase,
  localSupabaseStatus,
  ownerInsert,
  cleanupEvents,
  ownerUpdate,
} from '../fixtures/local-supabase';

const tables = [
  'booth_runs',
  'booth_grants',
  'guest_sessions',
  'captures',
  'print_attempts',
  'print_attempt_events',
  'additional_print_entries',
  'film_stock_entries',
  'film_stock_balance',
  'activity_events',
  'operation_receipts',
];
const indexes = [
  'events_one_live_idx',
  'print_attempts_one_printer_idx',
  'guest_sessions_one_open_idx',
  'print_attempts_one_unresolved_session_idx',
];
const booking = {
  title: 'Schema fixture',
  client_name: 'Client',
  client_email: 'fixture@example.test',
  client_phone: '123',
  venue_address: 'Venue',
  time_zone: 'Asia/Manila',
  starts_at: '2026-12-01T10:00:00Z',
  ends_at: '2026-12-01T12:00:00Z',
  film_package_count: 1,
  original_print_allowance: 10,
};
function sql(query: string) {
  return JSON.parse(
    execFileSync(
      resolve('node_modules/.bin/supabase'),
      ['db', 'query', '--local', query, '-o', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
  ).rows;
}

describe('operational schema and browser boundary', () => {
  const local = localSupabase();
  const ids: string[] = [];
  afterEach(async () => {
    if (ids.length) {
      const events = await cleanupEvents(ids.splice(0));
      if (events.error) throw events.error;
    }
    await local.cleanup();
  });
  async function admin() {
    const user = await local.provisionUser();
    expect((await local.allowlist(user.id)).error).toBeNull();
    return local.signIn(user);
  }
  async function event() {
    const id = randomUUID();
    ids.push(id);
    const result = await ownerInsert('events', { id, ...booking });
    expect(result.error).toBeNull();
    return id;
  }
  it('enables RLS, removes browser writes, and installs all singleton indexes', () => {
    const metadata = sql(
      "select c.relname, c.relrowsecurity, has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') as anon_write, has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as authenticated_write from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"
    );
    for (const table of tables)
      expect(metadata.find((row: { relname: string }) => row.relname === table)).toMatchObject({
        relrowsecurity: true,
        anon_write: false,
        authenticated_write: false,
      });
    const found = sql(
      "select indexname from pg_indexes where schemaname='public' and indexdef like 'CREATE UNIQUE INDEX%WHERE%'"
    ).map((row: { indexname: string }) => row.indexname);
    expect(found).toEqual(expect.arrayContaining(indexes));
    expect(
      sql(
        "select has_column_privilege('authenticated','public.events','state','UPDATE') as allowed"
      )[0].allowed
    ).toBe(false);
    expect(sql('select on_hand from public.film_stock_balance')).toEqual([{ on_hand: 0 }]);
  }, 20000);
  it('denies direct operational writes through PostgREST for both browser roles', async () => {
    const owner = await admin();
    const status = localSupabaseStatus();
    for (const token of [status.ANON_KEY, owner.session.access_token]) {
      for (const table of tables) {
        for (const method of ['POST', 'PATCH', 'DELETE']) {
          const response = await fetch(`${status.API_URL}/rest/v1/${table}?id=eq.${randomUUID()}`, {
            method,
            headers: {
              apikey: status.ANON_KEY,
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            ...(method === 'DELETE' ? {} : { body: JSON.stringify({ id: randomUUID() }) }),
          });
          expect((await response.json()).code, `${table} ${method}`).toBe('42501');
        }
      }
    }
  }, 20000);
  it('allows visible Draft edits, denies state changes and Live edits, and hides tombstones', async () => {
    const owner = await admin();
    const id = randomUUID();
    ids.push(id);
    expect((await owner.client.from('events').insert({ id, ...booking })).error).toBeNull();
    expect(
      (await owner.client.from('events').update({ title: 'Edited', revision: 2 }).eq('id', id))
        .error
    ).toBeNull();
    for (const client of [local.client(), owner.client])
      expect(
        (await client.from('events').update({ state: 'Live', revision: 3 }).eq('id', id)).error
          ?.code
      ).toBe('42501');
    expect((await ownerUpdate('events', id, { state: 'Live', revision: 3 })).error).toBeNull();
    expect(
      (
        await owner.client
          .from('events')
          .update({ title: 'Forbidden', revision: 4 })
          .eq('id', id)
          .select()
      ).data
    ).toEqual([]);
    const deleted = await event();
    expect(
      (
        await ownerUpdate('events', deleted, {
          deleted_at: new Date().toISOString(),
          media_removal_state: 'pending',
          title: null,
          client_name: null,
          client_email: null,
          client_phone: null,
          venue_address: null,
          time_zone: null,
          starts_at: null,
          ends_at: null,
          revision: 2,
        })
      ).error
    ).toBeNull();
    expect((await owner.client.from('events').select().eq('id', deleted)).data).toEqual([]);
    expect(
      (await local.service.from('events').select().eq('id', deleted).single()).data?.title
    ).toBeNull();
  });
  it('allows active Admin operational reads and denies revoked sessions', async () => {
    const owner = await admin();
    const eventId = await event();
    expect(
      (await ownerInsert('booth_runs', { event_id: eventId, state: 'Prepared' })).error
    ).toBeNull();
    expect(
      (await owner.client.from('booth_runs').select().eq('event_id', eventId)).data
    ).toHaveLength(1);
    expect((await owner.client.auth.signOut({ scope: 'global' })).error).toBeNull();
    const revoked = local.tokenClient(owner.session.access_token);
    expect((await revoked.from('booth_runs').select().eq('event_id', eventId)).data).toEqual([]);
    expect((await revoked.from('events').select().eq('id', eventId)).data).toEqual([]);
  });
});
