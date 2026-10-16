// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { localSupabase } from '../fixtures/local-supabase';

function sql(query: string) {
  const output = execFileSync(
    resolve('node_modules/.bin/supabase'),
    [
      'db',
      'query',
      '--local',
      query.includes(';') && !query.startsWith('do $$') ? `do $$ begin ${query} end $$` : query,
      '-o',
      'json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return output.trim().startsWith('{') ? JSON.parse(output).rows : [];
}

describe('accounting ledger operations', () => {
  const local = localSupabase();
  const actors: string[] = [];
  const events: string[] = [];
  afterEach(async () => {
    // Fixture cleanup is a local postgres operation, never an application privilege.
    for (const id of actors)
      sql(
        `delete from public.operation_receipts where actor_scope='admin:${id}'; delete from public.activity_events where actor_scope='admin:${id}'; delete from public.film_stock_entries where actor_scope='admin:${id}'; delete from public.additional_print_entries where actor_id='${id}';`
      );
    for (const id of events)
      sql(
        `delete from public.print_attempt_events where attempt_id in (select id from public.print_attempts where event_id='${id}'); delete from public.print_attempts where event_id='${id}'; delete from public.captures where event_id='${id}'; delete from public.guest_sessions where event_id='${id}'; delete from public.booth_runs where event_id='${id}'; delete from public.events where id='${id}';`
      );
    sql(
      'update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries)'
    );
    actors.length = 0;
    events.length = 0;
    await local.cleanup();
  }, 20000);
  async function admin(allow = true) {
    const user = await local.provisionUser();
    actors.push(user.id);
    if (allow) expect((await local.allowlist(user.id)).error).toBeNull();
    const signed = await local.signIn(user);
    const jwt = JSON.parse(
      Buffer.from(signed.session.access_token.split('.')[1], 'base64url').toString()
    );
    return {
      ...signed,
      args: {
        admin_user_id: user.id,
        admin_session_id: jwt.session_id,
        operation_key: randomUUID(),
      },
    };
  }
  async function event(state = 'Draft') {
    const id = randomUUID();
    events.push(id);
    expect(
      (
        await local.service.from('events').insert({
          id,
          state,
          title: 'Ledger fixture',
          client_name: 'Client',
          client_email: 'fixture@example.test',
          client_phone: '123',
          venue_address: 'Venue',
          time_zone: 'Asia/Manila',
          starts_at: '2026-12-01T10:00:00Z',
          ends_at: '2026-12-01T12:00:00Z',
          film_package_count: 1,
          original_print_allowance: 10,
        })
      ).error
    ).toBeNull();
    return id;
  }
  const rpc = (name: string, args: Record<string, unknown>) => local.service.rpc(name, args);
  it('adds stock exactly once and retains the original committed receipt after later changes', async () => {
    const a = await admin();
    const args = { ...a.args, sheets: 10, reason: 'New pack' };
    const first = await rpc('add_film_stock', args);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ on_hand: 10, available_stock: 10 });
    expect(
      (await rpc('add_film_stock', { ...args, operation_key: randomUUID(), sheets: 5 })).error
    ).toBeNull();
    expect((await rpc('add_film_stock', args)).data).toEqual(first.data);
    expect((await rpc('add_film_stock', { ...args, sheets: 11 })).error?.message).toBe(
      'idempotency_conflict'
    );
    expect(
      sql(
        'select on_hand, (select sum(signed_sheets) from public.film_stock_entries) as ledger from public.film_stock_balance'
      )[0]
    ).toEqual({ on_hand: 15, ledger: 15 });
    expect(
      (
        await local.service
          .from('activity_events')
          .select()
          .eq('actor_scope', `admin:${a.args.admin_user_id}`)
      ).data
    ).toHaveLength(2);
    expect(
      (
        await local.service
          .from('operation_receipts')
          .select()
          .eq('actor_scope', `admin:${a.args.admin_user_id}`)
      ).data
    ).toHaveLength(2);
  });
  it('rejects invalid quantities and blank reconciliation reasons without writes', async () => {
    const a = await admin();
    for (const sheets of [0, -1, null])
      expect(
        (await rpc('add_film_stock', { ...a.args, sheets, reason: null })).error?.message
      ).toBe('validation_error');
    for (const observed_sheets of [-1, null])
      expect(
        (await rpc('reconcile_film_stock', { ...a.args, observed_sheets, reason: 'Count' })).error
          ?.message
      ).toBe('validation_error');
    expect(
      (await rpc('reconcile_film_stock', { ...a.args, observed_sheets: 0, reason: ' \t\n ' })).error
        ?.message
    ).toBe('validation_error');
    const id = await event();
    for (const quantity of [0, -1, null])
      expect(
        (await rpc('add_event_prints', { ...a.args, event_id: id, quantity })).error?.message
      ).toBe('validation_error');
    expect(
      (
        await local.service
          .from('operation_receipts')
          .select()
          .eq('actor_scope', `admin:${a.args.admin_user_id}`)
      ).data
    ).toEqual([]);
  });
  it('records positive, negative and zero reconciliation differences with reasons', async () => {
    const a = await admin();
    for (const [observed, difference] of [
      [8, 8],
      [3, -5],
      [3, 0],
      [0, -3],
    ]) {
      const args = {
        ...a.args,
        operation_key: randomUUID(),
        observed_sheets: observed,
        reason: ' Physical count ',
      };
      const result = await rpc('reconcile_film_stock', args);
      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ on_hand: observed, signed_sheets: difference });
      const row = await local.service
        .from('film_stock_entries')
        .select()
        .eq('id', result.data.entry_id)
        .single();
      expect(row.data).toMatchObject({
        signed_sheets: difference,
        observed_sheets: observed,
        reason: 'Physical count',
      });
      expect(
        (await rpc('reconcile_film_stock', { ...args, reason: 'Physical count' })).data
      ).toEqual(result.data);
      expect(
        (await rpc('reconcile_film_stock', { ...args, reason: 'Different reason' })).error?.message
      ).toBe('idempotency_conflict');
    }
    expect(
      (
        await local.service
          .from('film_stock_entries')
          .select()
          .eq('actor_scope', `admin:${a.args.admin_user_id}`)
      ).data
    ).toHaveLength(4);
  });
  it('blocks reconciliation for every unresolved Film Reservation but allows additions', async () => {
    const a = await admin();
    const id = await event();
    const attempt = randomUUID();
    expect(
      (
        await local.service.from('print_attempts').insert({
          id: attempt,
          event_id: id,
          kind: 'Test',
          request_key: randomUUID(),
          connection_id: randomUUID(),
        })
      ).error
    ).toBeNull();
    for (const state of ['Reserved', 'Accepted', 'Uncertain']) {
      expect(
        (await local.service.from('print_attempts').update({ state }).eq('id', attempt)).error
      ).toBeNull();
      expect(
        (await rpc('reconcile_film_stock', { ...a.args, observed_sheets: 10, reason: 'Count' }))
          .error?.message
      ).toBe('pending_attempt');
    }
    expect(
      (await rpc('add_film_stock', { ...a.args, sheets: 4, reason: null })).data
    ).toMatchObject({ on_hand: 4, available_stock: 3 });
    expect(
      (
        await local.service
          .from('print_attempts')
          .update({ state: 'RejectedUnused' })
          .eq('id', attempt)
      ).error
    ).toBeNull();
    expect(
      (await rpc('reconcile_film_stock', { ...a.args, observed_sheets: 4, reason: 'Count' })).error
    ).toBeNull();
  });
  it('adds Event allowance once without changing original allowance or stock', async () => {
    const a = await admin();
    const id = await event();
    const args = { ...a.args, event_id: id, quantity: 5 };
    const first = await rpc('add_event_prints', args);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      original_print_allowance: 10,
      additional_prints: 5,
      remaining_allowance: 15,
    });
    expect((await rpc('add_event_prints', args)).data).toEqual(first.data);
    expect((await rpc('add_event_prints', { ...args, quantity: 6 })).error?.message).toBe(
      'idempotency_conflict'
    );
    expect(
      (await rpc('add_event_prints', { ...args, event_id: await event() })).error?.message
    ).toBe('idempotency_conflict');
    expect(
      (await local.service.from('events').select('original_print_allowance').eq('id', id).single())
        .data?.original_print_allowance
    ).toBe(10);
    expect(sql('select on_hand from public.film_stock_balance')[0].on_hand).toBe(0);
    expect(
      (await local.service.from('activity_events').select().eq('event_id', id)).data
    ).toHaveLength(1);
  });
  it('computes Live allowance from chargeable Guest prints and unresolved Guest holds', async () => {
    const a = await admin();
    const id = await event('Live');
    // Seed physical-outcome fixtures without implementing any printer transitions.
    sql(`do $$ declare r uuid; s uuid; c uuid; attempt uuid; outcome text; begin
      insert into public.booth_runs(event_id,state) values ('${id}','Active') returning id into r;
      foreach outcome in array array['Confirmed','AdminResolvedEjected','WastedFilm','RejectedUnused','Uncertain'] loop
        insert into public.guest_sessions(event_id,run_id,state) values ('${id}',r,'Printed') returning id into s;
        insert into public.captures(event_id,run_id,session_id,captured_at) values ('${id}',r,s,now()) returning id into c;
        insert into public.print_attempts(event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id)
          values ('${id}',r,s,c,'Guest',outcome,gen_random_uuid(),gen_random_uuid()) returning id into attempt;
      end loop;
    end $$`);
    const result = await rpc('add_event_prints', { ...a.args, event_id: id, quantity: 5 });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      original_print_allowance: 10,
      additional_prints: 5,
      confirmed_prints: 2,
      reserved_prints: 1,
      remaining_allowance: 12,
    });
  });
  it('serializes concurrent stock additions and duplicate Event requests', async () => {
    const a = await admin();
    const id = await event();
    const added = await Promise.all(
      Array.from({ length: 4 }, () =>
        rpc('add_film_stock', { ...a.args, operation_key: randomUUID(), sheets: 2, reason: null })
      )
    );
    for (const r of added) expect(r.error).toBeNull();
    expect(
      sql(
        'select on_hand, (select sum(signed_sheets) from public.film_stock_entries) as ledger from public.film_stock_balance'
      )[0]
    ).toEqual({ on_hand: 8, ledger: 8 });
    const copies = await Promise.all(
      Array.from({ length: 3 }, () =>
        rpc('add_event_prints', { ...a.args, event_id: id, quantity: 3 })
      )
    );
    for (const r of copies) {
      expect(r.error).toBeNull();
      expect(r.data).toEqual(copies[0].data);
    }
    expect(
      (await local.service.from('additional_print_entries').select().eq('event_id', id)).data
    ).toHaveLength(1);
  });
  it('rejects missing, completed, cancelled and deleted Events', async () => {
    const a = await admin();
    for (const id of [randomUUID(), await event('Completed'), await event('Cancelled')])
      expect(
        (await rpc('add_event_prints', { ...a.args, event_id: id, quantity: 1 })).error?.message
      ).toBe('state_conflict');
    const id = await event();
    sql(
      `update public.events set deleted_at=now(),media_removal_state='pending',title=null,client_name=null,client_email=null,client_phone=null,venue_address=null,time_zone=null,starts_at=null,ends_at=null,revision=revision+1 where id='${id}'`
    );
    expect(
      (await rpc('add_event_prints', { ...a.args, event_id: id, quantity: 1 })).error?.message
    ).toBe('state_conflict');
  });
  it('denies browser RPC execution, non-Admins, mismatched and revoked sessions including receipt replay', async () => {
    const a = await admin();
    const outsider = await admin(false);
    const id = await event();
    for (const [name, params] of [
      ['add_film_stock', { sheets: 1, reason: null }],
      ['reconcile_film_stock', { observed_sheets: 1, reason: 'Count' }],
      ['add_event_prints', { event_id: id, quantity: 1 }],
    ] as const) {
      expect((await rpc(name, { ...a.args, ...params })).error).toBeNull();
      for (const client of [local.client(), a.client])
        expect((await client.rpc(name, { ...a.args, ...params })).error?.code).toBe('42501');
      expect((await rpc(name, { ...outsider.args, ...params })).error?.message).toBe('forbidden');
      expect(
        (
          await rpc(name, {
            ...a.args,
            admin_session_id: outsider.args.admin_session_id,
            ...params,
          })
        ).error?.message
      ).toBe('forbidden');
    }
    expect((await a.client.auth.signOut({ scope: 'global' })).error).toBeNull();
    for (const [name, params] of [
      ['add_film_stock', { sheets: 1, reason: null }],
      ['reconcile_film_stock', { observed_sheets: 1, reason: 'Count' }],
      ['add_event_prints', { event_id: id, quantity: 1 }],
    ] as const)
      expect((await rpc(name, { ...a.args, ...params })).error?.message).toBe('forbidden');
  });
  it('keeps stock and allowance ledgers append-only for application roles', () => {
    for (const table of ['film_stock_entries', 'additional_print_entries'])
      expect(
        sql(
          `select has_table_privilege('service_role','public.${table}','UPDATE,DELETE') as mutable`
        )[0].mutable
      ).toBe(false);
  });
});
