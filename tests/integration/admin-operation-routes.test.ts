// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { localSupabase, localSupabaseStatus } from '../fixtures/local-supabase';
const fault = vi.hoisted(() => ({ rpc: false, projection: false }));
vi.mock('@/lib/operations/privileged-client', async (original) => {
  const actual = await original<typeof import('@/lib/operations/privileged-client')>();
  return {
    createPrivilegedClient: () => {
      const client = actual.createPrivilegedClient();
      const rpc = client.rpc.bind(client) as unknown as (
        name: string,
        args?: unknown,
        options?: unknown
      ) => PromiseLike<{ data: unknown; error: unknown }>;
      client.rpc = ((...args: Parameters<typeof rpc>) => {
        if (!fault.rpc) return rpc(...args);
        fault.rpc = false;
        return Promise.resolve(rpc(...args)).then((result) => {
          if (result.error) return result;
          return { data: null, error: { message: 'Upstream connection lost: secret diagnostic' } };
        });
      }) as unknown as typeof client.rpc;
      const from = client.from.bind(client) as unknown as (table: string) => unknown;
      client.from = ((table: string) => {
        if (fault.projection && table === 'print_attempt_events') {
          fault.projection = false;
          const query = {
            select: () => query,
            eq: () => query,
            single: async () => ({ data: null, error: { message: 'Projection connection lost' } }),
          };
          return query;
        }
        return from(table as never);
      }) as unknown as typeof client.from;
      return client;
    },
  };
});
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
import { POST as pause } from '@/app/api/admin/events/[eventId]/pause/route';
import { POST as complete } from '@/app/api/admin/events/[eventId]/complete/route';
import { POST as cancel } from '@/app/api/admin/events/[eventId]/cancel/route';
import { POST as deleteDraft } from '@/app/api/admin/events/[eventId]/delete-draft/route';
import { POST as reserve } from '@/app/api/admin/events/[eventId]/test-attempts/route';
import { POST as additional } from '@/app/api/admin/events/[eventId]/additional-prints/route';
import { POST as observe } from '@/app/api/admin/print-attempts/[attemptId]/observations/route';
import { POST as inspect } from '@/app/api/admin/print-attempts/[attemptId]/test-output/route';
import { POST as recover } from '@/app/api/admin/print-attempts/[attemptId]/recover/route';
import { POST as settle } from '@/app/api/admin/print-attempts/[attemptId]/resolve/route';
import { POST as waste } from '@/app/api/admin/print-attempts/[attemptId]/wasted-film/route';
import { POST as add } from '@/app/api/admin/film-stock/additions/route';
import { POST as reconcile } from '@/app/api/admin/film-stock/reconciliations/route';
const local = localSupabase(),
  status = localSupabaseStatus();
const ids: string[] = [],
  users: string[] = [];
function sql(query: string) {
  const output = execFileSync(
    resolve('node_modules/.bin/supabase'),
    [
      'db',
      'query',
      '--local',
      /^select/i.test(query) ? query : `do $$ begin ${query}; end $$`,
      '-o',
      'json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return output.trim().startsWith('{') ? JSON.parse(output).rows : [];
}
function req(body: unknown, origin = 'https://booth.test') {
  return new Request('https://booth.test/api/admin/test', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const eventContext = (eventId: string) => ({ params: Promise.resolve({ eventId }) });
const attemptContext = (attemptId: string) => ({ params: Promise.resolve({ attemptId }) });
const operation = () => ({ operationKey: randomUUID() });
async function result(response: Response, statusCode = 200) {
  expect(response.status).toBe(statusCode);
  expect(response.headers.get('cache-control')).toContain('private, no-store');
  const body = await response.json();
  expect(JSON.stringify(body)).not.toMatch(
    /client_email|admin_user_id|admin_session_id|photo|secret_hash/
  );
  return body;
}
beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', status.API_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', status.ANON_KEY);
  vi.stubEnv('SUPABASE_SECRET_KEY', status.SERVICE_ROLE_KEY);
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
});
afterAll(() => vi.unstubAllEnvs());
afterEach(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
  jar.clear();
  for (const id of ids.splice(0))
    sql(
      `delete from public.operation_receipts where event_id='${id}'; delete from public.activity_events where event_id='${id}'; delete from public.film_stock_entries where event_id='${id}'; delete from public.additional_print_entries where event_id='${id}'; delete from public.print_attempt_events where attempt_id in(select id from public.print_attempts where event_id='${id}'); delete from public.print_attempts where event_id='${id}'; delete from public.captures where event_id='${id}'; delete from public.guest_sessions where event_id='${id}'; delete from public.booth_handoffs where event_id='${id}'; delete from public.booth_grants where event_id='${id}'; delete from public.booth_runs where event_id='${id}'; delete from public.events where id='${id}'`
    );
  for (const id of users.splice(0))
    sql(
      `delete from public.operation_receipts where actor_scope='admin:${id}';delete from public.activity_events where actor_scope='admin:${id}';delete from public.film_stock_entries where actor_scope='admin:${id}'`
    );
  sql(
    "update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries);update public.printer_completion_policy set mode='disabled'"
  );
  await local.cleanup();
}, 20000);
async function admin(allowed = true) {
  const user = await local.provisionUser();
  users.push(user.id);
  if (allowed) await local.allowlist(user.id);
  const client = createServerClient(status.API_URL, status.ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  expect((await client.auth.signInWithPassword(user)).error).toBeNull();
  return { user, client };
}
async function fixture() {
  const a = await admin(),
    eventId = randomUUID(),
    connectionId = randomUUID();
  ids.push(eventId);
  sql(
    `insert into public.events(id,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance) values('${eventId}','Route fixture','Client','private@example.test','123','Venue','Asia/Manila','2026-12-01T10:00Z','2026-12-01T12:00Z',1,10);insert into public.film_stock_entries(event_id,kind,signed_sheets,actor_scope) values('${eventId}','Addition',10,'fixture');update public.film_stock_balance set on_hand=(select sum(signed_sheets) from public.film_stock_entries);update public.printer_completion_policy set mode='simulated'`
  );
  return {
    ...a,
    eventId,
    connectionId,
    stock: Number(sql('select on_hand from public.film_stock_balance')[0].on_hand),
  };
}
async function testAttempt(f: Awaited<ReturnType<typeof fixture>>) {
  return result(
    await reserve(req({ ...operation(), connectionId: f.connectionId }), eventContext(f.eventId))
  );
}
function observation(observationKind = 'commandAccepted', evidenceCode = 'command_acknowledged') {
  return { ...operation(), observationKind, evidenceCode, observedAt: '2026-10-16T12:00:00Z' };
}
function routes(eventId = randomUUID(), attemptId = randomUUID()) {
  return [
    (body: object, origin?: string) => pause(req(body, origin), eventContext(eventId)),
    (body: object, origin?: string) => complete(req(body, origin), eventContext(eventId)),
    (body: object, origin?: string) => cancel(req(body, origin), eventContext(eventId)),
    (body: object, origin?: string) => reserve(req(body, origin), eventContext(eventId)),
    (body: object, origin?: string) => additional(req(body, origin), eventContext(eventId)),
    (body: object, origin?: string) => observe(req(body, origin), attemptContext(attemptId)),
    (body: object, origin?: string) => settle(req(body, origin), attemptContext(attemptId)),
    (body: object, origin?: string) => inspect(req(body, origin), attemptContext(attemptId)),
    (body: object, origin?: string) => waste(req(body, origin), attemptContext(attemptId)),
    (body: object, origin?: string) => add(req(body, origin)),
    (body: object, origin?: string) => reconcile(req(body, origin)),
    (body: object, origin?: string) => recover(req(body, origin), attemptContext(attemptId)),
  ];
}
describe('Admin operation HTTP contracts with real local Auth and RPCs', { timeout: 30000 }, () => {
  it.each([
    ['complete', (request: Request) => complete(request, eventContext(randomUUID()))],
    ['cancel', (request: Request) => cancel(request, eventContext(randomUUID()))],
    ['recover attempt', (request: Request) => recover(request, attemptContext(randomUUID()))],
    ['resolve attempt', (request: Request) => settle(request, attemptContext(randomUUID()))],
  ])('keeps the legacy %s missing-auth response before version lookup', async (_name, invoke) => {
    expect((await result(await invoke(req(operation())), 401)).code).toBe('unauthorized');
  });
  it('uses the package missing-auth response before Draft deletion validation', async () => {
    expect(
      (await result(await deleteDraft(req(operation()), eventContext(randomUUID())), 401)).code
    ).toBe('access_required');
  });
  it('requires live provisioned Admin authority and same origin on every route', async () => {
    for (const route of routes())
      expect((await result(await route(operation()), 401)).code).toBe('unauthorized');
    const a = await admin(false);
    for (const route of routes())
      expect((await result(await route(operation()), 403)).code).toBe('forbidden');
    await local.allowlist(a.user.id);
    for (const route of routes())
      expect((await result(await route(operation(), 'https://evil.test'), 403)).code).toBe(
        'forbidden'
      );
    const stale = new Map(jar);
    await a.client.auth.signOut({ scope: 'local' });
    jar.clear();
    stale.forEach((v, k) => jar.set(k, v));
    for (const route of routes())
      expect((await result(await route(operation()), 403)).code).toBe('forbidden');
  });
  it('rejects missing keys, unknown fields, photo bytes and client asserted authority on every route', async () => {
    await admin();
    const valid = [
      { expectedRevision: 1 },
      { expectedRevision: 1 },
      { expectedRevision: 1 },
      { connectionId: randomUUID() },
      { quantity: 1 },
      {
        observationKind: 'commandAccepted',
        evidenceCode: 'command_acknowledged',
        observedAt: '2026-10-16T12:00:00Z',
      },
      { outcome: 'unused', inspectionReason: 'Inspected' },
      { usable: true },
      { reason: 'Damaged' },
      { sheets: 1, reason: 'New' },
      { observedSheets: 1, reason: 'Counted' },
      { reason: 'Lost originating browser' },
    ];
    for (const [index, route] of routes().entries()) {
      expect((await result(await route(valid[index]), 400)).code).toBe('validation_error');
      for (const extra of [
        { adminUserId: randomUUID() },
        { adminSessionId: randomUUID() },
        { photo: 'base64' },
        { grantHash: 'abc' },
      ])
        expect(
          (await result(await route({ ...valid[index], ...operation(), ...extra }), 400)).code
        ).toBe('validation_error');
    }
  });
  it.each(['stock', 'additional'])(
    'retries committed %s additions after upstream response loss once',
    async (kind) => {
      const f = await fixture();
      const body = {
        ...operation(),
        ...(kind === 'stock' ? { sheets: 3, reason: 'New pack' } : { quantity: 3 }),
      };
      const invoke = () =>
        kind === 'stock' ? add(req(body)) : additional(req(body), eventContext(f.eventId));
      fault.rpc = true;
      const failed = await result(await invoke(), 503);
      expect(failed.code).toBe('operation_unavailable');
      expect(JSON.stringify(failed)).not.toContain('secret');
      await result(await invoke());
      const actor = `admin:${f.user.id}`;
      expect(
        sql(
          `select id from public.operation_receipts where actor_scope='${actor}' and operation_key='${body.operationKey}'`
        )
      ).toHaveLength(1);
      expect(
        sql(`select id from public.activity_events where actor_scope='${actor}'`)
      ).toHaveLength(1);
      const table = kind === 'stock' ? 'film_stock_entries' : 'additional_print_entries';
      expect(
        sql(
          `select id from public.${table} where ${kind === 'stock' ? `actor_scope='${actor}'` : `actor_id='${f.user.id}'`}`
        )
      ).toHaveLength(1);
    }
  );
  it('returns retryable ambiguity when resolution projection fails after commit', async () => {
    const f = await fixture(),
      a = await testAttempt(f);
    await result(
      await observe(req(observation('uncertain', 'ambiguous_outcome')), attemptContext(a.attemptId))
    );
    const body = { ...operation(), outcome: 'ejected', inspectionReason: 'Inspected' };
    fault.projection = true;
    expect((await result(await settle(req(body), attemptContext(a.attemptId)), 503)).code).toBe(
      'operation_unavailable'
    );
    await result(await settle(req(body), attemptContext(a.attemptId)));
    expect(
      sql(`select id from public.film_stock_entries where attempt_id='${a.attemptId}'`)
    ).toHaveLength(1);
  });
  it('recovers a Test from a fresh Admin session without weakening observation authority', async () => {
    const f = await fixture(),
      a = await testAttempt(f);
    await f.client.auth.signOut({ scope: 'local' });
    await admin();
    expect(
      (await result(await observe(req(observation()), attemptContext(a.attemptId)), 403)).code
    ).toBe('forbidden');
    const body = { ...operation(), reason: 'Old session was revoked' };
    const recovered = await result(await recover(req(body), attemptContext(a.attemptId)));
    expect(recovered).toMatchObject({ state: 'Uncertain', filmHold: 1, allowanceHold: 0 });
    expect(await result(await recover(req(body), attemptContext(a.attemptId)))).toEqual(recovered);
    await result(
      await settle(
        req({ ...operation(), outcome: 'unused', inspectionReason: 'Printer inspected' }),
        attemptContext(a.attemptId)
      )
    );
  });
  it('recovers a Guest attempt with lost expired proof through the Admin route', async () => {
    const f = await fixture(),
      run = randomUUID(),
      session = randomUUID(),
      capture = randomUUID(),
      attempt = randomUUID();
    sql(`update public.events set state='Live',revision=revision+1 where id='${f.eventId}';
      insert into public.booth_runs(id,event_id,state) values('${run}','${f.eventId}','Active');
      insert into public.booth_grants(event_id,run_id,secret_hash,state,created_at,expires_at) values('${f.eventId}','${run}','${'a'.repeat(64)}','Active',now()-interval '2 hours',now()-interval '1 hour');
      insert into public.guest_sessions(id,event_id,run_id) values('${session}','${f.eventId}','${run}');
      insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${capture}','${f.eventId}','${run}','${session}',now());
      insert into public.print_attempts(id,event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id) values('${attempt}','${f.eventId}','${run}','${session}','${capture}','Guest','Reserved','${randomUUID()}','${f.connectionId}')`);
    const body = { ...operation(), reason: 'Browser cookie lost and proof expired' };
    const recovered = await result(await recover(req(body), attemptContext(attempt)));
    expect(recovered).toMatchObject({
      state: 'Uncertain',
      filmHold: 1,
      allowanceHold: 1,
      onHand: f.stock,
    });
    expect(sql(`select state from public.booth_grants where run_id='${run}'`)).toEqual([
      { state: 'Revoked' },
    ]);
    await result(
      await settle(
        req({ ...operation(), outcome: 'unused', inspectionReason: 'Printer inspected' }),
        attemptContext(attempt)
      )
    );
    const revision = sql(`select revision from public.events where id='${f.eventId}'`)[0].revision;
    expect(
      await result(
        await complete(req({ ...operation(), expectedRevision: revision }), eventContext(f.eventId))
      )
    ).toMatchObject({ state: 'Completed' });
  });
  it.each([
    ['Guest', 'simulated'],
    ['Guest', 'disabled'],
    ['Test', 'simulated'],
    ['Test', 'disabled'],
  ])(
    'blocks production inspected %s ejection with %s policy but allows unused recovery',
    async (kind, policy) => {
      const f = await fixture(),
        a = await testAttempt(f);
      await result(
        await observe(
          req(observation('uncertain', 'ambiguous_outcome')),
          attemptContext(a.attemptId)
        )
      );
      if (kind === 'Guest') {
        const run = randomUUID(),
          session = randomUUID(),
          capture = randomUUID();
        sql(`insert into public.booth_runs(id,event_id,state) values('${run}','${f.eventId}','Paused');
        insert into public.guest_sessions(id,event_id,run_id) values('${session}','${f.eventId}','${run}');
        insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${capture}','${f.eventId}','${run}','${session}',now());
        update public.print_attempts set kind='Guest',run_id='${run}',session_id='${session}',capture_id='${capture}',initiating_admin_session_id=null where id='${a.attemptId}'`);
      }
      sql(`update public.printer_completion_policy set mode='${policy}'`);
      vi.stubEnv('NODE_ENV', 'production');
      expect(
        (
          await result(
            await settle(
              req({ ...operation(), outcome: 'ejected', inspectionReason: 'Inspected' }),
              attemptContext(a.attemptId)
            ),
            400
          )
        ).code
      ).toBe('invalid_evidence');
      expect(sql(`select state from public.print_attempts where id='${a.attemptId}'`)).toEqual([
        { state: 'Uncertain' },
      ]);
      expect(
        sql(`select id from public.film_stock_entries where attempt_id='${a.attemptId}'`)
      ).toHaveLength(0);
      await result(
        await settle(
          req({ ...operation(), outcome: 'unused', inspectionReason: 'Inspected' }),
          attemptContext(a.attemptId)
        )
      );
    }
  );
  it('returns stock entries, stable duplicate results and zero difference reconciliation', async () => {
    const f = await fixture(),
      body = { ...operation(), sheets: 4, reason: 'New pack' };
    const added = await result(await add(req(body)));
    expect(added).toEqual({
      entryId: expect.any(String),
      previousOnHand: f.stock,
      signedSheets: 4,
      onHand: f.stock + 4,
      availability: { filmSheets: f.stock + 4 },
    });
    expect(await result(await add(req(body)))).toEqual(added);
    expect((await result(await add(req({ ...body, sheets: 5 })), 409)).code).toBe(
      'idempotency_conflict'
    );
    const reconciled = await result(
      await reconcile(
        req({ ...operation(), observedSheets: f.stock + 4, reason: 'Counted physically' })
      )
    );
    expect(reconciled.signedSheets).toBe(0);
    expect(reconciled.previousOnHand).toBe(f.stock + 4);
    for (const invalid of [
      { sheets: 0, reason: 'x' },
      { sheets: 1, reason: ' ' },
      { sheets: 1.5, reason: 'x' },
    ])
      expect((await result(await add(req({ ...operation(), ...invalid })), 400)).code).toBe(
        'validation_error'
      );
  });
  it('returns Additional Prints allowance and commits once', async () => {
    const f = await fixture(),
      body = { ...operation(), quantity: 3 };
    const added = await result(await additional(req(body), eventContext(f.eventId)));
    expect(added).toEqual({
      entryId: expect.any(String),
      originalPrintAllowance: 10,
      additionalPrints: 3,
      confirmedPrints: 0,
      reservedPrints: 0,
      availability: { guestPrints: 13 },
    });
    expect(await result(await additional(req(body), eventContext(f.eventId)))).toEqual(added);
    expect(
      sql(`select quantity from public.additional_print_entries where event_id='${f.eventId}'`)
    ).toEqual([{ quantity: 3 }]);
  });
  it('enforces revisions and maps pause, completion and cancellation states', async () => {
    const f = await fixture(),
      run = randomUUID();
    sql(
      `update public.events set state='Live',revision=revision+1 where id='${f.eventId}';insert into public.booth_runs(id,event_id,state) values('${run}','${f.eventId}','Active')`
    );
    const stale = await result(
      await pause(req({ ...operation(), expectedRevision: 99 }), eventContext(f.eventId)),
      409
    );
    expect(stale).toMatchObject({
      code: 'state_conflict',
      current: { state: 'Live', revision: 2 },
    });
    const body = { ...operation(), expectedRevision: 2 };
    const paused = await result(await pause(req(body), eventContext(f.eventId)));
    expect(paused).toEqual({ eventId: f.eventId, runId: run, state: 'Paused', revision: 4 });
    expect(await result(await pause(req(body), eventContext(f.eventId)))).toEqual(paused);
    expect(
      await result(
        await complete(req({ ...operation(), expectedRevision: 4 }), eventContext(f.eventId))
      )
    ).toMatchObject({ state: 'Completed', revision: 5 });
    const other = await fixture();
    expect(
      await result(
        await cancel(req({ ...operation(), expectedRevision: 1 }), eventContext(other.eventId))
      )
    ).toMatchObject({ state: 'Cancelled', revision: 2 });
  });
  it('reserves Test film only and reports observations with initiating session scope', async () => {
    const f = await fixture(),
      body = { ...operation(), connectionId: f.connectionId };
    const a = await result(await reserve(req(body), eventContext(f.eventId)));
    expect(a).toEqual({
      attemptId: expect.any(String),
      connectionId: f.connectionId,
      state: 'Reserved',
      allowanceHold: 0,
      filmHold: 1,
      availability: { guestPrints: 10, filmSheets: f.stock - 1, printerBusy: true },
    });
    expect(await result(await reserve(req(body), eventContext(f.eventId)))).toEqual(a);
    const own = new Map(jar);
    await admin();
    expect(
      (await result(await observe(req(observation()), attemptContext(a.attemptId)), 403)).code
    ).toBe('forbidden');
    jar.clear();
    own.forEach((v, k) => jar.set(k, v));
    const accepted = await result(await observe(req(observation()), attemptContext(a.attemptId)));
    expect(accepted).toMatchObject({ state: 'Accepted', onHand: f.stock, filmHold: 1 });
    expect(
      (
        await result(
          await reconcile(req({ ...operation(), observedSheets: f.stock, reason: 'Count' })),
          409
        )
      ).code
    ).toBe('pending_attempt');
    expect(
      (
        await result(
          await cancel(req({ ...operation(), expectedRevision: 1 }), eventContext(f.eventId)),
          409
        )
      ).code
    ).toBe('pending_attempt');
    const ejected = observation('physicalEjectionVerified', 'simulator_ejection');
    const confirmed = await result(await observe(req(ejected), attemptContext(a.attemptId)));
    expect(confirmed).toMatchObject({
      state: 'Confirmed',
      onHand: f.stock - 1,
      filmHold: 0,
      availability: { guestPrints: 10, filmSheets: f.stock - 1, printerBusy: false },
    });
    expect(await result(await observe(req(ejected), attemptContext(a.attemptId)))).toEqual(
      confirmed
    );
    const inspection = { ...operation(), usable: true };
    expect(await result(await inspect(req(inspection), attemptContext(a.attemptId)))).toEqual({
      attemptId: a.attemptId,
      state: 'Confirmed',
      connectionId: f.connectionId,
      usable: true,
    });
    expect(await result(await inspect(req(inspection), attemptContext(a.attemptId)))).toMatchObject(
      { usable: true }
    );
  });
  it('rejects Guest attempts at the Admin Test observation route', async () => {
    const f = await fixture(),
      run = randomUUID(),
      session = randomUUID(),
      capture = randomUUID(),
      attempt = randomUUID();
    sql(
      `insert into public.booth_runs(id,event_id,state) values('${run}','${f.eventId}','Paused');insert into public.guest_sessions(id,event_id,run_id) values('${session}','${f.eventId}','${run}');insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${capture}','${f.eventId}','${run}','${session}',now());insert into public.print_attempts(id,event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id) values('${attempt}','${f.eventId}','${run}','${session}','${capture}','Guest','Uncertain','${randomUUID()}','${f.connectionId}')`
    );
    expect(
      (await result(await observe(req(observation()), attemptContext(attempt)), 403)).code
    ).toBe('forbidden');
    const body = {
      ...operation(),
      outcome: 'ejected',
      inspectionReason: 'Inspected physical sheet',
    };
    const resolved = await result(await settle(req(body), attemptContext(attempt)));
    expect(resolved).toMatchObject({
      state: 'AdminResolvedEjected',
      journalEntryId: expect.any(String),
      stockEntryId: expect.any(String),
      onHand: f.stock - 1,
      availability: { guestPrints: 9 },
    });
    expect(await result(await settle(req(body), attemptContext(attempt)))).toEqual(resolved);
    const wasted = { ...operation(), reason: 'Sheet damaged' };
    const corrected = await result(await waste(req(wasted), attemptContext(attempt)));
    expect(corrected).toMatchObject({
      state: 'WastedFilm',
      onHand: f.stock - 1,
      availability: { guestPrints: 10 },
    });
    expect(await result(await waste(req(wasted), attemptContext(attempt)))).toEqual(corrected);
    expect(
      sql(`select signed_sheets from public.film_stock_entries where attempt_id='${attempt}'`)
    ).toEqual([{ signed_sheets: -1 }]);
  });
  it('resolves an Uncertain print as unused without consuming stock and replays its entry IDs', async () => {
    const f = await fixture(),
      run = randomUUID(),
      session = randomUUID(),
      capture = randomUUID(),
      attempt = randomUUID();
    sql(
      `insert into public.booth_runs(id,event_id,state) values('${run}','${f.eventId}','Paused');insert into public.guest_sessions(id,event_id,run_id) values('${session}','${f.eventId}','${run}');insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${capture}','${f.eventId}','${run}','${session}',now());insert into public.print_attempts(id,event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id) values('${attempt}','${f.eventId}','${run}','${session}','${capture}','Guest','Uncertain','${randomUUID()}','${f.connectionId}')`
    );
    const body = {
      ...operation(),
      outcome: 'unused',
      inspectionReason: 'Inspected printer; no sheet used',
    };
    const resolved = await result(await settle(req(body), attemptContext(attempt)));
    expect(resolved).toMatchObject({
      attemptId: attempt,
      state: 'AdminResolvedUnused',
      allowanceHold: 0,
      filmHold: 0,
      onHand: f.stock,
      journalEntryId: expect.any(String),
      stockEntryId: null,
      availability: { guestPrints: 10, filmSheets: f.stock, printerBusy: false },
    });
    expect(
      sql(
        `select id from public.print_attempt_events where attempt_id='${attempt}' and state='AdminResolvedUnused'`
      )
    ).toEqual([{ id: resolved.journalEntryId }]);
    expect(sql(`select id from public.film_stock_entries where attempt_id='${attempt}'`)).toEqual(
      []
    );
    expect(await result(await settle(req(body), attemptContext(attempt)))).toEqual(resolved);
  });
  it.each(['production', 'disabled'])(
    'keeps Test reservation and confirmation closed when %s',
    async (mode) => {
      const f = await fixture(),
        a = await testAttempt(f);
      if (mode === 'production') vi.stubEnv('NODE_ENV', 'production');
      else vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'false');
      expect(
        (
          await result(
            await reserve(
              req({ ...operation(), connectionId: f.connectionId }),
              eventContext(f.eventId)
            ),
            409
          )
        ).code
      ).toBe('state_conflict');
      expect(
        (
          await result(
            await observe(
              req(observation('physicalEjectionVerified', 'simulator_ejection')),
              attemptContext(a.attemptId)
            ),
            400
          )
        ).code
      ).toBe('invalid_evidence');
      expect(sql(`select state from public.print_attempts where id='${a.attemptId}'`)).toEqual([
        { state: 'Reserved' },
      ]);
    }
  );
  it('rejects arbitrary printer evidence, wrong observation/code pairs and malformed timestamps', async () => {
    const f = await fixture(),
      a = await testAttempt(f);
    expect(
      (
        await result(
          await observe(
            req(observation('physicalEjectionVerified', '12_7f')),
            attemptContext(a.attemptId)
          ),
          400
        )
      ).code
    ).toBe('invalid_evidence');
    expect(
      (
        await result(
          await observe(
            req(observation('commandAccepted', 'simulator_ejection')),
            attemptContext(a.attemptId)
          ),
          400
        )
      ).code
    ).toBe('invalid_evidence');
    expect(
      (
        await result(
          await observe(
            req({ ...observation(), observedAt: 'not-a-date' }),
            attemptContext(a.attemptId)
          ),
          400
        )
      ).code
    ).toBe('validation_error');
  });
});
