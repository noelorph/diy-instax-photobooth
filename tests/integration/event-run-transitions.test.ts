// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { localSupabase } from '../fixtures/local-supabase';

function sql(query: string) {
  const output = execFileSync(
    resolve('node_modules/.bin/supabase'),
    ['db', 'query', '--local', query, '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return output.trim().startsWith('{') ? JSON.parse(output).rows : [];
}
const hash = () => randomBytes(32).toString('hex');
describe('Event and Booth run lifecycle', () => {
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
        await local.service.from('events').insert({
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
        await local.service.from('print_attempts').insert({
          id: test,
          event_id: id,
          kind: 'Test',
          state: 'Confirmed',
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
  it('prepares exactly once without a usable grant and detects changed-input replay', async () => {
    const f = await prepared();
    expect(f.p).toMatchObject({ event_state: 'Live', run_state: 'Prepared', revision: 2 });
    expect((await rpc('prepare_booth_handoff', f.args)).data).toEqual(f.p);
    expect(
      (await rpc('prepare_booth_handoff', { ...f.args, connection_id: randomUUID() })).error
        ?.message
    ).toBe('idempotency_conflict');
    expect(
      (await local.service.from('booth_runs').select().eq('event_id', f.id)).data
    ).toHaveLength(1);
    expect(
      (await local.service.from('booth_grants').select().eq('event_id', f.id)).data
    ).toMatchObject([{ state: 'Inactive', secret_hash: null }]);
    const r = await rpc('confirm_booth_handoff', {
      handoff_id: f.p.handoff_id,
      grant_hash: hash(),
      operation_key: randomUUID(),
    });
    expect(r.error?.message).toBe('forbidden');
  });
  it('requires narrow setup evidence, current usable Test Print, stock and allowance', async () => {
    const f = await fixture();
    for (const setup_evidence of [
      { ...f.args.setup_evidence, camera_ready: false },
      { ...f.args.setup_evidence, photo: 'not allowed' },
      { ...f.args.setup_evidence, printer_mode: 'real' },
    ])
      expect(
        (await rpc('prepare_booth_handoff', { ...f.args, setup_evidence })).error?.message
      ).toBe('not_ready');
    expect(
      (await rpc('prepare_booth_handoff', { ...f.args, connection_id: randomUUID() })).error
        ?.message
    ).toBe('not_ready');
    sql(`update public.print_attempts set state='WastedFilm' where id='${f.test}'`);
    expect((await rpc('prepare_booth_handoff', f.args)).error?.message).toBe('not_ready');
    sql(
      `do $$ begin update public.print_attempts set state='Confirmed' where id='${f.test}'; update public.film_stock_balance set on_hand=0 where id='00000000-0000-0000-0000-000000000001'; end $$`
    );
    expect((await rpc('prepare_booth_handoff', f.args)).error?.message).toBe('not_ready');
    sql(
      `do $$ begin update public.film_stock_balance set on_hand=10 where id='00000000-0000-0000-0000-000000000001'; update public.events set original_print_allowance=0,revision=2 where id='${f.id}'; end $$`
    );
    expect(
      (await rpc('prepare_booth_handoff', { ...f.args, expected_revision: 2 })).error?.message
    ).toBe('not_ready');
  }, 20000);
  it('rejects stale revisions and serializes competing Live Events', async () => {
    const f = await fixture();
    const g = await fixture();
    expect(
      (await rpc('prepare_booth_handoff', { ...f.args, expected_revision: 0 })).error?.message
    ).toBe('state_conflict');
    const results = await Promise.all([
      rpc('prepare_booth_handoff', f.args),
      rpc('prepare_booth_handoff', g.args),
    ]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.message).toBe('state_conflict');
  });
  it('requires matching device proof and local revocation, then activates only with the issued cookie hash', async () => {
    const f = await prepared();
    const other = await local.signIn(f.a.user);
    const issue = {
      handoff_id: f.p.handoff_id,
      device_token_hash: hash(),
      operation_key: randomUUID(),
      grant_hash: hash(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };
    expect((await rpc('finish_booth_handoff', issue)).error?.message).toBe('forbidden');
    expect((await f.a.client.auth.signOut({ scope: 'local' })).error).toBeNull();
    issue.device_token_hash = f.args.setup_evidence.device_token_hash;
    expect((await rpc('finish_booth_handoff', issue)).data.run_state).toBe('Prepared');
    expect((await rpc('finish_booth_handoff', issue)).data.run_state).toBe('Prepared');
    expect(
      (await rpc('finish_booth_handoff', { ...issue, operation_key: randomUUID() })).error?.message
    ).toBe('state_conflict');
    const confirm = {
      handoff_id: f.p.handoff_id,
      grant_hash: issue.grant_hash,
      operation_key: randomUUID(),
    };
    const result = await rpc('confirm_booth_handoff', confirm);
    expect(result.data.run_state).toBe('Active');
    expect((await rpc('confirm_booth_handoff', confirm)).data).toEqual(result.data);
    expect((await other.client.auth.getUser()).error).toBeNull();
    expect(
      (await local.service.from('booth_grants').select().eq('event_id', f.id)).data
    ).toMatchObject([{ state: 'Active' }]);
  });
  it('commits Paused and revocation when local sign-out fails', async () => {
    const f = await prepared();
    const r = await rpc('finish_booth_handoff', {
      handoff_id: f.p.handoff_id,
      device_token_hash: f.args.setup_evidence.device_token_hash,
      operation_key: randomUUID(),
      grant_hash: hash(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ run_state: 'Paused', error: 'handoff_failed' });
    expect(
      (await local.service.from('booth_grants').select().eq('event_id', f.id)).data
    ).toMatchObject([{ state: 'Revoked', secret_hash: null }]);
  });
  it('expires prepared and issued handoffs durably and never activates a revoked run', async () => {
    const f = await issued();
    sql(
      `update public.booth_handoffs set expires_at=now()-interval '1 second' where id='${f.p.handoff_id}'`
    );
    const args = {
      handoff_id: f.p.handoff_id,
      grant_hash: f.issue.grant_hash,
      operation_key: randomUUID(),
    };
    expect((await rpc('confirm_booth_handoff', args)).data).toMatchObject({
      run_state: 'Paused',
      error: 'handoff_expired',
    });
    expect(
      (await rpc('confirm_booth_handoff', { ...args, operation_key: randomUUID() })).error?.message
    ).toBe('state_conflict');
    expect(
      (await local.service.from('booth_grants').select().eq('event_id', f.id)).data
    ).toMatchObject([{ state: 'Revoked' }]);
  });
  it('rejects nonfinite or excessive grant expiry without issuing a secret', async () => {
    const f = await prepared();
    await f.a.client.auth.signOut({ scope: 'local' });
    for (const expires_at of [
      'infinity',
      '2020-01-01T00:00:00Z',
      new Date(Date.now() + 49 * 3600000).toISOString(),
    ])
      expect(
        (
          await rpc('finish_booth_handoff', {
            handoff_id: f.p.handoff_id,
            device_token_hash: f.args.setup_evidence.device_token_hash,
            operation_key: randomUUID(),
            grant_hash: hash(),
            expires_at,
          })
        ).error?.message
      ).toBe('validation_error');
    expect(
      (await local.service.from('booth_grants').select().eq('event_id', f.id)).data
    ).toMatchObject([{ secret_hash: null }]);
  });
  it('persists PauseRequested until settlement and revokes before explicit resume with a new run', async () => {
    const f = await active();
    const a = await admin();
    const attempt = randomUUID();
    expect(
      (
        await local.service.from('print_attempts').insert({
          id: attempt,
          event_id: f.id,
          kind: 'Test',
          request_key: randomUUID(),
          connection_id: f.args.connection_id,
        })
      ).error
    ).toBeNull();
    expect((await change(f, a, 'complete', f.revision)).error?.message).toBe('pending_attempt');
    expect((await change(f, a, 'cancel', f.revision)).error?.message).toBe('pending_attempt');
    const r = await change(f, a, 'pause', f.revision);
    expect(r.data.run_state).toBe('PauseRequested');
    expect(
      (await local.service.from('booth_grants').select().eq('event_id', f.id)).data
    ).toMatchObject([{ state: 'Active' }]);
    sql(
      `do $$ begin perform 1 from public.events where id='${f.id}' for update; update public.print_attempts set state='RejectedUnused' where id='${attempt}'; perform private.settle_booth_pause('${f.id}'); end $$`
    );
    expect(
      (await local.service.from('booth_runs').select().eq('id', f.p.run_id).single()).data.state
    ).toBe('Paused');
    const revision = (await local.service.from('events').select('revision').eq('id', f.id).single())
      .data!.revision;
    const resumed = await rpc('prepare_booth_handoff', {
      ...f.args,
      admin_user_id: a.admin_user_id,
      admin_session_id: a.admin_session_id,
      expected_revision: revision,
      operation_key: randomUUID(),
    });
    expect(resumed.error).toBeNull();
    expect(resumed.data.run_state).toBe('Prepared');
    expect(resumed.data.run_id).not.toBe(f.p.run_id);
    expect(
      (await local.service.from('booth_grants').select().eq('run_id', f.p.run_id)).data
    ).toMatchObject([{ state: 'Revoked' }]);
  }, 20000);
  it('pauses immediately without attempts and ends terminal Events without resume', async () => {
    const f = await active();
    const a = await admin();
    const key = randomUUID();
    expect((await change(f, a, 'pause', f.revision - 1)).error?.message).toBe('state_conflict');
    const r = await change(f, a, 'pause', f.revision, key);
    expect(r.data.run_state).toBe('Paused');
    expect((await change(f, a, 'pause', f.revision, key)).data).toEqual(r.data);
    const done = await change(f, a, 'complete', r.data.revision);
    expect(done.data.event_state).toBe('Completed');
    expect(
      (
        await rpc('prepare_booth_handoff', {
          ...f.args,
          admin_user_id: a.admin_user_id,
          admin_session_id: a.admin_session_id,
          expected_revision: done.data.revision,
          operation_key: randomUUID(),
        })
      ).error?.message
    ).toBe('state_conflict');
  });
  it('cancels Draft but cannot complete Draft, and denies direct browser operations', async () => {
    const f = await fixture();
    expect((await change(f, f.a, 'complete', 1)).error?.message).toBe('state_conflict');
    for (const client of [local.client(), f.a.client])
      expect((await client.rpc('prepare_booth_handoff', f.args)).error?.code).toBe('42501');
    const outsider = await admin(false);
    expect(
      (
        await rpc('prepare_booth_handoff', {
          ...f.args,
          admin_user_id: outsider.admin_user_id,
          admin_session_id: outsider.admin_session_id,
        })
      ).error?.message
    ).toBe('forbidden');
    expect((await change(f, f.a, 'cancel', 1)).data).toMatchObject({
      event_state: 'Cancelled',
      run_state: null,
    });
    expect(
      (await rpc('prepare_booth_handoff', { ...f.args, expected_revision: 2 })).error?.message
    ).toBe('state_conflict');
    for (const fn of [
      'prepare_booth_handoff',
      'finish_booth_handoff',
      'confirm_booth_handoff',
      'change_event_run',
    ])
      expect(
        sql(
          `select has_function_privilege('authenticated',oid,'EXECUTE') as browser from pg_proc where pronamespace='public'::regnamespace and proname='${fn}'`
        )
      ).toEqual([{ browser: false }]);
  }, 20000);
  it('stores only opaque lifecycle results and protects bound proof from browser reads', async () => {
    const f = await active();
    const receipts = (await local.service.from('operation_receipts').select().eq('event_id', f.id))
      .data!;
    const serialized = JSON.stringify(receipts);
    for (const privateValue of [
      f.issue.grant_hash,
      f.args.setup_evidence.device_token_hash,
      'Lifecycle fixture',
      'fixture@example.test',
    ])
      expect(serialized).not.toContain(privateValue);
    expect((await local.client().from('booth_handoffs').select()).error?.code).toBe('42501');
  });
  it('expires an issued handoff even when issue is retried with the original operation key', async () => {
    const f = await issued();
    sql(
      `update public.booth_handoffs set expires_at=now()-interval '1 second' where id='${f.p.handoff_id}'`
    );
    const result = await rpc('finish_booth_handoff', f.issue);
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ run_state: 'Paused', error: 'handoff_expired' });
    expect(
      (await local.service.from('booth_grants').select().eq('event_id', f.id)).data
    ).toMatchObject([{ state: 'Revoked' }]);
  });
  it('does not replay a successful activation after the grant was revoked', async () => {
    const f = await active();
    const a = await admin();
    expect((await change(f, a, 'pause', f.revision)).error).toBeNull();
    expect((await rpc('confirm_booth_handoff', f.confirm)).error?.message).toBe('state_conflict');
  });
  it('revokes at Uncertain while retaining the hold that blocks completion', async () => {
    const f = await active();
    const a = await admin();
    const attempt = randomUUID();
    const session = randomUUID();
    const capture = randomUUID();
    sql(`do $$ begin
      insert into public.guest_sessions(id,event_id,run_id) values('${session}','${f.id}','${f.p.run_id}');
      insert into public.captures(id,event_id,run_id,session_id,captured_at) values('${capture}','${f.id}','${f.p.run_id}','${session}',now());
      insert into public.print_attempts(id,event_id,run_id,session_id,capture_id,kind,state,request_key,connection_id) values('${attempt}','${f.id}','${f.p.run_id}','${session}','${capture}','Guest','Accepted',gen_random_uuid(),'${f.args.connection_id}');
    end $$`);
    expect((await change(f, a, 'pause', f.revision)).data.run_state).toBe('PauseRequested');
    sql(
      `do $$ begin perform 1 from public.events where id='${f.id}' for update; update public.print_attempts set state='Uncertain' where id='${attempt}'; perform private.settle_booth_pause('${f.id}'); end $$`
    );
    const revision = (await local.service.from('events').select('revision').eq('id', f.id).single())
      .data!.revision;
    expect(
      (await local.service.from('booth_grants').select().eq('event_id', f.id)).data
    ).toMatchObject([{ state: 'Revoked' }]);
    expect((await change(f, a, 'complete', revision)).error?.message).toBe('pending_attempt');
    expect((await change(f, a, 'cancel', revision)).error?.message).toBe('pending_attempt');
    expect(
      (await local.service.from('guest_sessions').select('state').eq('id', session).single()).data
        ?.state
    ).toBe('Open');
  }, 20000);
  it('rejects revoked and mismatched Admin sessions including prepare receipt replay', async () => {
    const f = await prepared();
    const a = await admin();
    expect(
      (await rpc('prepare_booth_handoff', { ...f.args, admin_session_id: a.admin_session_id }))
        .error?.message
    ).toBe('forbidden');
    await f.a.client.auth.signOut({ scope: 'local' });
    expect((await rpc('prepare_booth_handoff', f.args)).error?.message).toBe('forbidden');
    expect((await change(f, f.a, 'pause', 2)).error?.message).toBe('forbidden');
  });
});
