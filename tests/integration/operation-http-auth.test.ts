// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { localSupabase, localSupabaseStatus } from '../fixtures/local-supabase';
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
import { requireAdminRequest } from '@/lib/operations/admin-authority';
import { POST as prepare } from '@/app/api/admin/events/[eventId]/booth-handoffs/route';
import { POST as issue } from '@/app/api/admin/booth-handoffs/[handoffId]/issue/route';
import { POST as confirm } from '@/app/api/booth/handoffs/confirm/route';
import { GET as bootstrap } from '@/app/api/booth/bootstrap/route';
function sql(query: string) {
  execFileSync(
    resolve('node_modules/.bin/supabase'),
    ['db', 'query', '--local', query, '-o', 'json'],
    { stdio: 'pipe' }
  );
}
const local = localSupabase();
const status = localSupabaseStatus();
const ids: string[] = [];
function req(body?: unknown, cookie = '', origin = 'https://booth.test') {
  return new Request('https://booth.test/api/test', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin, cookie, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const cookiePair = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((v) => v.startsWith(name + '='))
    ?.split(';')[0] ?? '';
beforeAll(() => {
  const s = status;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', s.API_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', s.ANON_KEY);
  vi.stubEnv('SUPABASE_SECRET_KEY', s.SERVICE_ROLE_KEY);
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
});
afterAll(() => vi.unstubAllEnvs());
afterEach(async () => {
  vi.restoreAllMocks();
  jar.clear();
  for (const id of ids.splice(0))
    sql(
      `do $$ begin delete from public.additional_print_entries where event_id='${id}'; delete from public.operation_receipts where event_id='${id}'; delete from public.activity_events where event_id='${id}'; delete from public.booth_handoffs where event_id='${id}'; delete from public.booth_grants where event_id='${id}'; delete from public.print_attempt_events where attempt_id in(select id from public.print_attempts where event_id='${id}'); delete from public.print_attempts where event_id='${id}'; delete from public.captures where event_id='${id}'; delete from public.guest_sessions where event_id='${id}'; delete from public.booth_runs where event_id='${id}'; delete from public.events where id='${id}'; update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries); end $$`
    );
  await local.cleanup();
}, 20000);
async function admin(allowed = true) {
  const user = await local.provisionUser();
  if (allowed) await local.allowlist(user.id);
  const s = status;
  const client = createServerClient(s.API_URL, s.ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  expect((await client.auth.signInWithPassword(user)).error).toBeNull();
  return { user, client };
}
async function fixture() {
  const a = await admin();
  const eventId = randomUUID(),
    connectionId = randomUUID();
  ids.push(eventId);
  expect(
    (
      await local.service.from('events').insert({
        id: eventId,
        title: 'Safe title',
        client_name: 'Private Client',
        client_email: 'private@example.test',
        client_phone: '123',
        venue_address: 'Private venue',
        time_zone: 'Asia/Manila',
        starts_at: '2026-12-01T10:00:00Z',
        ends_at: '2026-12-01T12:00:00Z',
        film_package_count: 1,
        original_print_allowance: 10,
      })
    ).error
  ).toBeNull();
  expect(
    (
      await local.service.from('print_attempts').insert({
        event_id: eventId,
        kind: 'Test',
        state: 'Confirmed',
        test_output_usable: true,
        request_key: randomUUID(),
        connection_id: connectionId,
      })
    ).error
  ).toBeNull();
  sql('update public.film_stock_balance set on_hand=10');
  return {
    ...a,
    eventId,
    body: {
      operationKey: randomUUID(),
      expectedRevision: 1,
      connectionId,
      setupEvidence: { cameraReady: true, printerReady: true, guidedAccessReady: true },
    },
  };
}
async function prepared() {
  const f = await fixture();
  const response = await prepare(req(f.body), { params: Promise.resolve({ eventId: f.eventId }) });
  expect(response.status).toBe(200);
  const data = await response.json();
  return { ...f, data, device: cookiePair(response, '__Host-booth-device') };
}
describe('HTTP authority and handoff with real local Auth/database', { timeout: 20000 }, () => {
  async function issuedGrant(active = true) {
    const f = await prepared();
    const response = await issue(req({ operationKey: randomUUID() }, f.device), {
      params: Promise.resolve({ handoffId: f.data.handoffId }),
    });
    expect(response.status).toBe(200);
    const grant = cookiePair(response, '__Host-booth-grant');
    const confirmation = { operationKey: randomUUID(), handoffId: f.data.handoffId };
    if (active) expect((await confirm(req(confirmation, grant))).status).toBe(200);
    return { ...f, grant, confirmation };
  }
  it.each(['production', 'disabled'])(
    'blocks inactive simulator handoff activation when runtime is %s',
    async (mode) => {
      const f = await issuedGrant(false);
      try {
        if (mode === 'production') vi.stubEnv('NODE_ENV', 'production');
        else vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'false');
        const response = await confirm(req(f.confirmation, f.grant));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'state_conflict' });
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(
          (await local.service.from('booth_runs').select('state').eq('id', f.data.runId).single())
            .data?.state
        ).toBe('Prepared');
        expect(
          (
            await local.service
              .from('booth_grants')
              .select('state')
              .eq('run_id', f.data.runId)
              .single()
          ).data?.state
        ).toBe('Inactive');
      } finally {
        vi.stubEnv('NODE_ENV', 'test');
        vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
      }
    }
  );
  it.each(['booth_grants', 'booth_runs', 'events', 'film_stock_balance'])(
    'preserves a valid cookie after temporary bootstrap %s read failure',
    async (table) => {
      const f = await issuedGrant(),
        originalFetch = globalThis.fetch;
      const fault = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((input, init) =>
          String(input).includes('/rest/v1/' + table + '?')
            ? Promise.resolve(
                new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } })
              )
            : originalFetch(input, init)
        );
      const failed = await bootstrap(req(undefined, f.grant));
      expect(failed.status).toBeGreaterThanOrEqual(400);
      expect(await failed.text()).not.toContain('Safe title');
      expect(failed.headers.get('cache-control')).toContain('private, no-store');
      expect(failed.headers.get('set-cookie')).toBeNull();
      fault.mockRestore();
      expect((await bootstrap(req(undefined, f.grant))).status).toBe(200);
    }
  );
  it.each([false, true])(
    'preserves cookie for confirmation retry when RPC committed=%s',
    async (committed) => {
      const f = await issuedGrant(false),
        originalFetch = globalThis.fetch;
      const fault = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (!String(input).includes('/rest/v1/rpc/confirm_booth_handoff'))
          return originalFetch(input, init);
        if (committed) {
          const response = await originalFetch(input, init);
          expect(response.ok).toBe(true);
        }
        return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
      });
      const failed = await confirm(req(f.confirmation, f.grant));
      expect(failed.status).toBeGreaterThanOrEqual(400);
      expect(failed.headers.get('cache-control')).toContain('private, no-store');
      expect(failed.headers.get('set-cookie')).toBeNull();
      fault.mockRestore();
      expect(
        (await local.service.from('booth_grants').select('state').eq('event_id', f.eventId)).data
      ).toEqual([{ state: committed ? 'Active' : 'Inactive' }]);
      expect((await confirm(req(f.confirmation, f.grant))).status).toBe(200);
      expect((await bootstrap(req(undefined, f.grant))).status).toBe(200);
    }
  );
  it('preserves inactive cookies after bootstrap denial, invalid confirmation input and mismatched handoff', async () => {
    const f = await issuedGrant(false);
    const responses = [
      await bootstrap(req(undefined, f.grant)),
      await confirm(req({ ...f.confirmation, photo: 'not accepted' }, f.grant)),
      await confirm(req({ ...f.confirmation, handoffId: randomUUID() }, f.grant)),
      await confirm(req(f.confirmation, f.grant, 'https://evil.test')),
    ];
    for (const response of responses) {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect((await confirm(req(f.confirmation, f.grant))).status).toBe(200);
  });
  it('preserves the inactive cookie when confirmation grant lookup fails temporarily', async () => {
    const f = await issuedGrant(false),
      originalFetch = globalThis.fetch;
    const fault = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) =>
        String(input).includes('/rest/v1/booth_grants?')
          ? Promise.resolve(
              new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } })
            )
          : originalFetch(input, init)
      );
    const response = await confirm(req(f.confirmation, f.grant));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get('set-cookie')).toBeNull();
    fault.mockRestore();
    expect(
      (await local.service.from('booth_grants').select('state').eq('event_id', f.eventId)).data
    ).toEqual([{ state: 'Inactive' }]);
    expect((await confirm(req(f.confirmation, f.grant))).status).toBe(200);
  });
  it('clears definitively unknown grant proof on bootstrap and confirmation', async () => {
    for (const response of [
      await bootstrap(req(undefined, '__Host-booth-grant=' + 'a'.repeat(64))),
      await confirm(
        req(
          { operationKey: randomUUID(), handoffId: randomUUID() },
          '__Host-booth-grant=' + 'a'.repeat(64)
        )
      ),
    ]) {
      expect(response.status).toBe(403);
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    }
  });
  it.each(['Confirmed', 'AdminResolvedEjected'])(
    'restores bootstrap allowance for a historical %s Wasted Film journal',
    async (state) => {
      const f = await prepared();
      const issued = await issue(req({ operationKey: randomUUID() }, f.device), {
        params: Promise.resolve({ handoffId: f.data.handoffId }),
      });
      const grant = cookiePair(issued, '__Host-booth-grant');
      await confirm(req({ operationKey: randomUUID(), handoffId: f.data.handoffId }, grant));
      const sessionId = randomUUID(),
        captureId = randomUUID(),
        attemptId = randomUUID();
      sql(`do $$ begin
      insert into public.guest_sessions(id,event_id,run_id,state,closed_at) values('${sessionId}','${f.eventId}','${f.data.runId}','Printed',now());
      insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${captureId}','${f.eventId}','${f.data.runId}','${sessionId}',now());
      insert into public.print_attempts(id,event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id) values('${attemptId}','${f.eventId}','${f.data.runId}','${sessionId}','${captureId}','Guest','${state}',gen_random_uuid(),'${f.body.connectionId}');
    end $$`);
      expect(await (await bootstrap(req(undefined, grant))).json()).toMatchObject({
        availability: { guestPrints: 9 },
      });
      sql(
        `insert into public.print_attempt_events(attempt_id,actor_scope,state,reason) values('${attemptId}','fixture','WastedFilm','Historical unusable sheet')`
      );
      expect(await (await bootstrap(req(undefined, grant))).json()).toMatchObject({
        availability: { guestPrints: 10 },
      });
    }
  );
  it('returns fresh safe state for a stale prepare revision', async () => {
    const f = await fixture();
    const response = await prepare(req({ ...f.body, expectedRevision: 2 }), {
      params: Promise.resolve({ eventId: f.eventId }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'state_conflict',
      current: { state: 'Draft', revision: 1 },
    });
  });
  it('counts allowance beyond the Data API row limit', async () => {
    const f = await prepared();
    sql(
      `insert into public.additional_print_entries(event_id,quantity,actor_id) select '${f.eventId}',1,'${f.user.id}' from generate_series(1,1001)`
    );
    const issued = await issue(req({ operationKey: randomUUID() }, f.device), {
      params: Promise.resolve({ handoffId: f.data.handoffId }),
    });
    const grant = cookiePair(issued, '__Host-booth-grant');
    await confirm(req({ operationKey: randomUUID(), handoffId: f.data.handoffId }, grant));
    const response = await bootstrap(req(undefined, grant));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      availability: { guestPrints: 1011, filmSheets: 10, printerBusy: false },
    });
  });
  it('denies an explicitly expired Auth session in both profile RLS and request guard', async () => {
    const a = await admin();
    const claims = await a.client.auth.getClaims();
    const sessionId = claims.data!.claims.session_id;
    sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${sessionId}'`);
    expect((await a.client.from('admin_profiles').select('id')).data).toEqual([]);
    await expect(requireAdminRequest(req())).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('does not sign out an Admin when device or initiating session differs', async () => {
    const f = await prepared();
    const wrong = await issue(
      req({ operationKey: randomUUID() }, '__Host-booth-device=' + 'a'.repeat(64)),
      { params: Promise.resolve({ handoffId: f.data.handoffId }) }
    );
    expect(wrong.status).toBe(403);
    expect(await requireAdminRequest(req())).toMatchObject({ userId: f.user.id });
    jar.clear();
    await admin();
    const other = await issue(req({ operationKey: randomUUID() }, f.device), {
      params: Promise.resolve({ handoffId: f.data.handoffId }),
    });
    expect(other.status).toBe(403);
    await expect(requireAdminRequest(req())).resolves.toBeDefined();
  });
  it('pauses and never sends a grant cookie after rejected local sign-out', async () => {
    const f = await prepared(),
      originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      String(input).includes('/auth/v1/logout')
        ? Promise.resolve(
            new Response(JSON.stringify({ msg: 'Sign-out unavailable' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            })
          )
        : originalFetch(input, init)
    );
    const response = await issue(req({ operationKey: randomUUID() }, f.device), {
      params: Promise.resolve({ handoffId: f.data.handoffId }),
    });
    expect(response.status).toBe(409);
    expect(await response.clone().json()).toMatchObject({ current: { state: 'Paused' } });
    expect(cookiePair(response, '__Host-booth-grant')).toBe('');
    expect(
      (await local.service.from('booth_runs').select('state').eq('event_id', f.eventId)).data
    ).toEqual([{ state: 'Paused' }]);
    expect((await bootstrap(req())).status).toBe(401);
  }, 20000);
  it('leaves a lost cookie inactive and permits explicit authenticated pause recovery', async () => {
    const f = await prepared();
    await issue(req({ operationKey: randomUUID() }, f.device), {
      params: Promise.resolve({ handoffId: f.data.handoffId }),
    });
    expect(
      (await confirm(req({ operationKey: randomUUID(), handoffId: f.data.handoffId }))).status
    ).toBe(401);
    expect(
      (await local.service.from('booth_runs').select('state').eq('event_id', f.eventId)).data
    ).toEqual([{ state: 'Prepared' }]);
    expect((await bootstrap(req())).status).toBe(401);
    const recovered = await local.signIn(f.user);
    const claims = await recovered.client.auth.getClaims();
    const paused = await local.service.rpc('change_event_run', {
      admin_user_id: f.user.id,
      admin_session_id: claims.data!.claims.session_id,
      event_id: f.eventId,
      expected_revision: f.data.revision,
      operation_key: randomUUID(),
      action: 'pause',
    });
    expect(paused.error).toBeNull();
    expect(paused.data.run_state).toBe('Paused');
  });
  it('expires an issued handoff into Paused without revealing Event details', async () => {
    const f = await prepared();
    const issued = await issue(req({ operationKey: randomUUID() }, f.device), {
      params: Promise.resolve({ handoffId: f.data.handoffId }),
    });
    sql(
      `update public.booth_handoffs set expires_at=now()-interval '1 second' where id='${f.data.handoffId}'`
    );
    const response = await confirm(
      req(
        { operationKey: randomUUID(), handoffId: f.data.handoffId },
        cookiePair(issued, '__Host-booth-grant')
      )
    );
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('Safe title');
    expect(
      (await local.service.from('booth_runs').select('state').eq('event_id', f.eventId)).data
    ).toEqual([{ state: 'Paused' }]);
  });

  it('denies missing Admin and Booth-only credentials', async () => {
    for (const cookie of ['', '__Host-booth-grant=' + 'a'.repeat(64)])
      await expect(requireAdminRequest(req(undefined, cookie))).rejects.toMatchObject({
        code: 'unauthorized',
      });
  });
  it('denies unprovisioned and revoked Admin sessions', async () => {
    await admin(false);
    await expect(requireAdminRequest(req())).rejects.toMatchObject({ code: 'forbidden' });
    jar.clear();
    const a = await admin();
    const old = new Map(jar);
    expect(await requireAdminRequest(req())).toMatchObject({ userId: a.user.id });
    await a.client.auth.signOut({ scope: 'local' });
    jar.clear();
    old.forEach((v, k) => jar.set(k, v));
    await expect(requireAdminRequest(req())).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('rejects cross-origin and body authority before mutation', async () => {
    const f = await fixture();
    for (const [body, origin] of [
      [f.body, 'https://evil.test'],
      [{ ...f.body, deviceTokenHash: 'a'.repeat(64) }, 'https://booth.test'],
      [{ ...f.body, photo: 'data:image/jpeg;base64,secret' }, 'https://booth.test'],
    ] as const) {
      const response = await prepare(req(body, '', origin), {
        params: Promise.resolve({ eventId: f.eventId }),
      });
      expect([400, 403]).toContain(response.status);
    }
    expect(
      (await local.service.from('booth_runs').select().eq('event_id', f.eventId)).data
    ).toEqual([]);
  });
  it('keeps production printer entry closed even when simulator flag is set', async () => {
    const f = await fixture();
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(
        (await prepare(req(f.body), { params: Promise.resolve({ eventId: f.eventId }) })).status
      ).toBe(409);
    } finally {
      vi.stubEnv('NODE_ENV', 'test');
    }
  });
  it('signs out only local Admin, issues inactive cookie, and opens safe bootstrap only after confirmation', async () => {
    const f = await prepared();
    const other = await local.signIn(f.user);
    const issued = await issue(req({ operationKey: randomUUID() }, f.device), {
      params: Promise.resolve({ handoffId: f.data.handoffId }),
    });
    expect(issued.status).toBe(200);
    const grant = cookiePair(issued, '__Host-booth-grant');
    expect(grant).not.toBe('');
    expect(issued.headers.get('set-cookie')).toMatch(/HttpOnly/);
    expect(issued.headers.get('set-cookie')).toMatch(/Secure/);
    expect(issued.headers.get('set-cookie')).toMatch(/SameSite=strict/);
    expect((await bootstrap(req(undefined, grant))).status).toBe(403);
    expect((await bootstrap(req())).status).toBe(401);
    await expect(requireAdminRequest(req())).rejects.toBeDefined();
    expect((await other.client.from('admin_profiles').select('id')).data).toHaveLength(1);
    const activated = await confirm(
      req({ operationKey: randomUUID(), handoffId: f.data.handoffId }, grant)
    );
    expect(activated.status).toBe(200);
    const response = await bootstrap(req(undefined, grant));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('Safe title');
    for (const secret of [
      'Private Client',
      'private@example.test',
      'Private venue',
      grant.split('=')[1],
      'secret_hash',
    ])
      expect(text).not.toContain(secret);
    expect(response.headers.get('cache-control')).toContain('private, no-store');
  });
  it.each(['expired', 'revoked', 'wrong-run'])(
    'denies %s grants without any display data',
    async (condition) => {
      const f = await prepared();
      const issued = await issue(req({ operationKey: randomUUID() }, f.device), {
        params: Promise.resolve({ handoffId: f.data.handoffId }),
      });
      const grant = cookiePair(issued, '__Host-booth-grant');
      await confirm(req({ operationKey: randomUUID(), handoffId: f.data.handoffId }, grant));
      if (condition === 'expired')
        sql(
          `update public.booth_grants set created_at=now()-interval '2 hours',expires_at=now()-interval '1 second' where event_id='${f.eventId}'`
        );
      else if (condition === 'revoked')
        sql(
          `update public.booth_grants set state='Revoked',revoked_at=now() where event_id='${f.eventId}'`
        );
      else
        sql(
          `do $$ declare r uuid; begin insert into public.booth_runs(event_id,state) values('${f.eventId}','Paused') returning id into r; update public.booth_grants set run_id=r where event_id='${f.eventId}'; end $$`
        );
      const response = await bootstrap(req(undefined, grant));
      expect([401, 403]).toContain(response.status);
      expect(await response.text()).not.toContain('Safe title');
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    }
  );
});
