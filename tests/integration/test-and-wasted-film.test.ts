// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { localOwnerSql, localSupabase } from '../fixtures/local-supabase';

function sql(query: string) {
  return localOwnerSql(
    /^\s*select/i.test(query)
      ? query
      : `do $fixture$ begin ${query.trim().replace(/;+$/, '')}; end $fixture$`
  );
}

describe('Test setup and Wasted Film', { timeout: 30000 }, () => {
  const local = localSupabase();
  const ids: string[] = [];
  const rpc = (name: string, args: Record<string, unknown>) => local.service.rpc(name, args);
  afterEach(async () => {
    for (const id of ids)
      sql(`
      delete from public.operation_receipts where event_id='${id}';
      delete from public.activity_events where event_id='${id}';
      delete from public.film_stock_entries where event_id='${id}';
      delete from public.additional_print_entries where event_id='${id}';
      delete from public.print_attempt_events where attempt_id in (select id from public.print_attempts where event_id='${id}');
      delete from public.print_attempts where event_id='${id}';
      delete from public.captures where event_id='${id}';
      delete from public.guest_sessions where event_id='${id}';
      delete from public.booth_handoffs where event_id='${id}';
      delete from public.booth_grants where event_id='${id}';
      delete from public.booth_runs where event_id='${id}';
      delete from public.events where id='${id}';
      update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries);
      update public.printer_completion_policy set mode='disabled';
    `);
    ids.length = 0;
    await local.cleanup();
  }, 20000);
  async function fixture(sheets = 10) {
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
      connection = randomUUID();
    ids.push(id);
    sql(`insert into public.events(id,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance)
      values('${id}','Setup fixture','Client','fixture@example.test','123','Venue','Asia/Manila','2026-12-01T10:00Z','2026-12-01T12:00Z',1,10);
      insert into public.film_stock_entries(event_id,kind,signed_sheets,actor_scope) values('${id}','Addition',${sheets},'fixture');
      update public.film_stock_balance set on_hand=(select sum(signed_sheets) from public.film_stock_entries);
      update public.printer_completion_policy set mode='simulated';`);
    const stock = Number(sql('select on_hand from public.film_stock_balance')[0].on_hand);
    return { id, connection, admin, signed, stock };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const reserveArgs = (f: Fixture) => ({
    ...f.admin,
    event_id: f.id,
    operation_key: randomUUID(),
    connection_id: f.connection,
  });
  async function reserve(f: Fixture) {
    const result = await rpc('reserve_test_attempt', reserveArgs(f));
    expect(result.error).toBeNull();
    return result.data.attempt_id as string;
  }
  const inspectArgs = (f: Fixture, attempt: string, usable = true) => ({
    ...f.admin,
    attempt_id: attempt,
    operation_key: randomUUID(),
    usable,
  });
  const wasteArgs = (f: Fixture, attempt: string, reason = 'Inspected unusable sheet') => ({
    ...f.admin,
    attempt_id: attempt,
    operation_key: randomUUID(),
    reason,
  });
  async function eject(f: Fixture, attempt: string) {
    expect(
      (
        await rpc('report_test_observation', {
          ...f.admin,
          attempt_id: attempt,
          operation_key: randomUUID(),
          observation_kind: 'physicalEjectionVerified',
          evidence_code: 'simulator_ejection',
          observed_at: '2026-10-16T12:00:00Z',
        })
      ).error
    ).toBeNull();
  }
  const handoff = (f: Fixture, connection = f.connection) =>
    rpc('prepare_booth_handoff', {
      ...f.admin,
      event_id: f.id,
      expected_revision: 1,
      operation_key: randomUUID(),
      connection_id: connection,
      setup_evidence: {
        device_token_hash: randomBytes(32).toString('hex'),
        camera_ready: true,
        printer_ready: true,
        guided_access_ready: true,
        printer_mode: 'simulated',
      },
    });
  function guest(f: Fixture, state = 'Confirmed', eventState = 'Live') {
    const run = randomUUID(),
      session = randomUUID(),
      capture = randomUUID(),
      attempt = randomUUID();
    sql(`update public.events set state='${eventState}',revision=revision+1 where id='${f.id}';
      insert into public.booth_runs(id,event_id,state,connection_id) values('${run}','${f.id}','Paused','${f.connection}');
      insert into public.guest_sessions(id,event_id,run_id,state,closed_at) values('${session}','${f.id}','${run}','${['Confirmed', 'AdminResolvedEjected'].includes(state) ? 'Printed' : 'Abandoned'}',now());
      insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${capture}','${f.id}','${run}','${session}',now());
      insert into public.print_attempts(id,event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id)
        values('${attempt}','${f.id}','${run}','${session}','${capture}','Guest','${state}','${randomUUID()}','${f.connection}');`);
    if (['Confirmed', 'AdminResolvedEjected'].includes(state))
      sql(`insert into public.film_stock_entries(event_id,attempt_id,kind,signed_sheets,actor_scope) values('${f.id}','${attempt}','Consumption',-1,'fixture');
      update public.film_stock_balance set on_hand=on_hand-1;
      insert into public.print_attempt_events(attempt_id,actor_scope,state,reason) values('${attempt}','fixture','${state}','Historical physical inspection');`);
    return { run, session, capture, attempt };
  }
  it('reserves only Film, binds the initiating Admin session, and replays identical receipts', async () => {
    const f = await fixture();
    const request = reserveArgs(f);
    const results = await Promise.all([
      rpc('reserve_test_attempt', request),
      rpc('reserve_test_attempt', request),
    ]);
    results.forEach((r) => expect(r.error).toBeNull());
    expect(results[0].data).toEqual(results[1].data);
    expect(results[0].data).toMatchObject({
      state: 'Reserved',
      allowance_hold: 0,
      film_hold: 1,
      availability: { remaining_allowance: 10, available_stock: f.stock - 1, printer_busy: true },
    });
    expect(
      sql(
        `select initiating_admin_session_id,session_id,capture_id,run_id from public.print_attempts where id='${results[0].data.attempt_id}'`
      )[0]
    ).toEqual({
      initiating_admin_session_id: f.admin.admin_session_id,
      session_id: null,
      capture_id: null,
      run_id: null,
    });
    expect(
      (await rpc('reserve_test_attempt', { ...request, connection_id: randomUUID() })).error
        ?.message
    ).toBe('idempotency_conflict');
  });
  it('requires explicit output inspection after ejection and rejects readiness after reconnect', async () => {
    const f = await fixture();
    let attempt = await reserve(f);
    expect((await rpc('confirm_test_output', inspectArgs(f, attempt))).error?.message).toBe(
      'state_conflict'
    );
    await eject(f, attempt);
    expect((await handoff(f)).error?.message).toBe('not_ready');
    expect((await rpc('confirm_test_output', inspectArgs(f, attempt, false))).error).toBeNull();
    expect((await handoff(f)).error?.message).toBe('not_ready');
    expect((await rpc('confirm_test_output', inspectArgs(f, attempt))).error?.message).toBe(
      'state_conflict'
    );
    attempt = await reserve(f);
    await eject(f, attempt);
    const request = inspectArgs(f, attempt);
    const result = await rpc('confirm_test_output', request);
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      attempt_id: attempt,
      connection_id: f.connection,
      usable: true,
    });
    expect((await rpc('confirm_test_output', request)).data).toEqual(result.data);
    expect((await rpc('confirm_test_output', { ...request, usable: false })).error?.message).toBe(
      'idempotency_conflict'
    );
    expect((await handoff(f, randomUUID())).error?.message).toBe('not_ready');
    expect((await handoff(f)).error).toBeNull();
  });
  it('requires usable inspection on the matching connection for Guest reservation', async () => {
    const f = await fixture(),
      attempt = await reserve(f);
    await eject(f, attempt);
    const run = randomUUID(),
      session = randomUUID(),
      capture = randomUUID(),
      hash = randomBytes(32).toString('hex');
    sql(`update public.events set state='Live',revision=revision+1 where id='${f.id}';
      insert into public.booth_runs(id,event_id,state,connection_id) values('${run}','${f.id}','Active','${f.connection}');
      insert into public.booth_grants(event_id,run_id,secret_hash,state,expires_at) values('${f.id}','${run}','${hash}','Active',now()+interval '1 hour');
      insert into public.guest_sessions(id,event_id,run_id) values('${session}','${f.id}','${run}');
      insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${capture}','${f.id}','${run}','${session}',now());`);
    const request = {
      grant_hash: hash,
      run_id: run,
      session_id: session,
      capture_id: capture,
      operation_key: randomUUID(),
    };
    expect((await rpc('reserve_guest_attempt', request)).error?.message).toBe('not_ready');
    expect((await rpc('confirm_test_output', inspectArgs(f, attempt))).error).toBeNull();
    sql(`update public.booth_runs set connection_id='${randomUUID()}' where id='${run}'`);
    expect((await rpc('reserve_guest_attempt', request)).error?.message).toBe('not_ready');
    sql(`update public.booth_runs set connection_id='${f.connection}' where id='${run}'`);
    expect((await rpc('reserve_guest_attempt', request)).error).toBeNull();
  });
  it('allows inspection of Admin-resolved ejected Test output, only once per sheet', async () => {
    const f = await fixture(),
      attempt = await reserve(f);
    expect(
      (
        await rpc('report_test_observation', {
          ...f.admin,
          attempt_id: attempt,
          operation_key: randomUUID(),
          observation_kind: 'uncertain',
          evidence_code: 'ambiguous_outcome',
          observed_at: '2026-10-16T12:00:00Z',
        })
      ).error
    ).toBeNull();
    expect((await rpc('confirm_test_output', inspectArgs(f, attempt))).error?.message).toBe(
      'state_conflict'
    );
    expect(
      (
        await rpc('resolve_uncertain_print', {
          ...f.admin,
          attempt_id: attempt,
          operation_key: randomUUID(),
          outcome: 'ejected',
          inspection_reason: 'Physical inspection',
        })
      ).error
    ).toBeNull();
    expect((await rpc('confirm_test_output', inspectArgs(f, attempt))).error).toBeNull();
    expect((await rpc('confirm_test_output', inspectArgs(f, attempt))).error).toBeNull();
    expect((await rpc('confirm_test_output', inspectArgs(f, attempt, false))).error?.message).toBe(
      'state_conflict'
    );
    expect(
      sql(
        `select evidence_kind from public.print_attempt_events where attempt_id='${attempt}' and evidence_kind='admin_output_usable'`
      )
    ).toHaveLength(1);
  });
  it('keeps the production printer gate disabled', async () => {
    const f = await fixture();
    sql("update public.printer_completion_policy set mode='disabled'");
    expect((await rpc('reserve_test_attempt', reserveArgs(f))).error?.message).toBe('not_ready');
    expect(sql(`select id from public.print_attempts where event_id='${f.id}'`)).toHaveLength(0);
  });
  it.each(['Prepared', 'Active', 'PauseRequested'])(
    'rejects Test setup while the Event run is %s',
    async (state) => {
      const f = await fixture();
      sql(
        `update public.events set state='Live',revision=revision+1 where id='${f.id}'; insert into public.booth_runs(event_id,state) values('${f.id}','${state}')`
      );
      expect((await rpc('reserve_test_attempt', reserveArgs(f))).error?.message).toBe(
        'state_conflict'
      );
    }
  );
  it.each(['Prepared', 'Active', 'PauseRequested'])(
    'blocks a separate Draft Test while another Event run is %s',
    async (state) => {
      const f = await fixture(),
        other = randomUUID();
      ids.push(other);
      sql(`insert into public.events(id,state,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance)
      select '${other}','Live',title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance from public.events where id='${f.id}';
      insert into public.booth_runs(event_id,state) values('${other}','${state}')`);
      expect((await rpc('reserve_test_attempt', reserveArgs(f))).error?.message).toBe(
        'state_conflict'
      );
    }
  );
  it('allows paused-Live setup, with no allowance required', async () => {
    const f = await fixture();
    sql(
      `update public.events set state='Live',revision=revision+1,original_print_allowance=0 where id='${f.id}'; insert into public.booth_runs(event_id,state) values('${f.id}','Paused')`
    );
    const result = await rpc('reserve_test_attempt', reserveArgs(f));
    expect(result.error).toBeNull();
    expect(result.data.availability.remaining_allowance).toBe(0);
  });
  it.each(['Completed', 'Cancelled'])('rejects Test setup for %s Events', async (state) => {
    const f = await fixture();
    sql(`update public.events set state='${state}',revision=revision+1 where id='${f.id}'`);
    expect((await rpc('reserve_test_attempt', reserveArgs(f))).error?.message).toBe(
      'state_conflict'
    );
  });
  it.each([1, 10])(
    'serializes competing Test reservations with %i sheets across Events',
    async (sheets) => {
      const f = await fixture(sheets),
        other = randomUUID();
      ids.push(other);
      sql(`insert into public.events(id,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance)
      select '${other}',title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance from public.events where id='${f.id}'`);
      const results = await Promise.all([
        rpc('reserve_test_attempt', reserveArgs(f)),
        rpc('reserve_test_attempt', { ...reserveArgs(f), event_id: other }),
      ]);
      expect(results.filter((r) => !r.error)).toHaveLength(1);
      expect(results.find((r) => r.error)?.error?.message).toBe(
        sheets === 1 ? 'stock_exhausted' : 'printer_busy'
      );
      expect(
        sql(`select id from public.print_attempts where event_id in ('${f.id}','${other}')`)
      ).toHaveLength(1);
    }
  );
  it('blocks later Guest work while a Test remains pending', async () => {
    const f = await fixture();
    await reserve(f);
    expect((await handoff(f)).error?.message).toBe('pending_attempt');
    const other = randomUUID(),
      run = randomUUID(),
      hash = randomBytes(32).toString('hex');
    ids.push(other);
    sql(`insert into public.events(id,state,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance)
      select '${other}','Live',title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance from public.events where id='${f.id}';
      insert into public.booth_runs(id,event_id,state,connection_id) values('${run}','${other}','Active','${randomUUID()}');
      insert into public.booth_grants(event_id,run_id,secret_hash,state,expires_at) values('${other}','${run}','${hash}','Active',now()+interval '1 hour');`);
    expect(
      (
        await rpc('open_guest_session', {
          grant_hash: hash,
          run_id: run,
          operation_key: randomUUID(),
        })
      ).error?.message
    ).toBe('printer_busy');
    expect((await handoff(f)).error?.message).toBe('state_conflict');
  });
  it.each(['Confirmed', 'AdminResolvedEjected'])(
    'corrects %s Guest output once without restoring stock or reopening its session',
    async (state) => {
      const f = await fixture(),
        g = guest(f, state, state === 'AdminResolvedEjected' ? 'Completed' : 'Live');
      const request = wasteArgs(f, g.attempt);
      const results = await Promise.all([
        rpc('mark_wasted_film', request),
        rpc('mark_wasted_film', request),
      ]);
      results.forEach((r) => expect(r.error).toBeNull());
      expect(results[0].data).toEqual(results[1].data);
      expect(results[0].data).toMatchObject({
        state: 'WastedFilm',
        availability: { remaining_allowance: 10 },
        on_hand: f.stock - 1,
      });
      expect((await rpc('mark_wasted_film', wasteArgs(f, g.attempt))).error?.message).toBe(
        'state_conflict'
      );
      expect(sql(`select state from public.guest_sessions where id='${g.session}'`)[0].state).toBe(
        'Printed'
      );
      expect(
        sql(`select signed_sheets from public.film_stock_entries where attempt_id='${g.attempt}'`)
      ).toEqual([{ signed_sheets: -1 }]);
      expect(
        sql(
          `select reason from public.print_attempt_events where attempt_id='${g.attempt}' and state='WastedFilm'`
        )
      ).toEqual([{ reason: request.reason }]);
      expect(
        sql(
          `select state from public.print_attempt_events where attempt_id='${g.attempt}' and state='${state}'`
        )
      ).toHaveLength(1);
      expect(
        (await rpc('mark_wasted_film', { ...request, reason: 'Changed reason' })).error?.message
      ).toBe('idempotency_conflict');
    }
  );
  it('excludes a historical AdminResolvedEjected correction journal from allowance totals', async () => {
    const f = await fixture(),
      g = guest(f, 'AdminResolvedEjected');
    // Older accounting rows can retain their ejection state while the append-only
    // correction journal carries the later Wasted Film classification.
    sql(`insert into public.print_attempt_events(attempt_id,actor_scope,state,reason)
      values('${g.attempt}','fixture','WastedFilm','Historical unusable sheet')`);
    const result = await rpc('add_event_prints', {
      ...f.admin,
      event_id: f.id,
      operation_key: randomUUID(),
      quantity: 1,
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ confirmed_prints: 0, remaining_allowance: 11 });
    expect(
      (await rpc('mark_wasted_film', wasteArgs(f, g.attempt, 'Historical unusable sheet'))).error
        ?.message
    ).toBe('state_conflict');
    expect(
      sql(`select private.guest_availability('${f.id}') as availability`)[0].availability
    ).toMatchObject({ remaining_allowance: 11 });
  });
  it('rolls back Wasted Film state and receipt when its journal cannot commit', async () => {
    const f = await fixture(),
      g = guest(f),
      request = wasteArgs(f, g.attempt);
    sql(`create function private.task6_reject_journal() returns trigger language plpgsql set search_path='' as $$ begin
      if new.attempt_id='${g.attempt}' and new.state='WastedFilm' then raise exception 'test_journal_failure'; end if; return new; end $$;
      create trigger task6_reject_journal before insert on public.print_attempt_events for each row execute function private.task6_reject_journal()`);
    try {
      expect((await rpc('mark_wasted_film', request)).error?.message).toBe('test_journal_failure');
      expect(sql(`select state from public.print_attempts where id='${g.attempt}'`)[0].state).toBe(
        'Confirmed'
      );
      expect(
        sql(
          `select id from public.operation_receipts where operation_key='${request.operation_key}'`
        )
      ).toHaveLength(0);
    } finally {
      sql(
        'drop trigger task6_reject_journal on public.print_attempt_events; drop function private.task6_reject_journal()'
      );
    }
    expect((await rpc('mark_wasted_film', request)).error).toBeNull();
  });
  it.each(['Reserved', 'Accepted', 'Uncertain', 'RejectedUnused', 'AdminResolvedUnused'])(
    'rejects Wasted Film for %s Guest attempts',
    async (state) => {
      const f = await fixture(),
        g = guest(f, state);
      expect((await rpc('mark_wasted_film', wasteArgs(f, g.attempt))).error?.message).toBe(
        'state_conflict'
      );
    }
  );
  it('rejects Test correction, Guest inspection, blank correction reasons and null inspection', async () => {
    const f = await fixture(),
      attempt = await reserve(f);
    await eject(f, attempt);
    expect((await rpc('mark_wasted_film', wasteArgs(f, attempt))).error?.message).toBe(
      'state_conflict'
    );
    expect(
      (await rpc('confirm_test_output', { ...inspectArgs(f, attempt), usable: null })).error
        ?.message
    ).toBe('validation_error');
    const g = guest(f);
    expect((await rpc('confirm_test_output', inspectArgs(f, g.attempt))).error?.message).toBe(
      'state_conflict'
    );
    for (const reason of ['', ' \n\t ', 'x'.repeat(1001)])
      expect((await rpc('mark_wasted_film', wasteArgs(f, g.attempt, reason))).error?.message).toBe(
        'validation_error'
      );
  });
  it('checks current Admin authority before receipt replay and restricts browser RPC access', async () => {
    const f = await fixture(),
      request = reserveArgs(f);
    const reservation = await rpc('reserve_test_attempt', request);
    expect(reservation.error).toBeNull();
    await eject(f, reservation.data.attempt_id);
    const inspection = inspectArgs(f, reservation.data.attempt_id);
    expect((await rpc('confirm_test_output', inspection)).error).toBeNull();
    const g = guest(f),
      waste = wasteArgs(f, g.attempt);
    expect((await rpc('mark_wasted_film', waste)).error).toBeNull();
    for (const [name, args] of [
      ['reserve_test_attempt', request],
      ['confirm_test_output', inspection],
      ['mark_wasted_film', waste],
    ] as const) {
      for (const client of [local.client(), f.signed.client])
        expect((await client.rpc(name, args)).error?.message).toContain('permission denied');
    }
    expect((await f.signed.client.auth.signOut({ scope: 'local' })).error).toBeNull();
    for (const [name, args] of [
      ['reserve_test_attempt', request],
      ['confirm_test_output', inspection],
      ['mark_wasted_film', waste],
    ] as const)
      expect((await rpc(name, args)).error?.message).toBe('forbidden');
  });
});
