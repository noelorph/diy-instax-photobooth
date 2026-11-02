// @vitest-environment node
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { localOwnerSql, localSupabase, localSupabaseStatus } from '../fixtures/local-supabase';
vi.mock('server-only', () => ({}));
import { POST as open } from '@/app/api/booth/guest-sessions/route';
import { POST as abandon } from '@/app/api/booth/guest-sessions/[sessionId]/abandon/route';
import { POST as capture } from '@/app/api/booth/guest-sessions/[sessionId]/captures/route';
import { POST as reserve } from '@/app/api/booth/guest-sessions/[sessionId]/print-attempts/route';
import { POST as observe } from '@/app/api/booth/print-attempts/[attemptId]/observations/route';
import { POST as reconnect } from '@/app/api/booth/connection-changes/route';
import { GET as bootstrap } from '@/app/api/booth/bootstrap/route';
const local = localSupabase(),
  status = localSupabaseStatus(),
  ids: string[] = [];
function sql(query: string) {
  return localOwnerSql(/^select/i.test(query) ? query : `do $$ begin ${query}; end $$`);
}
const op = () => ({ operationKey: randomUUID() });
const sessionContext = (sessionId: string) => ({ params: Promise.resolve({ sessionId }) });
const attemptContext = (attemptId: string) => ({ params: Promise.resolve({ attemptId }) });
function request(secret: string, body: unknown, origin = 'https://booth.test') {
  return new Request('https://booth.test/api/booth/test', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', cookie: `__Host-booth-grant=${secret}` },
    body: JSON.stringify(body),
  });
}
async function result(response: Response, code = 200) {
  expect(response.status).toBe(code);
  expect(response.headers.get('cache-control')).toContain('private, no-store');
  const body = await response.json();
  expect(JSON.stringify(body)).not.toMatch(
    /client_email|private@example|secret_hash|grantHash|admin_user_id/
  );
  return body;
}
beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', status.API_URL);
  vi.stubEnv('SUPABASE_SECRET_KEY', status.SERVICE_ROLE_KEY);
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
});
afterAll(() => vi.unstubAllEnvs());
afterEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
  for (const id of ids.splice(0))
    sql(
      `delete from public.operation_receipts where event_id='${id}';delete from public.activity_events where event_id='${id}';delete from public.film_stock_entries where event_id='${id}';delete from public.print_attempt_events where attempt_id in(select id from public.print_attempts where event_id='${id}');delete from public.print_attempts where event_id='${id}';delete from public.captures where event_id='${id}';delete from public.guest_sessions where event_id='${id}';delete from public.booth_grants where event_id='${id}';delete from public.booth_runs where event_id='${id}';delete from public.events where id='${id}'`
    );
  sql(
    "update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries);update public.printer_completion_policy set mode='disabled'"
  );
}, 20000);
function fixture() {
  const eventId = randomUUID(),
    runId = randomUUID(),
    connectionId = randomUUID(),
    testId = randomUUID(),
    secret = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(secret).digest('hex');
  ids.push(eventId);
  sql(
    `insert into public.events(id,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance,state) values('${eventId}','Booth fixture','Client','private@example.test','123','Venue','Asia/Manila','2026-12-01T10:00Z','2026-12-01T12:00Z',1,10,'Live');insert into public.booth_runs(id,event_id,state,connection_id) values('${runId}','${eventId}','Active','${connectionId}');insert into public.booth_grants(event_id,run_id,state,secret_hash,expires_at) values('${eventId}','${runId}','Active','${hash}',now()+interval '1 hour');insert into public.print_attempts(id,event_id,kind,state,request_key,connection_id) values('${testId}','${eventId}','Test','Confirmed','${randomUUID()}','${connectionId}');insert into public.film_stock_entries(event_id,kind,signed_sheets,actor_scope) values('${eventId}','Addition',10,'fixture');update public.print_attempts set test_output_usable=true where id='${testId}';update public.film_stock_balance set on_hand=(select sum(signed_sheets) from public.film_stock_entries);update public.printer_completion_policy set mode='simulated'`
  );
  return {
    eventId,
    runId,
    connectionId,
    testId,
    secret,
    hash,
    stock: Number(sql('select on_hand from public.film_stock_balance')[0].on_hand),
  };
}
async function captured() {
  const f = fixture();
  const opened = await result(await open(request(f.secret, { ...op(), runId: f.runId })));
  const captured = await result(
    await capture(
      request(f.secret, { ...op(), capturedAt: '2026-10-16T12:00:00Z' }),
      sessionContext(opened.sessionId)
    )
  );
  return { ...f, sessionId: opened.sessionId as string, captureId: captured.captureId as string };
}
function calls(
  f: ReturnType<typeof fixture>,
  sessionId: string = randomUUID(),
  attemptId: string = randomUUID()
) {
  return [
    (body: unknown, secret = f.secret, origin?: string) => open(request(secret, body, origin)),
    (body: unknown, secret = f.secret, origin?: string) =>
      abandon(request(secret, body, origin), sessionContext(sessionId)),
    (body: unknown, secret = f.secret, origin?: string) =>
      capture(request(secret, body, origin), sessionContext(sessionId)),
    (body: unknown, secret = f.secret, origin?: string) =>
      reserve(request(secret, body, origin), sessionContext(sessionId)),
    (body: unknown, secret = f.secret, origin?: string) =>
      observe(request(secret, body, origin), attemptContext(attemptId)),
    (body: unknown, secret = f.secret, origin?: string) => reconnect(request(secret, body, origin)),
  ];
}
const observation = (observationKind = 'uncertain', evidenceCode = 'ambiguous_outcome') => ({
  ...op(),
  observationKind,
  evidenceCode,
  observedAt: '2026-10-16T12:00:00Z',
});
const reservation = (f: Awaited<ReturnType<typeof captured>>) => ({
  ...op(),
  runId: f.runId,
  captureId: f.captureId,
});
describe('Booth HTTP operations with real local grants and RPCs', { timeout: 30000 }, () => {
  it('rejects invalid grants and foreign origins with safe private responses', async () => {
    const f = fixture();
    for (const call of calls(f)) {
      for (const [secret, statusCode] of [
        ['bad', 401],
        ['a'.repeat(64), 403],
      ] as const) {
        const response = await call(op(), secret);
        await result(response, statusCode);
        expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
      }
      expect((await result(await call(op(), f.secret, 'https://evil.test'), 403)).code).toBe(
        'forbidden'
      );
    }
  });
  it('rejects photo bytes and asserted authority in exact request bodies', async () => {
    const f = fixture(),
      bodies = [
        { runId: f.runId },
        {},
        { capturedAt: '2026-10-16T12:00:00Z' },
        { runId: f.runId, captureId: randomUUID() },
        observation(),
        {},
      ];
    for (const [index, call] of calls(f).entries())
      for (const extra of [
        { photo: 'base64' },
        { grantHash: f.hash },
        { adminUserId: randomUUID() },
      ])
        expect((await result(await call({ ...op(), ...bodies[index], ...extra }), 400)).code).toBe(
          'validation_error'
        );
  });
  it('opens, captures and abandons idempotently while preserving metadata', async () => {
    const f = fixture(),
      body = { ...op(), runId: f.runId };
    expect(
      (await result(await open(request(f.secret, { ...body, runId: randomUUID() })), 403)).code
    ).toBe('forbidden');
    const s = await result(await open(request(f.secret, body)));
    expect(await result(await open(request(f.secret, body)))).toEqual(s);
    expect(s).toMatchObject({
      state: 'Open',
      availability: { guestPrints: 10, filmSheets: f.stock },
    });
    const cb = { ...op(), capturedAt: '2026-10-16T12:00:00Z' };
    const c = await result(await capture(request(f.secret, cb), sessionContext(s.sessionId)));
    expect(c.captureCount).toBe(1);
    expect(await result(await capture(request(f.secret, cb), sessionContext(s.sessionId)))).toEqual(
      c
    );
    const ab = op(),
      a = await result(await abandon(request(f.secret, ab), sessionContext(s.sessionId)));
    expect(a.state).toBe('Abandoned');
    expect(await result(await abandon(request(f.secret, ab), sessionContext(s.sessionId)))).toEqual(
      a
    );
    expect(sql(`select id from public.captures where session_id='${s.sessionId}'`)).toEqual([
      { id: c.captureId },
    ]);
  });
  it('reserves once, refuses wrong-run/Test scope, and reports accepted then simulator ejection', async () => {
    const f = await captured(),
      body = reservation(f),
      context = sessionContext(f.sessionId);
    await result(await reserve(request(f.secret, { ...body, runId: randomUUID() }), context), 403);
    const a = await result(await reserve(request(f.secret, body), context));
    expect(a).toMatchObject({
      state: 'Reserved',
      allowanceHold: 1,
      filmHold: 1,
      availability: { guestPrints: 9, filmSheets: f.stock - 1 },
    });
    expect(await result(await reserve(request(f.secret, body), context))).toEqual(a);
    await result(await observe(request(f.secret, observation()), attemptContext(f.testId)), 403);
    await result(
      await observe(request(f.secret, observation()), attemptContext(randomUUID())),
      403
    );
    const accepted = await result(
      await observe(
        request(f.secret, observation('commandAccepted', 'command_acknowledged')),
        attemptContext(a.attemptId)
      )
    );
    expect(accepted).toMatchObject({ state: 'Accepted', onHand: f.stock });
    const ob = observation('physicalEjectionVerified', 'simulator_ejection');
    const done = await result(await observe(request(f.secret, ob), attemptContext(a.attemptId)));
    expect(done).toMatchObject({ state: 'Confirmed', onHand: f.stock - 1, filmHold: 0 });
    expect(await result(await observe(request(f.secret, ob), attemptContext(a.attemptId)))).toEqual(
      done
    );
  });
  it.each(['uncertain', 'physicalEjectionVerified', 'knownUnsent'])(
    'PauseRequested permits only pending final report: %s',
    async (kind) => {
      const f = await captured(),
        a = await result(
          await reserve(request(f.secret, reservation(f)), sessionContext(f.sessionId))
        );
      sql(`update public.booth_runs set state='PauseRequested' where id='${f.runId}'`);
      for (const call of calls(f, f.sessionId, a.attemptId).slice(0, 4))
        await result(await call(op()), 403);
      await result(await reconnect(request(f.secret, op())), 403);
      await result(
        await observe(
          request(f.secret, observation('commandAccepted', 'command_acknowledged')),
          attemptContext(a.attemptId)
        ),
        409
      );
      await result(await observe(request(f.secret, observation()), attemptContext(f.testId)), 403);
      const evidence =
        kind === 'uncertain'
          ? 'ambiguous_outcome'
          : kind === 'knownUnsent'
            ? 'command_not_started'
            : 'simulator_ejection';
      const done = await result(
        await observe(request(f.secret, observation(kind, evidence)), attemptContext(a.attemptId))
      );
      expect(done.state).toBe(
        kind === 'uncertain' ? 'Uncertain' : kind === 'knownUnsent' ? 'RejectedUnused' : 'Confirmed'
      );
      expect(sql(`select state from public.booth_runs where id='${f.runId}'`)).toEqual([
        { state: 'Paused' },
      ]);
    }
  );
  it('refuses command acceptance in the database after a pause commits', async () => {
    const f = await captured(),
      a = await result(
        await reserve(request(f.secret, reservation(f)), sessionContext(f.sessionId))
      );
    sql(`update public.booth_runs set state='PauseRequested' where id='${f.runId}'`);
    const response = await local.service.rpc('report_booth_observation', {
      grant_hash: f.hash,
      attempt_id: a.attemptId,
      operation_key: randomUUID(),
      observation_kind: 'commandAccepted',
      evidence_code: 'command_acknowledged',
      observed_at: '2026-10-16T12:00:00Z',
    });
    expect(response.error?.message).toBe('state_conflict');
    expect(sql(`select state from public.print_attempts where id='${a.attemptId}'`)).toEqual([
      { state: 'Reserved' },
    ]);
  });
  it('stops on reconnect without pending work and keeps captures, denying revoked-key replay', async () => {
    const f = await captured(),
      body = op();
    expect(await result(await reconnect(request(f.secret, body)))).toMatchObject({
      runId: f.runId,
      state: 'Paused',
      attemptId: null,
    });
    await result(await reconnect(request(f.secret, body)), 403);
    await result(
      await reserve(request(f.secret, reservation(f)), sessionContext(f.sessionId)),
      403
    );
    expect(sql(`select state from public.guest_sessions where id='${f.sessionId}'`)).toEqual([
      { state: 'Abandoned' },
    ]);
    expect(sql(`select id from public.captures where session_id='${f.sessionId}'`)).toEqual([
      { id: f.captureId },
    ]);
  });
  it.each(['Reserved', 'Accepted'])(
    'reconnect preserves %s holds and open Session without stock consumption',
    async (state) => {
      const f = await captured(),
        a = await result(
          await reserve(request(f.secret, reservation(f)), sessionContext(f.sessionId))
        );
      if (state === 'Accepted')
        await result(
          await observe(
            request(f.secret, observation('commandAccepted', 'command_acknowledged')),
            attemptContext(a.attemptId)
          )
        );
      expect(await result(await reconnect(request(f.secret, op())))).toMatchObject({
        state: 'Paused',
        attemptId: a.attemptId,
        attemptState: 'Uncertain',
        availability: { guestPrints: 9, filmSheets: f.stock - 1, printerBusy: true },
      });
      expect(sql(`select state from public.guest_sessions where id='${f.sessionId}'`)).toEqual([
        { state: 'Open' },
      ]);
      expect(
        sql(
          `select state,evidence_kind from public.print_attempt_events where attempt_id='${a.attemptId}' and state='Uncertain'`
        )
      ).toEqual([{ state: 'Uncertain', evidence_kind: 'connection_changed' }]);
      expect(
        sql(`select id from public.film_stock_entries where attempt_id='${a.attemptId}'`)
      ).toEqual([]);
      expect(Number(sql('select on_hand from public.film_stock_balance')[0].on_hand)).toBe(f.stock);
    }
  );
  it('serializes a reconnect racing reservation, permitting at most one held attempt and no work after stop', async () => {
    const f = await captured();
    const [reserved, stopped] = await Promise.all([
      reserve(request(f.secret, reservation(f)), sessionContext(f.sessionId)),
      reconnect(request(f.secret, op())),
    ]);
    await result(stopped);
    expect([200, 403]).toContain(reserved.status);
    const attempts = sql(`select state from public.print_attempts where run_id='${f.runId}'`);
    expect(attempts.length).toBeLessThanOrEqual(1);
    if (attempts.length) expect(attempts).toEqual([{ state: 'Uncertain' }]);
    await result(
      await reserve(request(f.secret, reservation(f)), sessionContext(f.sessionId)),
      403
    );
    expect(sql(`select state from public.booth_runs where id='${f.runId}'`)).toEqual([
      { state: 'Paused' },
    ]);
  });
  it.each(['production', 'disabled'])(
    'blocks carried-over active simulator authority in %s',
    async (mode) => {
      const f = await captured();
      if (mode === 'production') vi.stubEnv('NODE_ENV', 'production');
      else vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'false');
      for (const call of calls(f, f.sessionId))
        expect((await result(await call(op()), 409)).code).toBe('state_conflict');
      await result(await bootstrap(request(f.secret, op())), 409);
      expect(sql(`select state from public.booth_runs where id='${f.runId}'`)).toEqual([
        { state: 'Active' },
      ]);
    }
  );
  it('rejects malformed and unqualified observation evidence', async () => {
    const f = await captured(),
      a = await result(
        await reserve(request(f.secret, reservation(f)), sessionContext(f.sessionId))
      );
    await result(
      await observe(
        request(f.secret, observation('physicalEjectionVerified', '12_7f')),
        attemptContext(a.attemptId)
      ),
      400
    );
    await result(
      await observe(
        request(f.secret, { ...observation(), observedAt: 'not-a-time' }),
        attemptContext(a.attemptId)
      ),
      400
    );
  });
  it('restricts the reconnect RPC to service role and validates run scope before any mutation', async () => {
    const f = fixture();
    expect(
      sql(
        "select has_function_privilege('anon','public.pause_booth_for_reconnect(text,uuid,uuid)','EXECUTE') as anon,has_function_privilege('authenticated','public.pause_booth_for_reconnect(text,uuid,uuid)','EXECUTE') as authenticated"
      )
    ).toEqual([{ anon: false, authenticated: false }]);
    const wrong = await local.service.rpc('pause_booth_for_reconnect', {
      grant_hash: f.hash,
      run_id: randomUUID(),
      operation_key: randomUUID(),
    });
    expect(wrong.error?.message).toBe('forbidden');
    expect(sql(`select state from public.booth_runs where id='${f.runId}'`)).toEqual([
      { state: 'Active' },
    ]);
  });
});
