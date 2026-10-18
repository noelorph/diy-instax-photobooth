// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { localSupabase } from '../fixtures/local-supabase';
import { getHistorySummary, getOperationalEvent } from '@/features/admin/operations/read';
import { createClient } from '@/lib/supabase/server';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: vi.fn().mockResolvedValue({}) }));
const local = localSupabase();
afterEach(async () => {
  await local.cleanup();
});
it('reads authenticated Event totals and excludes deleted or inaccessible Events', async () => {
  const admin = await local.provisionUser();
  await local.allowlist(admin.id);
  const signed = await local.signIn(admin);
  vi.mocked(createClient).mockResolvedValue(signed.client);
  const created = await signed.client
    .from('events')
    .insert({
      title: 'Operations',
      client_name: 'Client',
      client_email: 'client@example.test',
      client_phone: '123',
      venue_address: 'Hall',
      time_zone: 'Asia/Manila',
      starts_at: '2026-11-01T10:00:00Z',
      ends_at: '2026-11-01T11:00:00Z',
      film_package_count: 1,
      original_print_allowance: 10,
    })
    .select('id')
    .single();
  expect(created.error).toBeNull();
  const id = created.data!.id;
  try {
    const summary = await getHistorySummary();
    expect(summary.status).toBe('success');
    if (summary.status === 'success') {
      expect(summary.events).toBeGreaterThanOrEqual(1);
      expect(summary.captures).toBeGreaterThanOrEqual(0);
    }
    const result = await getOperationalEvent(id);
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.event.originalAllowance).toBe(10);
      expect(result.event.allowanceReserved).toBe(0);
      expect(result.event.confirmedPrints).toBe(0);
    }
  } finally {
    await local.service.from('events').delete().eq('id', id);
  }
  expect((await getOperationalEvent(id)).status).toBe('not_found');
});

it('pages beyond 100 attempts and keeps readiness and accounting independent of the page', async () => {
  const admin = await local.provisionUser();
  await local.allowlist(admin.id);
  vi.mocked(createClient).mockResolvedValue((await local.signIn(admin)).client);
  const baseline = await getHistorySummary();
  expect(baseline.status).toBe('success');
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const [id, other, cancelled, deleted] = ids,
    connection = randomUUID(),
    oldGuest = randomUUID();
  const booking = {
    title: 'Read model fixture',
    client_name: 'Client',
    client_email: 'fixture@example.test',
    client_phone: '123',
    venue_address: 'Hall',
    time_zone: 'Asia/Manila',
    starts_at: '2026-11-01T10:00Z',
    ends_at: '2026-11-01T11:00Z',
    film_package_count: 1,
    original_print_allowance: 10,
  };
  try {
    expect(
      (await local.service.from('events').insert(ids.map((id) => ({ ...booking, id })))).error
    ).toBeNull();
    let fixture = `update public.events set state='Live',revision=2 where id='${id}';update public.events set state='Cancelled',revision=2 where id='${cancelled}';update public.events set deleted_at=now(),title=null,client_name=null,client_email=null,client_phone=null,venue_address=null,time_zone=null,starts_at=null,ends_at=null,media_removal_state='pending',revision=2 where id='${deleted}';`;
    const run = randomUUID();
    fixture += `insert into public.booth_runs(id,event_id,state,connection_id) values('${run}','${id}','Paused','${connection}');`;
    for (const [index, state] of ['Confirmed', 'WastedFilm', 'AdminResolvedEjected'].entries()) {
      const session = randomUUID(),
        capture = randomUUID(),
        attempt = index === 0 ? oldGuest : randomUUID();
      fixture += `insert into public.guest_sessions(id,event_id,run_id,state,closed_at) values('${session}','${id}','${run}','Printed',now());insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${capture}','${id}','${run}','${session}',now());insert into public.print_attempts(id,event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id,created_at) values('${attempt}','${id}','${run}','${session}','${capture}','Guest','${state}',gen_random_uuid(),'${connection}',now()-interval '1 day');`;
      if (index === 2)
        fixture += `insert into public.print_attempt_events(attempt_id,actor_scope,state,reason) values('${attempt}','fixture','WastedFilm','Inspected unusable sheet');`;
    }
    fixture += `insert into public.print_attempts(event_id,kind,state,request_key,connection_id,test_output_usable,created_at) values('${id}','Test','Confirmed',gen_random_uuid(),'${connection}',true,now()-interval '1 day');insert into public.print_attempts(event_id,kind,state,request_key,connection_id) select '${id}','Test','RejectedUnused',gen_random_uuid(),'${connection}' from generate_series(1,100);insert into public.print_attempts(event_id,kind,state,request_key,connection_id) values('${other}','Test','Reserved',gen_random_uuid(),gen_random_uuid());insert into public.additional_print_entries(event_id,quantity,actor_id) select '${id}',1,'${admin.id}' from generate_series(1,1001);`;
    sql(fixture);
    const first = await getOperationalEvent(id),
      older = await getOperationalEvent(id, 1);
    expect(first.status).toBe('success');
    expect(older.status).toBe('success');
    if (first.status === 'success' && older.status === 'success') {
      expect(first.event.attempts).toHaveLength(100);
      expect(first.event.hasOlderAttempts).toBe(true);
      expect(first.event.attempts.some((a) => a.id === oldGuest)).toBe(false);
      expect(older.event.attempts.some((a) => a.id === oldGuest && a.state === 'Confirmed')).toBe(
        true
      );
      expect(older.event.hasOlderAttempts).toBe(false);
      expect(first.event.usableTestConnectionIds).toContain(connection);
      expect(first.event.eventUnresolved).toBe(0);
      expect(first.event.stockReserved).toBe(1);
      expect(first.event.confirmedPrints).toBe(1);
      expect(first.event.additionalPrints).toBe(1001);
      expect(first.event.captures).toBe(3);
    }
    const summary = await getHistorySummary();
    expect(summary.status).toBe('success');
    if (summary.status === 'success' && baseline.status === 'success') {
      expect(summary.events).toBe(baseline.events + 2);
      expect(summary.captures).toBe(baseline.captures + 3);
    }
    expect((await getOperationalEvent(deleted)).status).toBe('not_found');
  } finally {
    for (const id of ids)
      sql(
        `delete from public.additional_print_entries where event_id='${id}';delete from public.print_attempt_events where attempt_id in(select id from public.print_attempts where event_id='${id}');delete from public.print_attempts where event_id='${id}';delete from public.captures where event_id='${id}';delete from public.guest_sessions where event_id='${id}';delete from public.booth_runs where event_id='${id}';delete from public.events where id='${id}';`
      );
  }
}, 30000);
function sql(query: string) {
  execFileSync(
    resolve('node_modules/.bin/supabase'),
    ['db', 'query', '--local', `do $fixture$ begin ${query} end $fixture$`, '-o', 'json'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
}
