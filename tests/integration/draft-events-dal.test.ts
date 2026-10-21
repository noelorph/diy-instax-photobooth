// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createDraft, getDraft, listDrafts, updateDraft } from '@/lib/events/drafts';
import { createDraftAction, updateDraftAction } from '@/features/admin/events/actions';
import { localSupabase, cleanupEvents } from '../fixtures/local-supabase';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
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
  originalPrintAllowance: 0,
};
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...booking, ...overrides }))
    data.set(key, String(value));
  return data;
}

describe('protected Draft DAL with local Auth and Data API', () => {
  let local: ReturnType<typeof localSupabase>;
  const eventIds: string[] = [];
  beforeAll(() => {
    local = localSupabase();
  });
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
  async function create(input: unknown = booking) {
    const result = await createDraft(input);
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
        originalPrintAllowance: 0,
      },
    });
    expect(await listDrafts()).toMatchObject({
      status: 'success',
      drafts: expect.arrayContaining([draft]),
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
    for (const result of [await createDraft(input), await updateDraft(draft.id, 1, input)]) {
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
      originalPrintAllowance: 17,
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
        originalPrintAllowance: 17,
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
    ['originalPrintAllowance', -1],
    ['originalPrintAllowance', 1.5],
    ['filmPackageCount', 2147483648],
    ['originalPrintAllowance', 2147483648],
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
    for (const result of [await createDraft(invalid), await updateDraft(draft.id, 1, invalid)]) {
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
        await createDraft({
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
        () => createDraft(booking),
        () => updateDraft(draft.id, 1, booking),
        () => createDraftAction({ status: 'idle' }, form()),
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
        if (String(input).includes('/rest/v1/events')) {
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
        () => createDraft(booking),
        () => updateDraft(draft.id, 1, { ...booking, title: 'Unpersisted' }),
        () => createDraftAction({ status: 'idle' }, form()),
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
    const created = await createDraftAction({ status: 'idle' }, form());
    expect(created).toMatchObject({ status: 'success', revision: 1, confirmation: 'Draft saved.' });
    if (created.status !== 'success') throw new Error('Action save failed');
    eventIds.push(created.id);
    const changed = await updateDraftAction(
      created.id,
      created.revision,
      { status: 'idle' },
      form({ title: 'Action edit', originalPrintAllowance: '25' })
    );
    expect(changed).toMatchObject({ status: 'success', revision: 2 });
    expect(await getDraft(created.id)).toMatchObject({
      status: 'success',
      draft: { title: 'Action edit', originalPrintAllowance: 25 },
    });
    expect(await updateDraftAction(created.id, 1, { status: 'idle' }, form())).toMatchObject({
      status: 'conflict',
    });
  });

  it.each(['filmPackageCount', 'originalPrintAllowance'])(
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
          await createDraftAction({ status: 'idle' }, data),
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
      await createDraftAction({ status: 'idle' }, data),
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
