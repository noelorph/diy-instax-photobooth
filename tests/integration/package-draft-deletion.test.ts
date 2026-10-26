// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it, vi } from 'vitest';
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));
import { removeEventMedia } from '@/lib/operations/draft-media-cleanup';
import { cleanupOperationId } from '@/lib/operations/package-draft-deletion';
import type { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { createPackageFixture } from '../fixtures/package-contract';
import { localOwnerSql, localSupabaseStatus } from '../fixtures/local-supabase';
import { sessionCookies } from '../fixtures/admin-route-server';
import { POST as deleteDraft } from '@/app/api/admin/events/[eventId]/delete-draft/route';
import { listPendingMediaRemovals } from '@/lib/events/history';

beforeAll(() => {
  const status = localSupabaseStatus();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', status.API_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', status.ANON_KEY);
  vi.stubEnv('SUPABASE_SECRET_KEY', status.SERVICE_ROLE_KEY);
});

it('uses a stable distinct operation ID for completing an uncertain Draft cleanup', () => {
  const begin = '11111111-1111-4111-8111-111111111111';
  expect(cleanupOperationId(begin)).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
  );
  expect(cleanupOperationId(begin)).not.toBe(begin);
  expect(cleanupOperationId(begin)).toBe(cleanupOperationId(begin));
});
it('recovers the original deletion request for pending cleanup after navigation', async () => {
  const fixture = await createPackageFixture();
  try {
    const cookie = sessionCookies((await fixture.adminClient.auth.getSession()).data.session!);
    for (const pair of cookie.split('; ')) {
      const [name, value] = pair.split('=');
      jar.set(name, value);
    }
    const key = randomUUID();
    const begun = await fixture.admin('begin_delete_draft', { expectedRevision: 1 }, key);
    expect(begun.error).toBeNull();
    const pending = await listPendingMediaRemovals();
    expect(pending).toEqual({
      status: 'success',
      removals: [{ eventId: fixture.eventId, revision: 1, operationId: key }],
    });
  } finally {
    jar.clear();
    await fixture.dispose();
  }
}, 30_000);

it('retries a partial Storage failure and removes every page before reporting success', async () => {
  const remaining = new Set(
    Array.from({ length: 205 }, (_, i) => `event/${String(i).padStart(3, '0')}`)
  );
  let failOnce = true;
  const storage = {
    list: async (_prefix: string, { limit, offset = 0 }: { limit: number; offset?: number }) => ({
      data: [...remaining]
        .sort()
        .slice(offset, offset + limit)
        .map((name) => ({ id: name, name: name.slice(6) })),
      error: null,
    }),
    remove: async (paths: string[]) => {
      if (failOnce && paths[0] === 'event/100') {
        failOnce = false;
        return { error: new Error('Storage unavailable') };
      }
      for (const path of paths) remaining.delete(path);
      return { error: null };
    },
  };
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'events'
            ? {
                single: async () => ({
                  data: { state: 'Draft', deleted_at: '2026-10-26' },
                  error: null,
                }),
              }
            : Promise.resolve({ data: [], error: null }),
      }),
    }),
    storage: {
      getBucket: async () => ({ error: null }),
      from: () => storage,
    },
  } as unknown as ReturnType<typeof createPrivilegedClient>;
  await expect(removeEventMedia(client, 'event')).rejects.toThrow('Storage unavailable');
  expect(remaining.size).toBe(105);
  await removeEventMedia(client, 'event');
  expect(remaining.size).toBe(0);
});

it('completes Draft deletion once and preserves only opaque audit after replay', async () => {
  const fixture = await createPackageFixture();
  try {
    const session = (await fixture.adminClient.auth.getSession()).data.session!;
    const cookie = sessionCookies(session);
    for (const pair of cookie.split('; ')) {
      const [name, value] = pair.split('=');
      jar.set(name, value);
    }
    const operationId = randomUUID();
    const body = { operationId, expectedRevision: 1 };
    const call = (payload: object = body, origin = 'https://booth.test') =>
      deleteDraft(
        new Request('https://booth.test/api/admin/delete-draft', {
          method: 'POST',
          headers: { origin, cookie, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        { params: Promise.resolve({ eventId: fixture.eventId }) }
      );
    expect((await call(body, 'https://evil.test')).status).toBe(403);
    expect((await call({ ...body, padding: 'x'.repeat(8192) })).status).toBe(400);
    const first = await call();
    expect(first.status).toBe(200);
    expect((await first.json()).mediaRemovalState).toBe('complete');
    expect(
      (await fixture.local.service.storage.from('event_media').list(fixture.eventId)).data
    ).toEqual([]);
    const second = await call();
    expect(second.status).toBe(200);
    expect((await second.json()).mediaRemovalState).toBe('complete');
    const event = localOwnerSql(
      `select title,client_name,client_email,deleted_at,media_removal_state from public.events where id='${fixture.eventId}'`
    )[0];
    expect(event).toMatchObject({
      title: null,
      client_name: null,
      client_email: null,
      media_removal_state: 'complete',
    });
    expect(event.deleted_at).toBeTruthy();
    const audit = localOwnerSql(
      `select operation_kind,actor_scope from public.operation_receipts where event_id='${fixture.eventId}' order by committed_revision`
    );
    expect(audit.map((row) => row.operation_kind)).toEqual([
      'begin_delete_draft',
      'complete_delete_draft',
    ]);
    expect(JSON.stringify(audit)).not.toContain('Client');
  } finally {
    jar.clear();
    await fixture.dispose();
  }
}, 30000);

it.each(['Live', 'Draft with a previous run'])(
  'denies deletion of %s without erasing its details',
  async (state) => {
    const fixture = await createPackageFixture();
    try {
      fixture.seedRun(state === 'Live' ? 'Active' : 'Finished');
      if (state !== 'Live')
        localOwnerSql(
          `update public.events set state='Draft',revision=revision+1 where id='${fixture.eventId}'`
        );
      const session = (await fixture.adminClient.auth.getSession()).data.session!;
      const cookie = sessionCookies(session);
      for (const pair of cookie.split('; ')) {
        const [name, value] = pair.split('=');
        jar.set(name, value);
      }
      const response = await deleteDraft(
        new Request('https://booth.test/api/admin/delete-draft', {
          method: 'POST',
          headers: { origin: 'https://booth.test', cookie, 'content-type': 'application/json' },
          body: JSON.stringify({
            operationId: randomUUID(),
            expectedRevision: state === 'Live' ? 2 : 3,
          }),
        }),
        { params: Promise.resolve({ eventId: fixture.eventId }) }
      );
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('invalid_transition');
      expect(
        localOwnerSql(`select title,deleted_at from public.events where id='${fixture.eventId}'`)[0]
      ).toMatchObject({ title: 'Package fixture', deleted_at: null });
    } finally {
      jar.clear();
      await fixture.dispose();
    }
  },
  30000
);

it('denies Draft deletion after the Event becomes terminal', async () => {
  const fixture = await createPackageFixture();
  try {
    const cancelled = await fixture.admin('cancel', { expectedRevision: 1 });
    expect(cancelled.error).toBeNull();
    const session = (await fixture.adminClient.auth.getSession()).data.session!;
    const cookie = sessionCookies(session);
    for (const pair of cookie.split('; ')) {
      const [name, value] = pair.split('=');
      jar.set(name, value);
    }
    const response = await deleteDraft(
      new Request('https://booth.test/api/admin/delete-draft', {
        method: 'POST',
        headers: { origin: 'https://booth.test', cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId: randomUUID(),
          expectedRevision: cancelled.data.revision,
        }),
      }),
      { params: Promise.resolve({ eventId: fixture.eventId }) }
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('invalid_transition');
    expect(
      localOwnerSql(`select state,deleted_at from public.events where id='${fixture.eventId}'`)[0]
    ).toMatchObject({ state: 'Cancelled', deleted_at: null });
  } finally {
    jar.clear();
    await fixture.dispose();
  }
}, 30000);
