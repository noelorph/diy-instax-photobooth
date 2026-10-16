// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
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
      /^\s*select/i.test(query)
        ? query
        : `do $fixture$ begin ${query.trim().replace(/;+$/, '')}; end $fixture$`,
      '-o',
      'json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return output.trim().startsWith('{') ? JSON.parse(output).rows : [];
}
const evidence = {
  commandAccepted: 'command_acknowledged',
  preFilmRejected: 'pre_film_rejection',
  knownUnsent: 'command_not_started',
  uncertain: 'ambiguous_outcome',
  physicalEjectionVerified: 'simulator_ejection',
};
type Observation = keyof typeof evidence;
describe('Print outcome accounting', { timeout: 30000 }, () => {
  const local = localSupabase();
  const ids: string[] = [];
  afterEach(async () => {
    for (const id of ids)
      sql(`
      delete from public.operation_receipts where event_id='${id}';
      delete from public.activity_events where event_id='${id}';
      delete from public.film_stock_entries where event_id='${id}';
      delete from public.print_attempt_events where attempt_id in (select id from public.print_attempts where event_id='${id}');
      delete from public.print_attempts where event_id='${id}';
      delete from public.captures where event_id='${id}';
      delete from public.guest_sessions where event_id='${id}';
      delete from public.booth_grants where event_id='${id}';
      delete from public.booth_runs where event_id='${id}';
      delete from public.events where id='${id}';
      update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries);
      do $$ begin if to_regclass('public.printer_completion_policy') is not null then execute 'update public.printer_completion_policy set mode=''disabled'''; end if; end $$;
    `);
    ids.length = 0;
    await local.cleanup();
  }, 20000);
  async function fixture(kind: 'Guest' | 'Test' = 'Guest') {
    const user = await local.provisionUser();
    expect((await local.allowlist(user.id)).error).toBeNull();
    const signed = await local.signIn(user);
    const admin = {
      admin_user_id: user.id,
      admin_session_id: JSON.parse(
        Buffer.from(signed.session.access_token.split('.')[1], 'base64url').toString()
      ).session_id,
    };
    const id = randomUUID(),
      run = randomUUID(),
      session = randomUUID(),
      capture = randomUUID(),
      attempt = randomUUID(),
      connection = randomUUID();
    const grant = randomBytes(32).toString('hex');
    ids.push(id);
    sql(`insert into public.events(id,state,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance)
      values('${id}','${kind === 'Guest' ? 'Live' : 'Draft'}','Outcome fixture','Client','fixture@example.test','123','Venue','Asia/Manila','2026-12-01T10:00Z','2026-12-01T12:00Z',1,10);
      insert into public.film_stock_entries(event_id,kind,signed_sheets,actor_scope) values('${id}','Addition',10,'fixture');
      update public.film_stock_balance set on_hand=(select sum(signed_sheets) from public.film_stock_entries);`);
    if (kind === 'Guest')
      sql(`
      insert into public.booth_runs(id,event_id,state,connection_id) values('${run}','${id}','Active','${connection}');
      insert into public.booth_grants(event_id,run_id,secret_hash,state,expires_at) values('${id}','${run}','${grant}','Active',now()+interval '1 hour');
      insert into public.guest_sessions(id,event_id,run_id) values('${session}','${id}','${run}');
      insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${capture}','${id}','${run}','${session}',now());`);
    sql(`insert into public.print_attempts(id,event_id,kind,request_key,connection_id,run_id,session_id,capture_id)
      values('${attempt}','${id}','${kind}','${randomUUID()}','${connection}',${kind === 'Guest' ? `'${run}','${session}','${capture}'` : 'null,null,null'});`);
    if (kind === 'Test')
      sql(
        `update public.print_attempts set initiating_admin_session_id='${admin.admin_session_id}' where id='${attempt}'`
      );
    const initialStock = Number(sql('select on_hand from public.film_stock_balance')[0].on_hand);
    return { id, run, session, attempt, grant, admin, signed, kind, initialStock };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const rpc = (name: string, args: Record<string, unknown>) => local.service.rpc(name, args);
  function args(f: Fixture, observation: Observation, key: string = randomUUID()) {
    return {
      ...(f.kind === 'Guest' ? { grant_hash: f.grant } : f.admin),
      attempt_id: f.attempt,
      operation_key: key,
      observation_kind: observation,
      evidence_code: evidence[observation],
      observed_at: '2026-10-16T10:00:00Z',
    };
  }
  const report = (f: Fixture, observation: Observation, key?: string) =>
    rpc(
      f.kind === 'Guest' ? 'report_booth_observation' : 'report_test_observation',
      args(f, observation, key)
    );
  const resolution = (
    f: Fixture,
    outcome: string,
    reason = 'Inspected the physical printer and sheet'
  ) => ({
    ...f.admin,
    attempt_id: f.attempt,
    operation_key: randomUUID(),
    outcome,
    inspection_reason: reason,
  });
  function snapshot(f: Fixture) {
    return sql(`select a.state, b.on_hand, (select count(*)::integer from public.film_stock_entries where attempt_id=a.id) consumption,
      (select state from public.guest_sessions where id=a.session_id) session_state,
      (select state from public.booth_runs where id=a.run_id) run_state,
      (select state from public.booth_grants where run_id=a.run_id) grant_state,
      private.guest_availability(a.event_id) availability from public.print_attempts a cross join public.film_stock_balance b where a.id='${f.attempt}'`)[0];
  }
  function simulated() {
    sql("update public.printer_completion_policy set mode='simulated'");
  }

  it('acknowledgement preserves both holds, stock, and the open session', async () => {
    const f = await fixture();
    const result = await report(f, 'commandAccepted');
    expect(result.error).toBeNull();
    expect(snapshot(f)).toMatchObject({
      state: 'Accepted',
      on_hand: f.initialStock,
      consumption: 0,
      session_state: 'Open',
      availability: {
        remaining_allowance: 9,
        available_stock: f.initialStock - 1,
        printer_busy: true,
      },
    });
    const rows = sql(`select accepted_at from public.print_attempts where id='${f.attempt}'`);
    expect(rows[0].accepted_at).not.toBeNull();
  });
  it.each(['preFilmRejected', 'knownUnsent'] as const)(
    '%s releases the holds and permits a new explicit attempt',
    async (observation) => {
      const f = await fixture();
      expect((await report(f, observation)).error).toBeNull();
      expect(snapshot(f)).toMatchObject({
        state: 'RejectedUnused',
        on_hand: f.initialStock,
        consumption: 0,
        session_state: 'Open',
        availability: {
          remaining_allowance: 10,
          available_stock: f.initialStock,
          printer_busy: false,
        },
      });
      sql(
        `insert into public.print_attempts(event_id,run_id,session_id,capture_id,kind,request_key,connection_id) select event_id,run_id,session_id,capture_id,kind,'${randomUUID()}',connection_id from public.print_attempts where id='${f.attempt}'`
      );
    }
  );
  it('uncertainty keeps the holds and slot, settles pause and revokes the grant', async () => {
    const f = await fixture();
    const request = args(f, 'uncertain');
    expect((await rpc('report_booth_observation', request)).error).toBeNull();
    expect(snapshot(f)).toMatchObject({
      state: 'Uncertain',
      on_hand: f.initialStock,
      session_state: 'Open',
      run_state: 'Paused',
      grant_state: 'Revoked',
      availability: {
        remaining_allowance: 9,
        available_stock: f.initialStock - 1,
        printer_busy: true,
      },
    });
    expect((await rpc('report_booth_observation', request)).error?.message).toBe('forbidden');
  });
  it('simulated ejection consumes one sheet and Guest allowance once under concurrent retries', async () => {
    const f = await fixture();
    // Reach the new RPC before policy setup so RED demonstrates the missing operation.
    expect((await report(f, 'commandAccepted')).error).toBeNull();
    simulated();
    const request = args(f, 'physicalEjectionVerified');
    const results = await Promise.all([
      rpc('report_booth_observation', request),
      rpc('report_booth_observation', request),
    ]);
    results.forEach((r) => expect(r.error).toBeNull());
    expect(results[0].data).toEqual(results[1].data);
    expect(snapshot(f)).toMatchObject({
      state: 'Confirmed',
      on_hand: f.initialStock - 1,
      consumption: 1,
      session_state: 'Printed',
      availability: {
        remaining_allowance: 9,
        available_stock: f.initialStock - 1,
        printer_busy: false,
      },
    });
    expect((await report(f, 'physicalEjectionVerified')).error).toBeNull();
    expect(snapshot(f).consumption).toBe(1);
    expect(
      sql(
        'select on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries) as reconciled from public.film_stock_balance'
      )[0].reconciled
    ).toBe(true);
    expect(
      (
        await rpc('report_booth_observation', {
          ...request,
          observation_kind: 'knownUnsent',
          evidence_code: evidence.knownUnsent,
        })
      ).error?.message
    ).toBe('idempotency_conflict');
  });
  it('Test ejection uses stock only and late conflicting reports are non-mutating diagnostics', async () => {
    const f = await fixture('Test');
    expect((await report(f, 'commandAccepted')).error).toBeNull();
    simulated();
    expect((await report(f, 'physicalEjectionVerified')).error).toBeNull();
    expect((await report(f, 'knownUnsent')).error).toBeNull();
    expect(snapshot(f)).toMatchObject({
      state: 'Confirmed',
      consumption: 1,
      on_hand: f.initialStock - 1,
      availability: { remaining_allowance: 10, printer_busy: false },
    });
    expect(
      sql(
        `select state from public.print_attempt_events where attempt_id='${f.attempt}' and state='Diagnostic'`
      )
    ).toHaveLength(1);
  });
  it.each(['ejected', 'unused'])(
    'Admin resolves Uncertain as %s once with an inspection reason',
    async (outcome) => {
      const f = await fixture();
      expect((await rpc('resolve_uncertain_print', resolution(f, outcome))).error?.message).toBe(
        'state_conflict'
      );
      expect((await report(f, 'uncertain')).error).toBeNull();
      expect(
        (await rpc('resolve_uncertain_print', resolution(f, outcome, ' \n\t '))).error?.message
      ).toBe('validation_error');
      const request = resolution(f, outcome);
      const result = await rpc('resolve_uncertain_print', request);
      expect(result.error).toBeNull();
      expect((await rpc('resolve_uncertain_print', request)).data).toEqual(result.data);
      expect(snapshot(f)).toMatchObject({
        state: outcome === 'ejected' ? 'AdminResolvedEjected' : 'AdminResolvedUnused',
        consumption: outcome === 'ejected' ? 1 : 0,
        on_hand: f.initialStock - (outcome === 'ejected' ? 1 : 0),
        session_state: outcome === 'ejected' ? 'Printed' : 'Abandoned',
        availability: { remaining_allowance: outcome === 'ejected' ? 9 : 10, printer_busy: false },
      });
      const journal = sql(
        `select actor_scope,reason from public.print_attempt_events where attempt_id='${f.attempt}' and state like 'AdminResolved%'`
      );
      expect(journal).toEqual([
        { actor_scope: `admin:${f.admin.admin_user_id}`, reason: request.inspection_reason },
      ]);
      expect(
        (
          await rpc(
            'resolve_uncertain_print',
            resolution(f, outcome === 'ejected' ? 'unused' : 'ejected')
          )
        ).error?.message
      ).toBe('state_conflict');
      expect((await report(f, 'physicalEjectionVerified')).error?.message).toBe('forbidden');
      expect((await f.signed.client.auth.signOut({ scope: 'local' })).error).toBeNull();
      expect((await rpc('resolve_uncertain_print', request)).error?.message).toBe('forbidden');
    }
  );
  it('allows authorized Admin Test diagnostics after resolution without changing accounting', async () => {
    const f = await fixture('Test');
    expect((await report(f, 'uncertain')).error).toBeNull();
    expect((await rpc('resolve_uncertain_print', resolution(f, 'unused'))).error).toBeNull();
    expect((await report(f, 'commandAccepted')).error).toBeNull();
    expect(snapshot(f)).toMatchObject({
      state: 'AdminResolvedUnused',
      consumption: 0,
      on_hand: f.initialStock,
    });
    expect(
      sql(
        `select state from public.print_attempt_events where attempt_id='${f.attempt}' and state='Diagnostic'`
      )
    ).toHaveLength(1);
  });
  it('rejects ejection with disabled policy and unqualified evidence even when simulation is enabled', async () => {
    const f = await fixture();
    expect((await report(f, 'physicalEjectionVerified')).error?.message).toBe('invalid_evidence');
    simulated();
    for (const code of [
      'command_acknowledged',
      'film_remaining',
      '12 7f',
      'manual_ejection',
      'timeout',
    ]) {
      expect(
        (
          await rpc('report_booth_observation', {
            ...args(f, 'physicalEjectionVerified'),
            evidence_code: code,
          })
        ).error?.message
      ).toBe('invalid_evidence');
    }
    expect(snapshot(f)).toMatchObject({ state: 'Reserved', consumption: 0 });
  });
  it('checks current grant scope and expiry before replay and restricts PauseRequested to a pending attempt', async () => {
    const f = await fixture();
    const request = args(f, 'commandAccepted');
    expect((await rpc('report_booth_observation', request)).error).toBeNull();
    expect(
      (
        await rpc('report_booth_observation', {
          ...request,
          grant_hash: randomBytes(32).toString('hex'),
        })
      ).error?.message
    ).toBe('forbidden');
    const oldRun = randomUUID(),
      oldSession = randomUUID(),
      oldCapture = randomUUID(),
      oldAttempt = randomUUID();
    // The caller's grant/run remain Active. Only the target belongs to history.
    sql(`insert into public.booth_runs(id,event_id,state) values('${oldRun}','${f.id}','Paused');
      insert into public.guest_sessions(id,event_id,run_id,state,closed_at) values('${oldSession}','${f.id}','${oldRun}','Abandoned',now());
      insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${oldCapture}','${f.id}','${oldRun}','${oldSession}',now());
      insert into public.print_attempts(id,event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id)
        select '${oldAttempt}',event_id,'${oldRun}','${oldSession}','${oldCapture}','Guest','RejectedUnused','${randomUUID()}',connection_id from public.print_attempts where id='${f.attempt}'`);
    expect(
      (
        await rpc('report_booth_observation', {
          ...request,
          attempt_id: oldAttempt,
          operation_key: randomUUID(),
        })
      ).error?.message
    ).toBe('forbidden');
    expect((await rpc('report_booth_observation', request)).error).toBeNull();
    sql(
      `update public.booth_grants set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where run_id='${f.run}'`
    );
    expect((await rpc('report_booth_observation', request)).error?.message).toBe('grant_expired');
    sql(
      `update public.booth_grants set expires_at=now()+interval '1 hour' where run_id='${f.run}'; update public.booth_runs set state='PauseRequested' where id='${f.run}'`
    );
    expect((await report(f, 'preFilmRejected')).error).toBeNull();
    expect(snapshot(f)).toMatchObject({
      state: 'RejectedUnused',
      run_state: 'Paused',
      grant_state: 'Revoked',
      session_state: 'Abandoned',
    });
    expect((await rpc('report_booth_observation', request)).error?.message).toBe('forbidden');
  });
  it('requires current Admin authority before Test report replay and resolution', async () => {
    const f = await fixture('Test');
    const request = args(f, 'commandAccepted');
    expect((await rpc('report_test_observation', request)).error).toBeNull();
    expect((await report(f, 'uncertain')).error).toBeNull();
    expect((await f.signed.client.auth.signOut({ scope: 'local' })).error).toBeNull();
    expect((await rpc('report_test_observation', request)).error?.message).toBe('forbidden');
    expect((await rpc('resolve_uncertain_print', resolution(f, 'ejected'))).error?.message).toBe(
      'forbidden'
    );
  });
  it('rejects cross-kind and browser-role calls and browser policy changes', async () => {
    const f = await fixture();
    expect(
      (
        await rpc('report_test_observation', {
          ...args(f, 'commandAccepted'),
          grant_hash: undefined,
          ...f.admin,
        })
      ).error?.message
    ).toBe('forbidden');
    for (const client of [local.client(), f.signed.client]) {
      expect(
        (await client.rpc('report_booth_observation', args(f, 'commandAccepted'))).error
      ).not.toBeNull();
      expect(
        (
          await client.rpc('report_test_observation', {
            ...f.admin,
            ...args({ ...f, kind: 'Test' }, 'commandAccepted'),
          })
        ).error
      ).not.toBeNull();
      expect(
        (await client.rpc('resolve_uncertain_print', resolution(f, 'ejected'))).error
      ).not.toBeNull();
      expect(
        (
          await client
            .from('printer_completion_policy')
            .update({ mode: 'simulated' })
            .eq('id', true)
        ).error
      ).not.toBeNull();
    }
    expect(
      (
        await local.service
          .from('printer_completion_policy')
          .update({ mode: 'simulated' })
          .eq('id', true)
      ).error
    ).not.toBeNull();
    expect(snapshot(f).state).toBe('Reserved');
  });
  it('binds pending Test observations to their initiating Admin session while allowing another Admin session to resolve', async () => {
    const f = await fixture('Test');
    const user = await local.provisionUser();
    expect((await local.allowlist(user.id)).error).toBeNull();
    const other = await local.signIn(user);
    const otherAdmin = {
      admin_user_id: user.id,
      admin_session_id: JSON.parse(
        Buffer.from(other.session.access_token.split('.')[1], 'base64url').toString()
      ).session_id,
    };
    expect(
      (await rpc('report_test_observation', { ...args(f, 'commandAccepted'), ...otherAdmin })).error
        ?.message
    ).toBe('forbidden');
    expect((await report(f, 'uncertain')).error).toBeNull();
    expect(
      (await rpc('resolve_uncertain_print', { ...resolution(f, 'unused'), ...otherAdmin })).error
    ).toBeNull();
  });
  it('rejects malformed or mismatched observations without creating receipts or journal entries', async () => {
    const f = await fixture();
    for (const [fields, code] of [
      [{ observation_kind: null }, 'validation_error'],
      [{ evidence_code: null }, 'invalid_evidence'],
      [{ observed_at: null }, 'validation_error'],
      [{ observed_at: 'infinity' }, 'validation_error'],
      [
        { observation_kind: 'photo', evidence_code: 'data:image/jpeg;base64,AA==' },
        'invalid_evidence',
      ],
    ] as const) {
      expect(
        (await rpc('report_booth_observation', { ...args(f, 'commandAccepted'), ...fields })).error
          ?.message
      ).toBe(code);
    }
    expect(snapshot(f).state).toBe('Reserved');
    expect(sql(`select * from public.operation_receipts where event_id='${f.id}'`)).toHaveLength(0);
    expect(
      sql(`select * from public.print_attempt_events where attempt_id='${f.attempt}'`)
    ).toHaveLength(0);
  });
  it('rolls back every accounting effect when journal insertion fails', async () => {
    const f = await fixture();
    expect((await report(f, 'commandAccepted')).error).toBeNull();
    simulated();
    sql(`create function public.fail_outcome_fixture() returns trigger language plpgsql as $$ begin if new.attempt_id='${f.attempt}' and new.state='Confirmed' then raise exception 'fixture_failure'; end if; return new; end $$;
      create trigger fail_outcome_fixture before insert on public.print_attempt_events for each row execute function public.fail_outcome_fixture();`);
    try {
      expect((await report(f, 'physicalEjectionVerified')).error?.message).toBe('fixture_failure');
      expect(snapshot(f)).toMatchObject({
        state: 'Accepted',
        consumption: 0,
        on_hand: f.initialStock,
        session_state: 'Open',
      });
      expect(sql(`select * from public.operation_receipts where event_id='${f.id}'`)).toHaveLength(
        1
      );
      expect(sql(`select * from public.activity_events where event_id='${f.id}'`)).toHaveLength(1);
    } finally {
      sql(
        'drop trigger fail_outcome_fixture on public.print_attempt_events; drop function public.fail_outcome_fixture()'
      );
    }
  });
});
