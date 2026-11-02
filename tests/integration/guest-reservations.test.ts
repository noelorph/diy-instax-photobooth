// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { localOwnerSql as sql, localSupabase, ownerInsert } from '../fixtures/local-supabase';

const hash = () => randomBytes(32).toString('hex');
describe('Guest sessions and reservations', { timeout: 20000 }, () => {
  const local = localSupabase();
  const ids: string[] = [];
  afterEach(async () => {
    for (const id of ids)
      sql(`do $$ begin
      delete from public.operation_receipts where event_id='${id}';
      delete from public.activity_events where event_id='${id}';
      if to_regclass('public.booth_handoffs') is not null then execute 'delete from public.booth_handoffs where event_id=''${id}'''; end if;
      delete from public.booth_grants where event_id='${id}';
      delete from public.print_attempt_events where attempt_id in (select id from public.print_attempts where event_id='${id}');
      delete from public.print_attempts where event_id='${id}';
      delete from public.captures where event_id='${id}';
      delete from public.guest_sessions where event_id='${id}';
      delete from public.booth_runs where event_id='${id}';
      delete from public.additional_print_entries where event_id='${id}';
      delete from public.events where id='${id}';
      update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries) where id='00000000-0000-0000-0000-000000000001';
    end $$`);
    ids.length = 0;
    await local.cleanup();
  }, 20000);
  async function admin(allowed = true) {
    const user = await local.provisionUser();
    if (allowed) expect((await local.allowlist(user.id)).error).toBeNull();
    const signed = await local.signIn(user);
    const session = JSON.parse(
      Buffer.from(signed.session.access_token.split('.')[1], 'base64url').toString()
    ).session_id;
    return { ...signed, user, admin_user_id: user.id, admin_session_id: session };
  }
  async function fixture(state = 'Draft') {
    const a = await admin();
    const id = randomUUID();
    ids.push(id);
    expect(
      (
        await ownerInsert('events', {
          id,
          state,
          title: 'Lifecycle fixture',
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
    const connection = randomUUID();
    const test = randomUUID();
    expect(
      (
        await ownerInsert('print_attempts', {
          id: test,
          event_id: id,
          kind: 'Test',
          state: 'Confirmed',
          test_output_usable: true,
          request_key: randomUUID(),
          connection_id: connection,
        })
      ).error
    ).toBeNull();
    sql(
      "update public.film_stock_balance set on_hand=10 where id='00000000-0000-0000-0000-000000000001'"
    );
    const args = {
      admin_user_id: a.admin_user_id,
      admin_session_id: a.admin_session_id,
      event_id: id,
      expected_revision: 1,
      operation_key: randomUUID(),
      connection_id: connection,
      setup_evidence: {
        device_token_hash: hash(),
        camera_ready: true,
        printer_ready: true,
        guided_access_ready: true,
        printer_mode: 'simulated',
      },
    };
    return { a, id, test, args };
  }
  const rpc = (name: string, args: Record<string, unknown>) => local.service.rpc(name, args);
  async function prepared() {
    const f = await fixture();
    const result = await rpc('prepare_booth_handoff', f.args);
    expect(result.error).toBeNull();
    return { ...f, p: result.data };
  }
  async function issued() {
    const f = await prepared();
    expect((await f.a.client.auth.signOut({ scope: 'local' })).error).toBeNull();
    const issue = {
      handoff_id: f.p.handoff_id,
      device_token_hash: f.args.setup_evidence.device_token_hash,
      operation_key: randomUUID(),
      grant_hash: hash(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };
    const result = await rpc('finish_booth_handoff', issue);
    expect(result.error).toBeNull();
    expect(result.data.run_state).toBe('Prepared');
    return { ...f, issue };
  }
  async function active() {
    const f = await issued();
    const confirm = {
      handoff_id: f.p.handoff_id,
      grant_hash: f.issue.grant_hash,
      operation_key: randomUUID(),
    };
    const result = await rpc('confirm_booth_handoff', confirm);
    expect(result.error).toBeNull();
    expect(result.data.run_state).toBe('Active');
    return { ...f, confirm, revision: result.data.revision };
  }
  async function change(
    f: { id: string },
    a: Awaited<ReturnType<typeof admin>>,
    action: string,
    revision: number,
    key = randomUUID()
  ) {
    return rpc('change_event_run', {
      admin_user_id: a.admin_user_id,
      admin_session_id: a.admin_session_id,
      event_id: f.id,
      expected_revision: revision,
      operation_key: key,
      action,
    });
  }
  async function opened() {
    const f = await active();
    const args = {
      grant_hash: f.issue.grant_hash,
      run_id: f.p.run_id,
      operation_key: randomUUID(),
    };
    const result = await rpc('open_guest_session', args);
    expect(result.error).toBeNull();
    return { ...f, openArgs: args, session: result.data.session_id };
  }
  async function captured() {
    const f = await opened();
    const captureArgs = {
      grant_hash: f.issue.grant_hash,
      session_id: f.session,
      operation_key: randomUUID(),
      captured_at: '2026-10-16T10:00:00Z',
    };
    const result = await rpc('record_capture', captureArgs);
    expect(result.error).toBeNull();
    const reserveArgs = {
      grant_hash: f.issue.grant_hash,
      run_id: f.p.run_id,
      session_id: f.session,
      capture_id: result.data.capture_id,
      operation_key: randomUUID(),
    };
    return { ...f, captureArgs, capture: result.data, reserveArgs };
  }
  it('opens once under concurrent retries and rejects a second open session', async () => {
    const f = await active();
    const args = {
      grant_hash: f.issue.grant_hash,
      run_id: f.p.run_id,
      operation_key: randomUUID(),
    };
    const results = await Promise.all([
      rpc('open_guest_session', args),
      rpc('open_guest_session', args),
    ]);
    expect(results[0].error).toBeNull();
    expect(results[1].data).toEqual(results[0].data);
    expect(results[0].data.availability).toMatchObject({
      remaining_allowance: 10,
      available_stock: 10,
    });
    expect(
      (await rpc('open_guest_session', { ...args, operation_key: randomUUID() })).error?.message
    ).toBe('state_conflict');
    expect(
      (await local.service.from('print_attempts').select().eq('event_id', f.id).eq('kind', 'Guest'))
        .data
    ).toHaveLength(0);
  });
  it('counts Retakes and normalizes timestamp retries without duplicating Captures', async () => {
    const f = await captured();
    expect(
      (await rpc('record_capture', { ...f.captureArgs, captured_at: '2026-10-16T18:00:00+08:00' }))
        .data
    ).toEqual(f.capture);
    expect(
      (await rpc('record_capture', { ...f.captureArgs, captured_at: '2026-10-16T10:00:01Z' })).error
        ?.message
    ).toBe('idempotency_conflict');
    const retake = await rpc('record_capture', { ...f.captureArgs, operation_key: randomUUID() });
    expect(retake.error).toBeNull();
    expect(retake.data.capture_count).toBe(2);
    expect(retake.data.capture_id).not.toBe(f.capture.capture_id);
    expect(
      (
        await rpc('record_capture', {
          ...f.captureArgs,
          operation_key: randomUUID(),
          captured_at: 'infinity',
        })
      ).error?.message
    ).toBe('validation_error');
  });
  it('requires a persisted acknowledged Capture belonging to the open session', async () => {
    const f = await captured();
    expect(
      (await rpc('reserve_guest_attempt', { ...f.reserveArgs, capture_id: randomUUID() })).error
        ?.message
    ).toBe('state_conflict');
    const abandon = {
      grant_hash: f.issue.grant_hash,
      session_id: f.session,
      operation_key: randomUUID(),
    };
    expect((await rpc('abandon_guest_session', abandon)).data.state).toBe('Abandoned');
    expect((await rpc('abandon_guest_session', abandon)).data.state).toBe('Abandoned');
    const second = await rpc('open_guest_session', { ...f.openArgs, operation_key: randomUUID() });
    expect(
      (await rpc('reserve_guest_attempt', { ...f.reserveArgs, session_id: second.data.session_id }))
        .error?.message
    ).toBe('state_conflict');
    expect((await rpc('reserve_guest_attempt', f.reserveArgs)).error?.message).toBe(
      'state_conflict'
    );
    expect(
      (await local.service.from('captures').select().eq('session_id', f.session)).data
    ).toHaveLength(1);
  });
  it('reserves one allowance and sheet atomically and retries return the same attempt', async () => {
    const f = await captured();
    const results = await Promise.all([
      rpc('reserve_guest_attempt', f.reserveArgs),
      rpc('reserve_guest_attempt', f.reserveArgs),
    ]);
    expect(results[0].error).toBeNull();
    expect(results[1].data).toEqual(results[0].data);
    expect(results[0].data).toMatchObject({
      state: 'Reserved',
      allowance_hold: 1,
      film_hold: 1,
      availability: { remaining_allowance: 9, available_stock: 9 },
    });
    expect(
      (await rpc('reserve_guest_attempt', { ...f.reserveArgs, capture_id: randomUUID() })).error
        ?.message
    ).toBe('idempotency_conflict');
    expect(
      (
        await rpc('abandon_guest_session', {
          grant_hash: f.issue.grant_hash,
          session_id: f.session,
          operation_key: randomUUID(),
        })
      ).error?.message
    ).toBe('pending_attempt');
    expect(
      (await local.service.from('print_attempts').select().eq('id', results[0].data.attempt_id))
        .data
    ).toMatchObject([{ connection_id: f.args.connection_id, state: 'Reserved' }]);
    expect(
      (
        await local.service
          .from('print_attempt_events')
          .select()
          .eq('attempt_id', results[0].data.attempt_id)
      ).data
    ).toMatchObject([{ state: 'Reserved' }]);
    expect(
      (await local.service.from('film_stock_entries').select().eq('event_id', f.id)).data
    ).toHaveLength(0);
  });
  it.each(['allowance', 'stock', 'printer'])(
    'rejects exhausted %s and leaves no partial effects',
    async (resource) => {
      const f = await captured();
      if (resource === 'allowance')
        sql(
          `update public.events set original_print_allowance=0,revision=revision+1 where id='${f.id}'`
        );
      if (resource === 'stock') sql('update public.film_stock_balance set on_hand=0');
      if (resource === 'printer')
        sql(
          `insert into public.print_attempts(event_id,kind,request_key,connection_id) values('${f.id}','Test','${randomUUID()}','${f.args.connection_id}')`
        );
      const error =
        resource === 'allowance'
          ? 'allowance_exhausted'
          : resource === 'stock'
            ? 'stock_exhausted'
            : 'printer_busy';
      expect((await rpc('reserve_guest_attempt', f.reserveArgs)).error?.message).toBe(error);
      expect(
        (
          await local.service
            .from('print_attempts')
            .select()
            .eq('event_id', f.id)
            .eq('kind', 'Guest')
        ).data
      ).toHaveLength(0);
      expect(
        (
          await local.service
            .from('operation_receipts')
            .select()
            .eq('operation_key', f.reserveArgs.operation_key)
        ).data
      ).toHaveLength(0);
    }
  );
  it.each(['allowance', 'stock', 'printer'])(
    'admits exactly one simultaneous request for the last %s',
    async (resource) => {
      const f = await captured();
      if (resource === 'allowance')
        sql(
          `update public.events set original_print_allowance=1,revision=revision+1 where id='${f.id}'`
        );
      if (resource === 'stock') sql('update public.film_stock_balance set on_hand=1');
      const results = await Promise.all([
        rpc('reserve_guest_attempt', f.reserveArgs),
        rpc('reserve_guest_attempt', { ...f.reserveArgs, operation_key: randomUUID() }),
      ]);
      expect(results.filter((r) => !r.error)).toHaveLength(1);
      expect(results.filter((r) => r.error)).toHaveLength(1);
      expect(
        (
          await local.service
            .from('print_attempts')
            .select()
            .eq('event_id', f.id)
            .eq('kind', 'Guest')
        ).data
      ).toHaveLength(1);
    }
  );
  it('blocks new work when pause wins and retains the attempt when reservation wins', async () => {
    const f = await captured();
    const a = await admin();
    const reserved = await rpc('reserve_guest_attempt', f.reserveArgs);
    expect(reserved.error).toBeNull();
    expect((await change(f, a, 'pause', f.revision)).data.run_state).toBe('PauseRequested');
    for (const [name, args] of [
      ['reserve_guest_attempt', { ...f.reserveArgs, operation_key: randomUUID() }],
      ['open_guest_session', { ...f.openArgs, operation_key: randomUUID() }],
      ['record_capture', { ...f.captureArgs, operation_key: randomUUID() }],
    ] as const)
      expect((await rpc(name, args)).error?.message).toBe('state_conflict');
    expect((await change(f, a, 'complete', f.revision + 1)).error?.message).toBe('pending_attempt');
  });
  it('a completed pause abandons an unprinted session and denies its old grant', async () => {
    const f = await captured();
    const a = await admin();
    expect((await change(f, a, 'pause', f.revision)).data.run_state).toBe('Paused');
    expect((await rpc('reserve_guest_attempt', f.reserveArgs)).error?.message).toBe('forbidden');
    expect(
      (await local.service.from('guest_sessions').select().eq('id', f.session)).data
    ).toMatchObject([{ state: 'Abandoned' }]);
    expect(
      (await local.service.from('captures').select().eq('session_id', f.session)).data
    ).toHaveLength(1);
  });
  it.each(['expired', 'revoked', 'inactive', 'wrong_run', 'wrong_event'])(
    'rejects %s grants before mutation or receipt replay',
    async (condition) => {
      const f = await captured();
      if (condition === 'expired')
        sql(
          `update public.booth_grants set created_at=now()-interval '2 hours',expires_at=now()-interval '1 second' where run_id='${f.p.run_id}'`
        );
      if (condition === 'revoked')
        sql(
          `update public.booth_grants set state='Revoked',revoked_at=now() where run_id='${f.p.run_id}'`
        );
      if (condition === 'inactive')
        sql(`update public.booth_grants set state='Inactive' where run_id='${f.p.run_id}'`);
      if (condition === 'wrong_run') {
        const other = randomUUID();
        sql(
          `do $$ begin insert into public.booth_runs(id,event_id,state) values('${other}','${f.id}','Paused'); update public.booth_grants set run_id='${other}' where run_id='${f.p.run_id}'; end $$`
        );
      }
      if (condition === 'wrong_event') {
        const other = await fixture();
        const run = randomUUID();
        const secret = hash();
        sql(`do $$ begin
          insert into public.booth_runs(id,event_id,state) values('${run}','${other.id}','Active');
          insert into public.booth_grants(event_id,run_id,state,secret_hash,expires_at) values('${other.id}','${run}','Active','${secret}',now()+interval '1 hour');
        end $$`);
        f.reserveArgs.grant_hash = secret;
      }
      const result = await rpc('reserve_guest_attempt', f.reserveArgs);
      expect(result.error?.message).toBe(condition === 'expired' ? 'grant_expired' : 'forbidden');
      const replay = await rpc('record_capture', {
        ...f.captureArgs,
        grant_hash: f.reserveArgs.grant_hash,
      });
      expect(replay.error).not.toBeNull();
    }
  );
  it.each(['allowance', 'stock'])('does not open a session without %s', async (resource) => {
    const f = await active();
    if (resource === 'allowance')
      sql(
        `update public.events set original_print_allowance=0,revision=revision+1 where id='${f.id}'`
      );
    else sql('update public.film_stock_balance set on_hand=0');
    expect(
      (
        await rpc('open_guest_session', {
          grant_hash: f.issue.grant_hash,
          run_id: f.p.run_id,
          operation_key: randomUUID(),
        })
      ).error?.message
    ).toBe(resource === 'allowance' ? 'allowance_exhausted' : 'stock_exhausted');
    expect(
      (await local.service.from('guest_sessions').select().eq('event_id', f.id)).data
    ).toHaveLength(0);
  });
  it('requires the setup connection and a usable Test Print for that connection', async () => {
    const f = await captured();
    sql(`update public.booth_runs set connection_id=null where id='${f.p.run_id}'`);
    expect((await rpc('reserve_guest_attempt', f.reserveArgs)).error?.message).toBe('not_ready');
    sql(`update public.booth_runs set connection_id='${randomUUID()}' where id='${f.p.run_id}'`);
    expect((await rpc('reserve_guest_attempt', f.reserveArgs)).error?.message).toBe('not_ready');
    sql(
      `do $$ begin update public.booth_runs set connection_id='${f.args.connection_id}' where id='${f.p.run_id}'; update public.print_attempts set state='WastedFilm' where id='${f.test}'; end $$`
    );
    expect((await rpc('reserve_guest_attempt', f.reserveArgs)).error?.message).toBe('not_ready');
  }, 20000);
  it('serializes Capture retries and preserves their metadata after abandonment', async () => {
    const f = await opened();
    const args = {
      grant_hash: f.issue.grant_hash,
      session_id: f.session,
      operation_key: randomUUID(),
      captured_at: '2026-10-16T10:00:00Z',
    };
    const results = await Promise.all([rpc('record_capture', args), rpc('record_capture', args)]);
    expect(results[0].error).toBeNull();
    expect(results[1].data).toEqual(results[0].data);
    expect(results[0].data.capture_count).toBe(1);
    expect(
      (
        await rpc('abandon_guest_session', {
          grant_hash: f.issue.grant_hash,
          session_id: f.session,
          operation_key: randomUUID(),
        })
      ).error
    ).toBeNull();
    expect((await rpc('record_capture', args)).data).toEqual(results[0].data);
    expect(
      (await rpc('record_capture', { ...args, operation_key: randomUUID() })).error?.message
    ).toBe('state_conflict');
  });
  it('checks changed-session input before replay and keeps receipts free of grant proof', async () => {
    const f = await captured();
    const abandon = {
      grant_hash: f.issue.grant_hash,
      session_id: f.session,
      operation_key: randomUUID(),
    };
    expect((await rpc('abandon_guest_session', abandon)).error).toBeNull();
    const opened = await rpc('open_guest_session', { ...f.openArgs, operation_key: randomUUID() });
    expect(opened.error).toBeNull();
    expect(
      (await rpc('record_capture', { ...f.captureArgs, session_id: opened.data.session_id })).error
        ?.message
    ).toBe('idempotency_conflict');
    expect(
      (await rpc('abandon_guest_session', { ...abandon, session_id: opened.data.session_id })).error
        ?.message
    ).toBe('idempotency_conflict');
    const receipts = (await local.service.from('operation_receipts').select().eq('event_id', f.id))
      .data;
    expect(JSON.stringify(receipts)).not.toContain(f.issue.grant_hash);
    expect(JSON.stringify(receipts)).not.toContain('fixture@example.test');
  });
  it('derives allowance from additions, usable prints, and the new hold', async () => {
    const f = await captured();
    const used = randomUUID();
    const wasted = randomUUID();
    const previousSession = randomUUID();
    const previousCapture = randomUUID();
    const wastedSession = randomUUID();
    const wastedCapture = randomUUID();
    sql(`do $$ begin
      insert into public.additional_print_entries(event_id,quantity,actor_id) values('${f.id}',3,'${f.a.admin_user_id}');
      insert into public.guest_sessions(id,event_id,run_id,state,closed_at) values
        ('${previousSession}','${f.id}','${f.p.run_id}','Printed',now()),('${wastedSession}','${f.id}','${f.p.run_id}','Printed',now());
      insert into public.captures(id,event_id,run_id,session_id,captured_at) values
        ('${previousCapture}','${f.id}','${f.p.run_id}','${previousSession}',now()),('${wastedCapture}','${f.id}','${f.p.run_id}','${wastedSession}',now());
      insert into public.print_attempts(id,event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id) values
        ('${used}','${f.id}','${f.p.run_id}','${previousSession}','${previousCapture}','Guest','Confirmed','${randomUUID()}','${f.args.connection_id}'),
        ('${wasted}','${f.id}','${f.p.run_id}','${wastedSession}','${wastedCapture}','Guest','AdminResolvedEjected','${randomUUID()}','${f.args.connection_id}');
      insert into public.print_attempt_events(attempt_id,actor_scope,state,reason) values('${wasted}','fixture','WastedFilm','Fixture unusable sheet');
    end $$`);
    const result = await rpc('reserve_guest_attempt', f.reserveArgs);
    expect(result.error).toBeNull();
    expect(result.data.availability.remaining_allowance).toBe(11);
    sql(`delete from public.additional_print_entries where event_id='${f.id}'`);
  });
  it('denies browser execution of all four narrow RPCs', async () => {
    const f = await captured();
    expect(
      sql(`select bool_and(not has_function_privilege('authenticated',oid,'EXECUTE')) as denied
      from pg_proc where pronamespace='public'::regnamespace and proname in ('open_guest_session','record_capture','abandon_guest_session','reserve_guest_attempt')`)
    ).toEqual([{ denied: true }]);
    expect(
      sql(`select bool_and(not has_function_privilege('service_role',oid,'EXECUTE')) as denied
      from pg_proc where pronamespace='private'::regnamespace and proname in ('guest_operation','guest_availability')`)
    ).toEqual([{ denied: true }]);
    for (const [name, args] of [
      ['open_guest_session', f.openArgs],
      ['record_capture', f.captureArgs],
      ['reserve_guest_attempt', f.reserveArgs],
      [
        'abandon_guest_session',
        { grant_hash: f.issue.grant_hash, session_id: f.session, operation_key: randomUUID() },
      ],
    ] as const)
      expect((await local.client().rpc(name, args)).error?.code).toBe('42501');
  });
});
