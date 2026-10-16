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
import { POST as observe } from '@/app/api/booth/print-attempts/[attemptId]/observations/route';
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
describe('protected Booth pause', { timeout: 30000 }, () => {
  it('pauses immediately without a reservation, abandons session and keeps Capture count', async () => {
    const f = await captured();
    const response = await pause(request(f.secret, op()));
    expect((await result(response)).state).toBe('Paused');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(sql(`select state from public.guest_sessions where id='${f.sessionId}'`)[0].state).toBe(
      'Abandoned'
    );
    expect(
      sql(`select count(*)::int as count from public.captures where session_id='${f.sessionId}'`)[0]
        .count
    ).toBe(1);
    expect((await pause(request(f.secret, op()))).status).toBe(403);
  });
  it('waits for a pending print and does not manufacture uncertainty', async () => {
    const f = await captured();
    const attempt = await result(
      await reserve(
        request(f.secret, { ...op(), runId: f.runId, captureId: f.captureId }),
        sessionContext(f.sessionId)
      )
    );
    const key = op();
    const response = await pause(request(f.secret, key));
    expect((await result(response)).state).toBe('PauseRequested');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await result(await pause(request(f.secret, key)))).state).toBe('PauseRequested');
    expect(
      sql(`select state from public.print_attempts where id='${attempt.attemptId}'`)[0].state
    ).toBe('Reserved');
    expect((await open(request(f.secret, { ...op(), runId: f.runId }))).status).toBe(403);
    await result(
      await observe(
        request(f.secret, {
          ...op(),
          observationKind: 'physicalEjectionVerified',
          evidenceCode: 'simulator_ejection',
          observedAt: new Date().toISOString(),
        }),
        attemptContext(attempt.attemptId)
      )
    );
    expect(sql(`select state from public.booth_runs where id='${f.runId}'`)[0].state).toBe(
      'Paused'
    );
    expect(
      sql(`select state from public.print_attempts where id='${attempt.attemptId}'`)[0].state
    ).toBe('Confirmed');
  });
  it('forbids direct browser RPC execution, wrong grants, foreign origins, and extra payloads', async () => {
    const f = fixture();
    expect(
      (
        await local
          .client()
          .rpc('request_booth_pause', {
            grant_hash: f.hash,
            run_id: f.runId,
            operation_key: randomUUID(),
          })
      ).error
    ).not.toBeNull();
    expect((await pause(request('a'.repeat(64), op()))).status).toBe(403);
    expect((await pause(request(f.secret, op(), 'https://foreign.test'))).status).toBe(403);
    expect((await pause(request(f.secret, { ...op(), photo: 'forbidden' }))).status).toBe(400);
    const wrongRun = await local.service.rpc('request_booth_pause', {
      grant_hash: f.hash,
      run_id: randomUUID(),
      operation_key: randomUUID(),
    });
    expect(wrongRun.error?.message).toMatch(/forbidden/);
  });
});
