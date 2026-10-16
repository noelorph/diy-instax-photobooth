// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localSupabase } from '../fixtures/local-supabase';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/operations/privileged-client', () => ({ createPrivilegedClient: vi.fn() }));
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { localSupabaseStatus } from '../fixtures/local-supabase';
import { POST as deleteDraft } from '@/app/api/admin/events/[eventId]/delete-draft/route';
import { POST as redactClient } from '@/app/api/admin/events/[eventId]/redact-client/route';
import { getDraft, listDrafts } from '@/lib/events/drafts';
import { listHistory, listPendingMediaRemovals } from '@/lib/events/history';
const request = (body: unknown, origin = 'https://booth.test') =>
  new Request('https://booth.test/api/admin/test', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const context = (eventId: string) => ({ params: Promise.resolve({ eventId }) });

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

describe('Client Redaction and Draft deletion', { timeout: 30000 }, () => {
  const local = localSupabase();
  const ids: string[] = [];
  const rpc = (name: string, args: Record<string, unknown>) => local.service.rpc(name, args);
  afterEach(async () => {
    vi.resetAllMocks();
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
    vi.mocked(createClient).mockResolvedValue(signed.client);
    vi.mocked(createPrivilegedClient).mockReturnValue(
      local.service as ReturnType<typeof createPrivilegedClient>
    );
    return { id, connection, admin, signed, stock };
  }

  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const begin = (f: Fixture, action = 'delete_draft', expected_revision = 1) => ({
    ...f.admin,
    event_id: f.id,
    action,
    expected_revision,
    operation_key: randomUUID(),
  });
  it('erases a Draft identity, hides its tombstone and retains stock and Test history exactly once', async () => {
    const f = await fixture();
    sql(
      `insert into public.print_attempts(event_id,kind,state,request_key,connection_id) values('${f.id}','Test','Confirmed','${randomUUID()}','${f.connection}');`
    );
    const request = begin(f);
    const results = await Promise.all([
      rpc('begin_event_redaction', request),
      rpc('begin_event_redaction', request),
    ]);
    results.forEach((r) => expect(r.error).toBeNull());
    expect(results[0].data).toEqual(results[1].data);
    expect(results[0].data).toMatchObject({
      event_id: f.id,
      media_removal_state: 'pending',
      revision: 2,
    });
    const row = sql(`select * from public.events where id='${f.id}'`)[0];
    for (const key of [
      'title',
      'client_name',
      'client_email',
      'client_phone',
      'venue_address',
      'time_zone',
      'starts_at',
      'ends_at',
    ])
      expect(row[key]).toBeNull();
    expect(row.deleted_at).toBeTruthy();
    expect((await f.signed.client.from('events').select('*').eq('id', f.id)).data).toEqual([]);
    expect(
      (
        await f.signed.client
          .from('events')
          .update({ title: 'Revived', revision: 3 })
          .eq('id', f.id)
          .select()
      ).data
    ).toEqual([]);
    expect(sql(`select id from public.print_attempts where event_id='${f.id}'`)).toHaveLength(1);
    expect(Number(sql('select on_hand from public.film_stock_balance')[0].on_hand)).toBe(f.stock);
    expect(
      sql(`select operation_kind from public.activity_events where event_id='${f.id}'`)
    ).toEqual([{ operation_kind: 'delete_draft' }]);
    expect(
      (await rpc('begin_event_redaction', { ...request, expected_revision: 2 })).error?.message
    ).toBe('idempotency_conflict');
  });
  it.each(['Completed', 'Cancelled'])(
    'redacts contacts for %s while keeping booking and accounting',
    async (state) => {
      const f = await fixture();
      sql(`update public.events set state='${state}',revision=2 where id='${f.id}'`);
      const request = { ...begin(f, 'redact_client', 2), replacement_title: 'Anonymous party' };
      const result = await rpc('begin_event_redaction', request);
      expect(result.error).toBeNull();
      const row = sql(`select * from public.events where id='${f.id}'`)[0];
      expect(row).toMatchObject({
        title: 'Anonymous party',
        client_name: null,
        client_email: null,
        client_phone: null,
        venue_address: 'Venue',
        time_zone: 'Asia/Manila',
        original_print_allowance: 10,
        deleted_at: null,
        media_removal_state: 'pending',
      });
      expect((await f.signed.client.from('events').select('id').eq('id', f.id)).data).toEqual([
        { id: f.id },
      ]);
      const retained =
        JSON.stringify(sql(`select * from public.activity_events where event_id='${f.id}'`)) +
        JSON.stringify(sql(`select * from public.operation_receipts where event_id='${f.id}'`));
      expect(retained).not.toContain('Anonymous party');
      expect(retained).not.toContain('fixture@example.test');
      expect(
        (await rpc('begin_event_redaction', { ...request, replacement_title: 'Changed' })).error
          ?.message
      ).toBe('idempotency_conflict');
    }
  );
  it.each(['Reserved', 'Accepted', 'Uncertain'])(
    'blocks deletion with a %s Film hold',
    async (state) => {
      const f = await fixture();
      sql(
        `insert into public.print_attempts(event_id,kind,state,request_key,connection_id) values('${f.id}','Test','${state}','${randomUUID()}','${f.connection}')`
      );
      expect((await rpc('begin_event_redaction', begin(f))).error?.message).toBe('pending_attempt');
      expect(sql(`select title from public.events where id='${f.id}'`)[0].title).toBe(
        'Setup fixture'
      );
    }
  );
  it('requires current authority before replay, and prohibits browser RPC calls', async () => {
    const f = await fixture(),
      request = begin(f);
    expect((await rpc('begin_event_redaction', request)).error).toBeNull();
    const completion = { ...f.admin, event_id: f.id, operation_key: request.operation_key };
    for (const client of [local.client(), f.signed.client]) {
      expect((await client.rpc('begin_event_redaction', request)).error?.message).toContain(
        'permission denied'
      );
      expect((await client.rpc('complete_event_redaction', completion)).error?.message).toContain(
        'permission denied'
      );
    }
    await f.signed.client.auth.signOut({ scope: 'local' });
    expect((await rpc('begin_event_redaction', request)).error?.message).toBe('forbidden');
    expect((await rpc('complete_event_redaction', completion)).error?.message).toBe('forbidden');
  });
  it('completes only its begun removal and repeats completion without another revision or activity', async () => {
    const f = await fixture(),
      request = begin(f),
      completion = { ...f.admin, event_id: f.id, operation_key: request.operation_key };
    expect((await rpc('complete_event_redaction', completion)).error?.message).toBe(
      'state_conflict'
    );
    expect((await rpc('begin_event_redaction', request)).error).toBeNull();
    const result = await rpc('complete_event_redaction', completion);
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ media_removal_state: 'complete', revision: 3 });
    expect((await rpc('complete_event_redaction', completion)).data).toEqual(result.data);
    sql(`update public.events set revision=revision+1 where id='${f.id}'`);
    expect((await rpc('complete_event_redaction', completion)).data).toEqual(result.data);
    expect(
      sql(`select operation_kind from public.activity_events where event_id='${f.id}'`)
    ).toHaveLength(2);
  });

  it('keeps failed media removal pending, discovers it after reload, and retries without another erasure', async () => {
    const f = await fixture(),
      other = randomUUID();
    const paths = [
      `${f.id}/${randomUUID()}`,
      `${f.id}/${randomUUID()}/${randomUUID()}`,
      `${other}/${randomUUID()}`,
    ];
    expect(
      (await local.service.storage.createBucket('event_media', { public: false })).error
    ).toBeNull();
    try {
      for (const path of paths)
        expect(
          (
            await local.service.storage
              .from('event_media')
              .upload(path, 'Event branding fixture', { contentType: 'text/plain' })
          ).error
        ).toBeNull();
      const status = localSupabaseStatus();
      const failing = createSupabaseClient(status.API_URL, status.SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input, init) => {
            if (
              String(input).includes('/storage/v1/object/event_media') &&
              init?.method === 'DELETE'
            )
              return new Response(JSON.stringify({ message: 'temporarily unavailable' }), {
                status: 503,
              });
            return fetch(input, init);
          },
        },
      });
      vi.mocked(createPrivilegedClient).mockReturnValue(
        failing as ReturnType<typeof createPrivilegedClient>
      );
      const body = { operationKey: randomUUID(), expectedRevision: 1 };
      const failed = await deleteDraft(request(body), context(f.id));
      expect(failed.status).toBe(200);
      expect(await failed.json()).toMatchObject({
        eventId: f.id,
        mediaRemovalState: 'pending',
        revision: 2,
      });
      expect(await getDraft(f.id)).toEqual({ status: 'not_found' });
      expect(await listDrafts()).toMatchObject({ status: 'success', drafts: [] });
      expect(await listHistory()).toMatchObject({ status: 'success', events: [] });
      expect(await listPendingMediaRemovals()).toMatchObject({
        status: 'success',
        removals: [{ eventId: f.id, revision: 2, action: 'delete_draft' }],
      });
      expect(
        (
          await rpc('complete_event_redaction', {
            ...f.admin,
            event_id: f.id,
            operation_key: body.operationKey,
          })
        ).error?.message
      ).toBe('state_conflict');
      vi.mocked(createPrivilegedClient).mockReturnValue(
        local.service as ReturnType<typeof createPrivilegedClient>
      );
      const pendingRead = await listPendingMediaRemovals();
      if (pendingRead.status !== 'success') throw new Error('Pending read failed');
      const retryBody = {
        operationKey: randomUUID(),
        expectedRevision: pendingRead.removals[0].revision,
      };
      expect(
        (
          await deleteDraft(
            request({ ...retryBody, replacementTitle: 'Must not change identity' }),
            context(f.id)
          )
        ).status
      ).toBe(400);
      const retried = await deleteDraft(request(retryBody), context(f.id));
      expect(await retried.json()).toMatchObject({
        eventId: f.id,
        mediaRemovalState: 'complete',
        revision: 3,
      });
      expect(await (await deleteDraft(request(body), context(f.id))).json()).toMatchObject({
        mediaRemovalState: 'complete',
        revision: 3,
      });
      expect(
        (await local.service.storage.from('event_media').download(paths[0])).error
      ).toBeTruthy();
      expect((await local.service.storage.from('event_media').download(paths[2])).error).toBeNull();
      expect(
        sql(`select operation_kind from public.activity_events where event_id='${f.id}'`)
      ).toHaveLength(2);
      expect(await listPendingMediaRemovals()).toMatchObject({ status: 'success', removals: [] });
    } finally {
      await local.service.storage.emptyBucket('event_media');
      await local.service.storage.deleteBucket('event_media');
    }
  });
  it('redacts through the protected route with no bucket and rejects extra fields, cross-origin and revoked sessions', async () => {
    const f = await fixture();
    sql(`update public.events set state='Completed',revision=2 where id='${f.id}'`);
    const body = {
      operationKey: randomUUID(),
      expectedRevision: 2,
      replacementTitle: 'Anonymous event',
    };
    expect(
      (await redactClient(request({ ...body, photo: 'forbidden' }), context(f.id))).status
    ).toBe(400);
    expect((await redactClient(request(body, 'https://other.test'), context(f.id))).status).toBe(
      403
    );
    const response = await redactClient(request(body), context(f.id));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ mediaRemovalState: 'complete' });
    expect(await listHistory()).toMatchObject({
      status: 'success',
      events: [
        { id: f.id, title: 'Anonymous event', client_name: null, media_removal_state: 'complete' },
      ],
    });
    await f.signed.client.auth.signOut({ scope: 'local' });
    expect([401, 403]).toContain((await redactClient(request(body), context(f.id))).status);
  });
  it('enumerates more than one page of folders before deletion and keeps completed retries complete during a Storage outage', async () => {
    const f = await fixture();
    expect(
      (await local.service.storage.createBucket('event_media', { public: false })).error
    ).toBeNull();
    try {
      const paths = Array.from({ length: 101 }, () => `${f.id}/${randomUUID()}/${randomUUID()}`);
      const uploads = await Promise.all(
        paths.map((path) =>
          local.service.storage
            .from('event_media')
            .upload(path, 'Brand fixture', { contentType: 'text/plain' })
        )
      );
      uploads.forEach((upload) => expect(upload.error).toBeNull());
      const body = { operationKey: randomUUID(), expectedRevision: 1 };
      expect(await (await deleteDraft(request(body), context(f.id))).json()).toMatchObject({
        mediaRemovalState: 'complete',
      });
      const status = localSupabaseStatus();
      sql(`update public.events set revision=revision+1 where id='${f.id}'`);
      const offline = createSupabaseClient(status.API_URL, status.SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input, init) =>
            String(input).includes('/storage/')
              ? new Response('{}', { status: 503 })
              : fetch(input, init),
        },
      });
      vi.mocked(createPrivilegedClient).mockReturnValue(
        offline as ReturnType<typeof createPrivilegedClient>
      );
      expect(await (await deleteDraft(request(body), context(f.id))).json()).toMatchObject({
        mediaRemovalState: 'complete',
        revision: 3,
      });
    } finally {
      await local.service.storage.emptyBucket('event_media');
      await local.service.storage.deleteBucket('event_media');
    }
  }, 60000);
  it('resumes pending Client Redaction with the DAL revision and a fresh key without replacing the erased identity', async () => {
    const f = await fixture();
    sql(`update public.events set state='Completed',revision=revision+1 where id='${f.id}'`);
    expect(
      (
        await rpc('begin_event_redaction', {
          ...begin(f, 'redact_client', 2),
          replacement_title: 'Anonymous booking',
        })
      ).error
    ).toBeNull();
    const pending = await listPendingMediaRemovals();
    if (pending.status !== 'success') throw new Error('Pending work unavailable');
    const row = pending.removals.find((value) => value.eventId === f.id)!;
    const changed = await redactClient(
      request({
        operationKey: randomUUID(),
        expectedRevision: row.revision,
        replacementTitle: 'Changed again',
      }),
      context(f.id)
    );
    expect(changed.status).toBe(409);
    const retry = { operationKey: randomUUID(), expectedRevision: row.revision };
    expect(await (await redactClient(request(retry), context(f.id))).json()).toMatchObject({
      mediaRemovalState: 'complete',
    });
    expect(
      sql(`select title,client_name,media_removal_state from public.events where id='${f.id}'`)[0]
    ).toMatchObject({
      title: 'Anonymous booking',
      client_name: null,
      media_removal_state: 'complete',
    });
    expect(
      sql(`select operation_kind from public.activity_events where event_id='${f.id}'`)
    ).toHaveLength(2);
  });
});
