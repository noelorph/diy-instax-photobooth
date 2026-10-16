// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { localSupabase, localSupabaseStatus } from '../fixtures/local-supabase';
vi.mock('server-only', () => ({}));
import { POST as open } from '@/app/api/booth/guest-sessions/route';
import { POST as capture } from '@/app/api/booth/guest-sessions/[sessionId]/captures/route';
import { POST as reserve } from '@/app/api/booth/guest-sessions/[sessionId]/print-attempts/route';
import { GET as bootstrap } from '@/app/api/booth/bootstrap/route';
import { POST as abandon } from '@/app/api/booth/guest-sessions/[sessionId]/abandon/route';
import { POST as pause } from '@/app/api/booth/pauses/route';
const local = localSupabase(),
  status = localSupabaseStatus(),
  ids: string[] = [];
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
const op = () => ({ operationKey: randomUUID() });
const sessionContext = (sessionId: string) => ({ params: Promise.resolve({ sessionId }) });
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
afterEach(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
  for (const id of ids.splice(0))
    sql(
      `delete from public.operation_receipts where event_id='${id}';delete from public.activity_events where event_id='${id}';delete from public.film_stock_entries where event_id='${id}';delete from public.print_attempt_events where attempt_id in(select id from public.print_attempts where event_id='${id}');delete from public.print_attempts where event_id='${id}';delete from public.captures where event_id='${id}';delete from public.guest_sessions where event_id='${id}';delete from public.booth_grants where event_id='${id}';delete from public.booth_runs where event_id='${id}';delete from public.events where id='${id}'`
    );
  sql(
    "update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries);update public.printer_completion_policy set mode='disabled'"
  );
  await local.cleanup();
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
async function shuttered() {
  const f = fixture();
  const session = await result(await open(request(f.secret, { ...op(), runId: f.runId })));
  return {
    ...f,
    sessionId: session.sessionId as string,
    input: { ...op(), capturedAt: new Date().toISOString() },
  };
}
async function stop(
  f: Awaited<ReturnType<typeof shuttered>>,
  method: 'booth' | 'pause' | 'complete' | 'cancel' = 'booth'
) {
  if (method === 'booth') await result(await pause(request(f.secret, op())));
  else {
    const user = await local.provisionUser();
    expect((await local.allowlist(user.id)).error).toBeNull();
    const signed = await local.signIn(user);
    const sessionId = JSON.parse(
      Buffer.from(signed.session.access_token.split('.')[1], 'base64url').toString()
    ).session_id;
    const changed = await local.service.rpc('change_event_run', {
      admin_user_id: user.id,
      admin_session_id: sessionId,
      event_id: f.eventId,
      expected_revision: 1,
      operation_key: randomUUID(),
      action: method,
    });
    expect(changed.error).toBeNull();
  }
}
const send = (f: Awaited<ReturnType<typeof shuttered>>, input = f.input) =>
  capture(request(f.secret, input), sessionContext(f.sessionId));
describe('bounded late Capture metadata', { timeout: 45000 }, () => {
  it.each(['booth', 'pause', 'complete', 'cancel'] as const)(
    'acknowledges a pre-stop shutter whose first request arrives after %s revocation',
    async (method) => {
      const f = await shuttered();
      await stop(f, method);
      expect(
        sql(
          `select s.closed_at=g.revoked_at as matched from public.guest_sessions s join public.booth_grants g on g.run_id=s.run_id where s.id='${f.sessionId}'`
        )[0].matched
      ).toBe(true);
      const response = await send(f);
      const saved = await result(response);
      expect(saved).toMatchObject({
        sessionId: f.sessionId,
        captureCount: 1,
        sessionState: 'Abandoned',
      });
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(await result(await send(f))).toEqual(saved);
      expect(
        (
          await send(f, {
            ...f.input,
            capturedAt: new Date(Date.parse(f.input.capturedAt) - 1).toISOString(),
          })
        ).status
      ).toBe(409);
      expect((await send(f, { ...f.input, ...op() })).status).toBe(403);
      expect(
        sql(
          `select count(*)::int as count from public.captures where session_id='${f.sessionId}'`
        )[0].count
      ).toBe(1);
      expect((await open(request(f.secret, { ...op(), runId: f.runId }))).status).toBe(403);
      expect(
        (
          await reserve(
            request(f.secret, { ...op(), runId: f.runId, captureId: saved.captureId }),
            sessionContext(f.sessionId)
          )
        ).status
      ).toBe(403);
      expect((await bootstrap(request(f.secret, {}))).status).toBe(403);
      expect(
        (
          await local.client().rpc('record_capture', {
            grant_hash: f.hash,
            session_id: f.sessionId,
            operation_key: randomUUID(),
            captured_at: f.input.capturedAt,
          })
        ).error
      ).not.toBeNull();
    }
  );
  it('replays a Capture committed before stop without inserting a late duplicate', async () => {
    const f = await shuttered();
    const first = await result(await send(f));
    await stop(f);
    const replay = await result(await send(f));
    expect(replay.captureId).toBe(first.captureId);
    expect(replay.sessionState).toBe('Abandoned');
    expect(
      sql(`select count(*)::int as count from public.captures where session_id='${f.sessionId}'`)[0]
        .count
    ).toBe(1);
  });
  it.each([
    'scope',
    'after-stop',
    'before-session',
    'earlier-abandon',
    'expired',
    'window',
    'deleted',
    'unresolved',
    'printed',
  ] as const)('rejects an out-of-bound %s Capture', async (reason) => {
    const f = await shuttered();
    if (reason === 'earlier-abandon')
      await result(await abandon(request(f.secret, op()), sessionContext(f.sessionId)));
    await stop(f);
    if (reason === 'scope') {
      const otherRun = randomUUID();
      f.sessionId = randomUUID();
      sql(
        `insert into public.booth_runs(id,event_id,state) values('${otherRun}','${f.eventId}','Ended');insert into public.guest_sessions(id,event_id,run_id,state,created_at,closed_at) values('${f.sessionId}','${f.eventId}','${otherRun}','Abandoned',clock_timestamp()-interval '1 minute',(select revoked_at from public.booth_grants where run_id='${f.runId}'))`
      );
    }
    if (reason === 'after-stop') f.input.capturedAt = new Date(Date.now() + 60000).toISOString();
    if (reason === 'before-session')
      f.input.capturedAt = new Date(Date.parse(f.input.capturedAt) - 60000).toISOString();
    if (reason === 'expired')
      sql(
        `update public.booth_grants set expires_at=clock_timestamp()-interval '1 second' where run_id='${f.runId}'`
      );
    if (reason === 'window') {
      sql(
        `update public.booth_grants set revoked_at=clock_timestamp()-interval '121 seconds' where run_id='${f.runId}';update public.guest_sessions set created_at=clock_timestamp()-interval '5 minutes',closed_at=(select revoked_at from public.booth_grants where run_id='${f.runId}') where id='${f.sessionId}'`
      );
      f.input.capturedAt = new Date(Date.now() - 180000).toISOString();
    }
    if (reason === 'deleted')
      sql(
        `update public.events set deleted_at=clock_timestamp(),media_removal_state='pending',revision=revision+1,state='Draft',title=null,client_name=null,client_email=null,client_phone=null,venue_address=null,time_zone=null,starts_at=null,ends_at=null where id='${f.eventId}'`
      );
    if (reason === 'unresolved' || reason === 'printed') {
      const captureId = randomUUID();
      sql(
        `insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${captureId}','${f.eventId}','${f.runId}','${f.sessionId}','${f.input.capturedAt}');insert into public.print_attempts(event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id) values('${f.eventId}','${f.runId}','${f.sessionId}','${captureId}','Guest','${reason === 'printed' ? 'Confirmed' : 'Uncertain'}','${randomUUID()}','${f.connectionId}')`
      );
    }
    expect((await send(f)).status).toBe(reason === 'expired' ? 401 : 403);
    // HTTP preflight must not be the only boundary for these revoked proofs.
    if (['expired', 'window', 'deleted'].includes(reason)) {
      const direct = await local.service.rpc('record_capture', {
        grant_hash: f.hash,
        session_id: f.sessionId,
        operation_key: f.input.operationKey,
        captured_at: f.input.capturedAt,
      });
      expect(direct.error?.message).toBe(reason === 'expired' ? 'grant_expired' : 'forbidden');
    }
  });
  it('serializes distinct late operation keys into exactly one new Capture', async () => {
    const f = await shuttered();
    await stop(f);
    const responses = await Promise.all([send(f), send(f, { ...f.input, ...op() })]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 403]);
    expect(
      sql(`select count(*)::int as count from public.captures where session_id='${f.sessionId}'`)[0]
        .count
    ).toBe(1);
    const winner = await responses.find((response) => response.status === 200)!.json();
    expect(winner.sessionState).toBe('Abandoned');
    sql(
      `update public.booth_grants set expires_at=clock_timestamp()-interval '1 second' where run_id='${f.runId}'`
    );
    expect((await send(f)).status).toBe(401);
  });
});
