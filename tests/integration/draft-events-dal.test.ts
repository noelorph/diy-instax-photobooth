// @vitest-environment node
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createClient } from '@/lib/supabase/server';
import { createDraft, getDraft, listDrafts, updateDraft } from '@/lib/events/drafts';
import { listLiveEvents } from '@/features/admin/operations/read';
import { parseDraftEventInput } from '@/features/admin/events/draft-event.schema';
import { createDraftAction, updateDraftAction } from '@/features/admin/events/actions';
import {
  localSupabase,
  cleanupEvents,
  localOwnerSql,
  setPackageCreationDefault,
  ownerUpdate,
  ownerInsert,
} from '../fixtures/local-supabase';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/operations/privileged-client', () => ({
  createPrivilegedClient: () => localSupabase().service,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const booking = {
  title: 'Evening celebration',
  clientName: 'Alex Client',
  clientEmail: 'alex@example.test',
  clientPhone: '+639171234567',
  venueAddress: 'Manila venue',
  timeZone: 'Asia/Manila',
  startsAtLocal: '2026-12-01T18:00',
  endsAtLocal: '2026-12-01T20:00',
  filmPackageCount: 0,
};
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...booking, ...overrides }))
    data.set(key, String(value));
  data.set('operationId', randomUUID());
  return data;
}

describe('protected Draft DAL with local Auth and Data API', () => {
  let local: ReturnType<typeof localSupabase>;
  const eventIds: string[] = [];
  let restoreDefault: () => void;
  beforeAll(() => {
    local = localSupabase();
    restoreDefault = setPackageCreationDefault();
  });
  afterAll(() => restoreDefault?.());
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    if (eventIds.length) {
      const { error } = await cleanupEvents(eventIds.splice(0));
      if (error) throw error;
    }
    await local.cleanup();
  });
  async function admin() {
    const user = await local.provisionUser();
    expect((await local.allowlist(user.id)).error).toBeNull();
    const device = await local.signIn(user);
    vi.mocked(createClient).mockResolvedValue(device.client);
    return { user, ...device };
  }
  async function trackedCreate(operationId: string, input: unknown) {
    const result = await createDraft(operationId, input);
    if (result.status === 'success' && !eventIds.includes(result.draft.id))
      eventIds.push(result.draft.id);
    return result;
  }
  async function trackedCreateAction(...args: Parameters<typeof createDraftAction>) {
    const result = await createDraftAction(...args);
    if (result.status === 'success' && !eventIds.includes(result.id)) eventIds.push(result.id);
    return result;
  }
  async function create(input: unknown = booking) {
    const result = await trackedCreate(randomUUID(), input);
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Draft creation failed');
    eventIds.push(result.draft.id);
    return result.draft;
  }

  it('creates a Draft and lists and reads the persisted booking from a fresh session', async () => {
    const owner = await admin();
    const draft = await create();
    const fresh = await local.signIn(owner.user);
    vi.mocked(createClient).mockResolvedValue(fresh.client);
    expect(await getDraft(draft.id)).toMatchObject({
      status: 'success',
      draft: {
        id: draft.id,
        state: 'Draft',
        revision: 1,
        title: 'Evening celebration',
        clientName: 'Alex Client',
        clientEmail: 'alex@example.test',
        clientPhone: '+639171234567',
        venueAddress: 'Manila venue',
        timeZone: 'Asia/Manila',
        startsAtUtc: '2026-12-01T10:00:00+00:00',
        endsAtUtc: '2026-12-01T12:00:00+00:00',
        filmPackageCount: 0,
      },
    });
    expect(await listDrafts()).toMatchObject({
      status: 'success',
      drafts: expect.arrayContaining([draft]),
    });
  });

  it('recovers a committed creation after losing its response with one receipt and metadata-only audit', async () => {
    const owner = await admin();
    const operationId = randomUUID();
    const originalFetch = globalThis.fetch;
    let eventId: string | undefined;
    const dropped = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = await originalFetch(input, init);
      if (String(input).includes('/rpc/create_event_draft')) {
        const committed = await response.clone().json();
        eventId = committed.receipt.result.eventId;
        eventIds.push(eventId!);
        throw new Error('committed reply lost');
      }
      return response;
    });
    expect(await trackedCreate(operationId, { ...booking, filmPackageCount: 3 })).toMatchObject({
      status: 'unavailable',
    });
    dropped.mockRestore();
    const recovered = await trackedCreate(operationId, { ...booking, filmPackageCount: 3 });
    expect(recovered).toMatchObject({
      status: 'success',
      draft: { id: eventId, filmPackageCount: 3 },
    });
    expect(
      localOwnerSql(`select count(*)::int as count from public.events where id='${eventId}'`)[0]
        .count
    ).toBe(1);
    expect(
      localOwnerSql(
        `select original_print_allowance, film_package_count*10 as total from public.events where id='${eventId}'`
      )[0]
    ).toEqual({ original_print_allowance: null, total: 30 });
    const receipts = localOwnerSql(
      `select result,input_digest from public.operation_receipts where event_id='${eventId}' and operation_kind='create_draft'`
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toEqual({
      result: { eventId },
      input_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(
      localOwnerSql(
        `select operation_kind,actor_scope from public.activity_events where event_id='${eventId}'`
      )
    ).toEqual([{ operation_kind: 'create_draft', actor_scope: `admin:${owner.user.id}` }]);
  });

  it('serializes concurrent same-key calls and refuses changed payloads without changing the Draft', async () => {
    await admin();
    const operationId = randomUUID();
    const results = await Promise.all([
      trackedCreate(operationId, booking),
      trackedCreate(operationId, booking),
    ]);
    for (const result of results) expect(result.status).toBe('success');
    if (results[0].status !== 'success' || results[1].status !== 'success')
      throw new Error('creation failed');
    const draft = results[0].draft;
    eventIds.push(draft.id);
    expect(results[1].draft.id).toBe(draft.id);
    expect(
      await trackedCreate(operationId, { ...booking, title: 'Changed request' })
    ).toMatchObject({
      status: 'conflict',
    });
    expect(await getDraft(draft.id)).toEqual({ status: 'success', draft });
    expect(
      localOwnerSql(
        `select count(*)::int as count from public.activity_events where event_id='${draft.id}' and operation_kind='create_draft'`
      )[0].count
    ).toBe(1);
  });

  it('replays the original identity without reverting an edit or recreating a deleted Draft', async () => {
    const owner = await admin();
    const operationId = randomUUID();
    const first = await trackedCreate(operationId, booking);
    if (first.status !== 'success') throw new Error('creation failed');
    eventIds.push(first.draft.id);
    expect((await updateDraft(first.draft.id, 1, { ...booking, title: 'Later edit' })).status).toBe(
      'success'
    );
    expect(await trackedCreate(operationId, booking)).toMatchObject({
      status: 'success',
      draft: { id: first.draft.id, title: 'Later edit', revision: 2 },
    });
    const deleted = await local.service.rpc('package_admin_operation', {
      p_admin_user_id: owner.user.id,
      p_admin_session_id: sessionId(owner.session),
      p_operation: 'begin_delete_draft',
      p_operation_id: randomUUID(),
      p_payload: { eventId: first.draft.id, expectedRevision: 2 },
    });
    expect(deleted.error).toBeNull();
    expect(await trackedCreate(operationId, booking)).toEqual({ status: 'not_found' });
    expect(
      localOwnerSql(`select revision,title from public.events where id='${first.draft.id}'`)[0]
    ).toEqual({ revision: 3, title: null });
    expect(
      localOwnerSql(
        `select operation_kind from public.activity_events where event_id='${first.draft.id}' and operation_kind in ('create_draft','update_draft')`
      )
        .map((row) => row.operation_kind)
        .sort()
    ).toEqual(['create_draft', 'update_draft']);
  });

  it.each(['', 'invalid', null, undefined])(
    'rejects missing or invalid creation key %s before inserting',
    async (operationId) => {
      await admin();
      const before = await listDrafts();
      expect(await trackedCreate(operationId as string, booking)).toMatchObject({
        status: 'conflict',
      });
      const data = form();
      if (operationId == null) data.delete('operationId');
      else data.set('operationId', operationId);
      expect(await trackedCreateAction({ status: 'idle' }, data)).toMatchObject({
        status: 'conflict',
      });
      expect(await listDrafts()).toEqual(before);
    }
  );

  it('rejects duplicated and file operation IDs before creating a Draft', async () => {
    await admin();
    const duplicate = form();
    duplicate.append('operationId', randomUUID());
    const file = form();
    file.set('operationId', new File(['key'], 'key.txt'));
    for (const data of [duplicate, file, {} as FormData])
      expect(await trackedCreateAction({ status: 'idle' }, data)).toMatchObject({
        status: 'conflict',
      });
    expect(await listDrafts()).toEqual({ status: 'success', drafts: [] });
  });

  it('denies receipt replay after Admin authority is revoked', async () => {
    const owner = await admin();
    const operationId = randomUUID();
    const first = await trackedCreate(operationId, booking);
    if (first.status !== 'success') throw new Error('creation failed');
    eventIds.push(first.draft.id);
    expect(
      (await local.service.auth.admin.signOut(owner.session.access_token, 'global')).error
    ).toBeNull();
    await expect(trackedCreate(operationId, booking)).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in'),
    });
  });

  it('restricts both creation functions and keeps their search paths fixed', () => {
    for (const schema of ['public', 'private']) {
      const signature = `${schema}.create_event_draft(uuid,uuid,uuid,jsonb)`;
      expect(
        localOwnerSql(
          `select has_function_privilege('anon','${signature}','EXECUTE') as anon,has_function_privilege('authenticated','${signature}','EXECUTE') as authenticated,has_function_privilege('service_role','${signature}','EXECUTE') as service`
        )[0]
      ).toEqual({ anon: false, authenticated: false, service: true });
      expect(
        localOwnerSql(`select proconfig from pg_proc where oid='${signature}'::regprocedure`)[0]
          .proconfig
      ).toContain('search_path=""');
    }
  });

  function creationPayload() {
    const parsed = parseDraftEventInput(booking);
    return {
      title: parsed.title,
      client_name: parsed.clientName,
      client_email: parsed.clientEmail,
      client_phone: parsed.clientPhone,
      venue_address: parsed.venueAddress,
      time_zone: parsed.timeZone,
      starts_at: parsed.startsAtUtc,
      ends_at: parsed.endsAtUtc,
      film_package_count: parsed.filmPackageCount,
    };
  }
  function sessionId(session: { access_token: string }) {
    return JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString())
      .session_id as string;
  }
  async function creationRpc(
    owner: Awaited<ReturnType<typeof admin>>,
    operationId: string | null,
    payload: unknown
  ) {
    const result = await local.service.rpc(
      'create_event_draft' as never,
      {
        p_admin_user_id: owner.user.id,
        p_admin_session_id: sessionId(owner.session),
        p_operation_id: operationId,
        p_payload: payload,
      } as never
    );
    const eventId = (result.data as { receipt?: { result?: { eventId?: string } } } | null)?.receipt
      ?.result?.eventId;
    if (eventId && !eventIds.includes(eventId)) eventIds.push(eventId);
    return result;
  }

  it('validates the trusted creation boundary without inserting malformed payloads', async () => {
    const owner = await admin();
    const valid = creationPayload();
    for (const invalid of [
      null,
      [],
      {},
      { ...valid, original_print_allowance: 20 },
      { ...valid, film_package_count: 214_748_365 },
      { ...valid, film_package_count: 0.5 },
      { ...valid, title: ' ' },
      { ...valid, client_email: 'invalid' },
      { ...valid, starts_at: 'infinity' },
      { ...valid, ends_at: valid.starts_at },
    ]) {
      const result = await creationRpc(owner, randomUUID(), invalid);
      expect(result.error).not.toBeNull();
    }
    expect((await creationRpc(owner, null, valid)).error?.message).toBe('invalid_input');
    expect(await listDrafts()).toEqual({ status: 'success', drafts: [] });
  });

  it('refuses creation while the configured local default is still version 1', async () => {
    const owner = await admin();
    localOwnerSql('alter table public.events alter column accounting_version set default 1');
    try {
      expect((await creationRpc(owner, randomUUID(), creationPayload())).error?.message).toBe(
        'operation_unavailable'
      );
      expect(await listDrafts()).toEqual({ status: 'success', drafts: [] });
    } finally {
      localOwnerSql('alter table public.events alter column accounting_version set default 2');
    }
  });

  async function withCreationLock(
    table: 'guard' | 'event',
    eventId: string | undefined,
    work: () => Promise<unknown>,
    revoke: () => void
  ) {
    const child = spawn('docker', [
      'exec',
      '-i',
      'supabase_db_diy-instax-package-contracts',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
    ]);
    const done = once(child, 'exit');
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const lock =
      table === 'guard'
        ? 'select id from private.booth_contract_guard where id for update'
        : `select id from public.events where id='${eventId}' for update`;
    child.stdin.write(`begin;\n${lock};\nselect 'HOLDER:'||pg_backend_pid();\n`);
    let pending: Promise<unknown> | undefined;
    try {
      const deadline = Date.now() + 10_000;
      while (!/HOLDER:\d+\r?\n/.test(output)) {
        if (child.exitCode !== null || Date.now() > deadline)
          throw new Error('Creation lock not acquired');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const holder = Number(output.match(/HOLDER:(\d+)/)?.[1]);
      pending = work();
      while (
        !localOwnerSql(
          `select exists(select 1 from pg_stat_activity where ${holder}=any(pg_blocking_pids(pid))) as waiting`
        )[0].waiting
      ) {
        if (Date.now() > deadline) throw new Error('Creation never waited on lock');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      revoke();
    } finally {
      child.stdin.end('rollback;\n\\q\n');
      await done;
      if (pending) await pending;
    }
    return pending!;
  }

  it.each(['guard', 'event'] as const)(
    'rechecks live Admin authority after the %s lock, including receipt replay',
    async (table) => {
      const owner = await admin();
      const operationId = randomUUID();
      let eventId: string | undefined;
      if (table === 'event') {
        const saved = await trackedCreate(operationId, booking);
        if (saved.status !== 'success') throw new Error('creation failed');
        eventId = saved.draft.id;
        eventIds.push(eventId);
      }
      const result = (await withCreationLock(
        table,
        eventId,
        () => creationRpc(owner, operationId, creationPayload()),
        () => localOwnerSql(`delete from auth.sessions where id='${sessionId(owner.session)}'`)
      )) as { error: { message: string } | null };
      expect(result.error?.message).toBe('access_required');
      expect(
        localOwnerSql(
          `select count(*)::int as count from public.operation_receipts where actor_scope='admin:${owner.user.id}' and operation_key='${operationId}'`
        )[0].count
      ).toBe(table === 'event' ? 1 : 0);
    },
    30_000
  );

  it('does not read or edit a disposable version-1 Draft as a package booking', async () => {
    await admin();
    const id = randomUUID();
    eventIds.push(id);
    ownerInsert('events', {
      id,
      ...creationPayload(),
      accounting_version: 1,
      original_print_allowance: 17,
    });
    expect(await getDraft(id)).toEqual({ status: 'not_found' });
    expect(await listDrafts()).toEqual({ status: 'success', drafts: [] });
    expect(await updateDraft(id, 1, { ...booking, title: 'Implicit legacy edit' })).toEqual({
      status: 'not_found',
    });
    expect(
      localOwnerSql(
        `select title,revision,original_print_allowance from public.events where id='${id}'`
      )[0]
    ).toEqual({ title: 'Evening celebration', revision: 1, original_print_allowance: 17 });
  });

  it('lists Live booking packages alongside overdue Draft discovery without reading an allowance', async () => {
    const owner = await admin();
    const draft = await create({
      ...booking,
      startsAtLocal: '2025-01-01T18:00',
      endsAtLocal: '2025-01-01T20:00',
      filmPackageCount: 2,
    });
    const live = await create({ ...booking, title: 'Live discovery', filmPackageCount: 3 });
    ownerUpdate('events', live.id, { state: 'Live', revision: 2 });
    ownerInsert('additional_film_package_entries', {
      event_id: live.id,
      packages: 2,
      client_request_note: 'Client requested two more packages',
      actor_id: owner.user.id,
      operation_key: randomUUID(),
    });
    expect(await listDrafts()).toMatchObject({
      status: 'success',
      drafts: expect.arrayContaining([draft]),
    });
    expect(await listLiveEvents()).toMatchObject({
      status: 'success',
      events: [
        {
          id: live.id,
          title: 'Live discovery',
          state: 'Live',
          venueAddress: 'Manila venue',
          filmPackageCount: 5,
          timeZone: 'Asia/Manila',
          startsAtUtc: '2026-12-01T10:00:00+00:00',
        },
      ],
    });
  });

  it('persists lowercase IANA zones using the parser’s normalized name', async () => {
    await admin();
    const draft = await create({ ...booking, timeZone: 'asia/manila' });
    expect(await getDraft(draft.id)).toMatchObject({
      status: 'success',
      draft: { timeZone: 'Asia/Manila', startsAtUtc: '2026-12-01T10:00:00+00:00' },
    });
    expect(
      await updateDraft(draft.id, 1, { ...booking, timeZone: 'america/new_york' })
    ).toMatchObject({ status: 'success', draft: { timeZone: 'America/New_York' } });
  });

  it('reports a database-rejected venue zone on its field without a partial save', async () => {
    await admin();
    const draft = await create();
    const before = await listDrafts();
    // ICU recognizes this legacy name, but the local PostgreSQL tzdata does not.
    const input = { ...booking, timeZone: 'SystemV/EST5' };
    for (const result of [
      await trackedCreate(randomUUID(), input),
      await updateDraft(draft.id, 1, input),
    ]) {
      expect(result).toMatchObject({
        status: 'invalid',
        fieldErrors: { timeZone: expect.stringMatching(/venue time zone/i) },
      });
    }
    expect(await listDrafts()).toEqual(before);
    expect(await getDraft(draft.id)).toEqual({ status: 'success', draft });
  });

  it('updates every booking field while preserving a second Event’s independent Client snapshot', async () => {
    const owner = await admin();
    const first = await create();
    const second = await create();
    const result = await updateDraft(first.id, first.revision, {
      title: 'Updated celebration',
      clientName: 'Robin Client',
      clientEmail: 'robin@example.test',
      clientPhone: '+12025550123',
      venueAddress: 'New York venue',
      timeZone: 'America/New_York',
      startsAtLocal: '2026-12-02T12:00',
      endsAtLocal: '2026-12-02T15:00',
      filmPackageCount: 3,
    });
    expect(result.status).toBe('success');
    vi.mocked(createClient).mockResolvedValue((await local.signIn(owner.user)).client);
    expect(await getDraft(first.id)).toMatchObject({
      status: 'success',
      draft: {
        title: 'Updated celebration',
        clientName: 'Robin Client',
        clientEmail: 'robin@example.test',
        clientPhone: '+12025550123',
        venueAddress: 'New York venue',
        timeZone: 'America/New_York',
        startsAtUtc: '2026-12-02T17:00:00+00:00',
        endsAtUtc: '2026-12-02T20:00:00+00:00',
        filmPackageCount: 3,
        revision: 2,
        state: 'Draft',
      },
    });
    expect(await getDraft(second.id)).toEqual({ status: 'success', draft: second });
  });

  it.each([
    ['clientEmail', 'invalid'],
    ['title', ' '],
    ['clientName', ' '],
    ['clientPhone', ' '],
    ['venueAddress', ' '],
    ['filmPackageCount', -1],
    ['filmPackageCount', 1.5],
    ['filmPackageCount', 2147483648],
    ['timeZone', 'Invalid/Zone'],
    ['endsAtLocal', '2026-12-01T17:00'],
    ['state', 'Live'],
    ['state', 'Completed'],
    ['state', 'Cancelled'],
  ])('returns a field error for invalid %s (%s) without a partial write', async (field, value) => {
    await admin();
    const draft = await create();
    const before = await listDrafts();
    const invalid = { ...booking, [field]: value };
    for (const result of [
      await trackedCreate(randomUUID(), invalid),
      await updateDraft(draft.id, 1, invalid),
    ]) {
      if (result.status === 'success' && result.draft.id !== draft.id)
        eventIds.push(result.draft.id);
      expect(result).toMatchObject({
        status: 'invalid',
        fieldErrors: { [field]: expect.any(String) },
      });
    }
    expect(await listDrafts()).toEqual(before);
    expect(await getDraft(draft.id)).toEqual({ status: 'success', draft });
  });

  it.each(['2026-03-08T02:30', '2026-11-01T01:30'])(
    'rejects DST gap or overlap %s without saving',
    async (startsAtLocal) => {
      await admin();
      const before = await listDrafts();
      expect(
        await trackedCreate(randomUUID(), {
          ...booking,
          timeZone: 'America/New_York',
          startsAtLocal,
          endsAtLocal: '2026-12-02T18:00',
        })
      ).toMatchObject({
        status: 'invalid',
        fieldErrors: { startsAtLocal: expect.stringMatching(/ambiguous/) },
      });
      expect(await listDrafts()).toEqual(before);
    }
  );

  it('returns no Client data for missing or malformed IDs and refuses malformed revisions', async () => {
    await admin();
    const draft = await create();
    for (const id of [randomUUID(), 'invalid-id', '']) {
      expect(await getDraft(id)).toEqual({ status: 'not_found' });
      expect(await updateDraft(id, 1, booking)).toEqual({ status: 'not_found' });
    }
    for (const revision of [0, -1, 1.5, NaN, Infinity, 2147483648, '1' as unknown as number]) {
      expect(await updateDraft(draft.id, revision, booking)).toMatchObject({
        status: 'invalid',
        fieldErrors: { expectedRevision: expect.any(String) },
      });
    }
    expect(await getDraft(draft.id)).toEqual({ status: 'success', draft });
  });

  it('returns a reloadable conflict when a second device saves a stale revision', async () => {
    const owner = await admin();
    const first = await create();
    const second = await local.signIn(owner.user);
    expect(
      (await updateDraft(first.id, 1, { ...booking, title: 'First device saved' })).status
    ).toBe('success');
    vi.mocked(createClient).mockResolvedValue(second.client);
    expect(await updateDraft(first.id, 1, { ...booking, title: 'Stale overwrite' })).toMatchObject({
      status: 'conflict',
      error: expect.stringMatching(/reload/i),
    });
    expect(await getDraft(first.id)).toMatchObject({
      status: 'success',
      draft: { title: 'First device saved', revision: 2 },
    });
  });

  it.each(['signed-out', 'non-Admin', 'revoked-session', 'removed-Admin'] as const)(
    'denies direct %s calls before returning booking information',
    async (identity) => {
      const owner = await admin();
      const draft = await create();
      let denied = local.client();
      if (identity === 'non-Admin')
        denied = (await local.signIn(await local.provisionUser())).client;
      if (identity === 'revoked-session') {
        expect(
          (await local.service.auth.admin.signOut(owner.session.access_token, 'global')).error
        ).toBeNull();
        // Retain the device's unexpired JWT after revocation so the real RLS
        // session check, rather than an empty SDK session, has to deny it.
        expect((await owner.client.auth.getClaims()).data?.claims.sub).toBe(owner.user.id);
        denied = owner.client;
      }
      if (identity === 'removed-Admin') {
        expect(
          (await local.service.from('admin_profiles').delete().eq('id', owner.user.id)).error
        ).toBeNull();
        denied = owner.client;
      }
      vi.mocked(createClient).mockResolvedValue(denied);
      for (const request of [
        () => listDrafts(),
        () => getDraft(draft.id),
        () => getDraft('malformed'),
        () => trackedCreate(randomUUID(), booking),
        () => updateDraft(draft.id, 1, booking),
        () => trackedCreateAction({ status: 'idle' }, form()),
        () => updateDraftAction(draft.id, 1, { status: 'idle' }, form()),
      ])
        await expect(request()).rejects.toMatchObject({
          digest: expect.stringContaining('/sign-in'),
        });
    }
  );

  it.each(['http', 'network'] as const)(
    'returns a retry result for %s failures without exposing diagnostics or claiming success',
    async (failure) => {
      await admin();
      const draft = await create();
      const originalFetch = globalThis.fetch;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        if (
          String(input).includes('/rest/v1/events') ||
          String(input).includes('/rpc/create_event_draft')
        ) {
          if (failure === 'network')
            return Promise.reject(new DOMException('private diagnostic', 'AbortError'));
          return Promise.resolve(
            new Response(JSON.stringify({ message: 'private diagnostic' }), {
              status: 503,
              headers: { 'Retry-After': '0' },
            })
          );
        }
        return originalFetch(input, init);
      });
      for (const request of [
        () => listDrafts(),
        () => getDraft(draft.id),
        () => trackedCreate(randomUUID(), booking),
        () => updateDraft(draft.id, 1, { ...booking, title: 'Unpersisted' }),
        () => trackedCreateAction({ status: 'idle' }, form()),
        () => updateDraftAction(draft.id, 1, { status: 'idle' }, form()),
      ]) {
        const result = await request();
        expect(result).toMatchObject({
          status: 'unavailable',
          error: expect.stringMatching(/try again/i),
        });
        expect(JSON.stringify(result)).not.toContain('private diagnostic');
      }
      fetchSpy.mockRestore();
      expect(await getDraft(draft.id)).toEqual({ status: 'success', draft });
    }
  );

  it('persists form saves through protected create and update actions', async () => {
    await admin();
    const created = await trackedCreateAction({ status: 'idle' }, form());
    expect(created).toMatchObject({ status: 'success', revision: 1, confirmation: 'Draft saved.' });
    if (created.status !== 'success') throw new Error('Action save failed');
    eventIds.push(created.id);
    const changed = await updateDraftAction(
      created.id,
      created.revision,
      { status: 'idle' },
      form({ title: 'Action edit', filmPackageCount: '3' })
    );
    expect(changed).toMatchObject({ status: 'success', revision: 2 });
    expect(await getDraft(created.id)).toMatchObject({
      status: 'success',
      draft: { title: 'Action edit', filmPackageCount: 3 },
    });
    expect(await updateDraftAction(created.id, 1, { status: 'idle' }, form())).toMatchObject({
      status: 'conflict',
    });
  });

  it.each(['filmPackageCount'])(
    'rejects missing, blank, or file %s form values instead of converting them to zero',
    async (field) => {
      await admin();
      const draft = await create();
      const before = await listDrafts();
      for (const value of [null, '', '  ', new File(['0'], 'count.txt')]) {
        const data = form();
        if (value === null) data.delete(field);
        else data.set(field, value);
        for (const result of [
          await trackedCreateAction({ status: 'idle' }, data),
          await updateDraftAction(draft.id, 1, { status: 'idle' }, data),
        ]) {
          if (result.status === 'success' && result.id !== draft.id) eventIds.push(result.id);
          expect(result).toMatchObject({
            status: 'invalid',
            fieldErrors: { [field]: expect.any(String) },
          });
        }
      }
      expect(await listDrafts()).toEqual(before);
    }
  );

  it('rejects submitted non-Draft states even among duplicate form fields', async () => {
    await admin();
    const draft = await create();
    const before = await listDrafts();
    const data = form({ state: 'Live' });
    data.append('state', 'Draft');
    for (const result of [
      await trackedCreateAction({ status: 'idle' }, data),
      await updateDraftAction(draft.id, 1, { status: 'idle' }, data),
    ]) {
      if (result.status === 'success' && result.id !== draft.id) eventIds.push(result.id);
      expect(result).toMatchObject({
        status: 'invalid',
        fieldErrors: { state: expect.any(String) },
      });
    }
    expect(await listDrafts()).toEqual(before);
  });
});
