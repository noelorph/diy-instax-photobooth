// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it, vi } from 'vitest';
import sharp from 'sharp';
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
import { beginEventMediaUpload, commitEventMedia } from '@/lib/events/media';
import { localOwnerSql, localSupabaseStatus } from '../fixtures/local-supabase';
import { sessionCookies, expiredSession } from '../fixtures/admin-route-server';
import type { PackageFixture } from '../fixtures/package-contract';
import { mediaFixture } from '../fixtures/event-media';

beforeAll(() => {
  const status = localSupabaseStatus();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', status.API_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', status.ANON_KEY);
  vi.stubEnv('SUPABASE_SECRET_KEY', status.SERVICE_ROLE_KEY);
});
async function authorize(f: PackageFixture) {
  jar.clear();
  const cookie = sessionCookies((await f.adminClient.auth.getSession()).data.session!);
  for (const pair of cookie.split('; ')) {
    const [key, value] = pair.split('=');
    jar.set(key, value);
  }
}
const request = (body: object, method = 'POST') =>
  new Request('https://booth.test/api/admin/media', {
    method,
    headers: { origin: 'https://booth.test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
async function beginUpload(f: PackageFixture, revision: number, kind = 'background') {
  const response = await beginEventMediaUpload(
    request({ operationId: randomUUID(), expectedRevision: revision, kind }),
    f.eventId
  );
  expect(response.status).toBe(200);
  return response.json();
}
async function store(
  f: PackageFixture,
  result: { receipt: { result: { path: string } } },
  bytes: Uint8Array,
  contentType = 'image/png'
) {
  const uploaded = await f.adminClient.storage
    .from('event_media')
    .upload(result.receipt.result.path, bytes, { contentType, upsert: false });
  expect(uploaded.error).toBeNull();
}
const png = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#456' } })
    .png()
    .toBuffer();

import { createPackageBrowserFixture, withMediaEventHeld } from '../fixtures/package-browser';

it('begins one immutable upload with actor-scoped replay and conflicting payload denial', async () => {
  const f = await createPackageBrowserFixture();
  try {
    const operationId = randomUUID();
    const args = {
      p_admin_user_id: f.adminUser.id,
      p_admin_session_id: f.adminSessionId,
      p_operation: 'begin_upload',
      p_operation_id: operationId,
      p_payload: { eventId: f.eventId, expectedRevision: 1, kind: 'background' },
    };
    const first = await f.local.service.rpc('event_media_operation', args);
    expect(first.error).toBeNull();
    expect(first.data.receipt.result).toMatchObject({ bucket: 'event_media' });
    const replay = await f.local.service.rpc('event_media_operation', args);
    expect(replay.error).toBeNull();
    expect(replay.data.receipt).toEqual(first.data.receipt);
    expect(replay.data.replayed).toBe(true);
    const conflict = await f.local.service.rpc('event_media_operation', {
      ...args,
      p_payload: { ...args.p_payload, kind: 'montage' },
    });
    expect(conflict.error?.message).toBe('operation_conflict');
  } finally {
    await f.dispose();
  }
}, 30_000);

it('rejects invalid content without replacing attached media', async () => {
  const f = await createPackageBrowserFixture();
  try {
    await authorize(f);
    const initial = await beginUpload(f, 1);
    await store(f, initial, await png());
    const initialKey = randomUUID();
    const first = await commitEventMedia(
      request({ operationId: initialKey, expectedRevision: initial.revision }),
      f.eventId,
      initial.receipt.result.assetId
    );
    expect(first.status).toBe(200);
    const saved = await first.json();
    const replay = await commitEventMedia(
      request({ operationId: initialKey, expectedRevision: initial.revision }),
      f.eventId,
      initial.receipt.result.assetId
    );
    expect((await replay.json()).receipt).toEqual(saved.receipt);
    let revision = saved.revision;
    for (const bytes of [
      Buffer.from('pretend png'),
      mediaFixture('animated.png'),
      mediaFixture('animated.webp'),
    ]) {
      const next = await beginUpload(f, revision);
      revision = next.revision;
      await store(f, next, bytes);
      const rejected = await commitEventMedia(
        request({ operationId: randomUUID(), expectedRevision: revision }),
        f.eventId,
        next.receipt.result.assetId
      );
      expect(rejected.status).toBe(400);
      const rows = localOwnerSql(
        `select id,state from public.event_media_assets where event_id='${f.eventId}' order by created_at`
      );
      expect(rows.filter((a) => a.state === 'attached').map((a) => a.id)).toEqual([
        initial.receipt.result.assetId,
      ]);
      expect(rows.at(-1)?.state).toBe('cleanup_pending');
    }
    expect(
      localOwnerSql(
        `select count(*)::int as count from public.activity_events where event_id='${f.eventId}' and operation_kind='media_attach'`
      )[0].count
    ).toBe(1);
  } finally {
    jar.clear();
    await f.dispose();
  }
}, 60_000);

it('keeps immutable paths private and rejects cross-Event, overwrite, expired and revoked uploads', async () => {
  const f = await createPackageBrowserFixture();
  try {
    await authorize(f);
    const pending = await beginUpload(f, 1);
    const path = pending.receipt.result.path;
    await store(f, pending, await png());
    expect(
      (
        await f.local
          .client()
          .storage.from('event_media')
          .upload(path, await png(), { contentType: 'image/png' })
      ).error
    ).not.toBeNull();
    expect(
      (
        await f.adminClient.storage
          .from('event_media')
          .upload(path, await png(), { contentType: 'image/png', upsert: true })
      ).error
    ).not.toBeNull();
    expect((await f.adminClient.storage.from('event_media').download(path)).error).not.toBeNull();
    expect(
      (await f.local.client().storage.from('event_media').download(path)).error
    ).not.toBeNull();
    expect((await f.adminClient.storage.from('event_media').remove([path])).data).toEqual([]);
    expect(
      (
        await f.adminClient.storage
          .from('event_media')
          .upload(`${randomUUID()}/${pending.receipt.result.assetId}`, await png(), {
            contentType: 'image/png',
          })
      ).error
    ).not.toBeNull();
    const expired = expiredSession((await f.adminClient.auth.getSession()).data.session!);
    expect(
      (
        await f.local
          .tokenClient(expired.access_token)
          .storage.from('event_media')
          .upload(path, await png(), { contentType: 'image/png' })
      ).error
    ).not.toBeNull();
    const next = await beginUpload(f, pending.revision);
    localOwnerSql(`delete from public.admin_profiles where id='${f.adminUser.id}'`);
    expect(
      (
        await f.adminClient.storage
          .from('event_media')
          .upload(next.receipt.result.path, await png(), { contentType: 'image/png' })
      ).error
    ).not.toBeNull();
    const revoked = await commitEventMedia(
      request({ operationId: randomUUID(), expectedRevision: next.revision }),
      f.eventId,
      next.receipt.result.assetId
    );
    expect(revoked.status).toBe(403);
  } finally {
    jar.clear();
    await f.dispose();
  }
}, 60_000);

it.each(['start', 'cancel'])(
  '%s defeats late attachment and new Storage insertion',
  async (transition) => {
    const f = await createPackageBrowserFixture();
    try {
      await authorize(f);
      const old = await beginUpload(f, 1);
      await store(f, old, await png());
      const attached = await commitEventMedia(
        request({ operationId: randomUUID(), expectedRevision: old.revision }),
        f.eventId,
        old.receipt.result.assetId
      );
      expect(attached.status).toBe(200);
      const replacement = await beginUpload(f, (await attached.json()).revision);
      await store(f, replacement, await png());
      const unfinished = await beginUpload(f, replacement.revision);
      let lifecycle;
      if (transition === 'start') {
        localOwnerSql(`update public.printer_completion_policy set mode='simulated' where id`);
        const setup = await f.reportSetup();
        expect(setup.error).toBeNull();
        lifecycle = await f.admin('start', {
          expectedRevision: unfinished.revision,
          readinessWindowId: setup.data.readinessWindowId,
          deviceHash: f.deviceHash,
          printerId: 'fixture-printer',
          connectionGeneration: 0,
        });
      } else lifecycle = await f.admin('cancel', { expectedRevision: unfinished.revision });
      expect(lifecycle.error).toBeNull();
      expect(
        (
          await f.adminClient.storage
            .from('event_media')
            .upload(unfinished.receipt.result.path, await png(), { contentType: 'image/png' })
        ).error
      ).not.toBeNull();
      expect(
        (
          await commitEventMedia(
            request({ operationId: randomUUID(), expectedRevision: unfinished.revision }),
            f.eventId,
            unfinished.receipt.result.assetId
          )
        ).status
      ).toBe(409);
      const response = await commitEventMedia(
        request({ operationId: randomUUID(), expectedRevision: unfinished.revision }),
        f.eventId,
        replacement.receipt.result.assetId
      );
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('invalid_transition');
      expect(
        localOwnerSql(
          `select id from public.event_media_assets where event_id='${f.eventId}' and state='attached'`
        ).map((a) => a.id)
      ).toEqual([old.receipt.result.assetId]);
      expect(
        localOwnerSql(
          `select state from public.event_media_assets where id='${replacement.receipt.result.assetId}'`
        )[0].state
      ).toBe('cleanup_pending');
    } finally {
      jar.clear();
      await f.dispose();
    }
  },
  60_000
);

it('preserves prior montage after unsupported codec or excessive fragmented duration', async () => {
  const f = await createPackageBrowserFixture();
  try {
    await authorize(f);
    const original = await beginUpload(f, 1, 'montage');
    await store(f, original, mediaFixture('avc-audio.mp4'), 'video/mp4');
    const response = await commitEventMedia(
      request({ operationId: randomUUID(), expectedRevision: original.revision }),
      f.eventId,
      original.receipt.result.assetId
    );
    expect(response.status).toBe(200);
    let revision = (await response.json()).revision;
    for (const name of ['hevc.mp4', 'avc-fragmented-31s.mp4']) {
      const next = await beginUpload(f, revision, 'montage');
      revision = next.revision;
      await store(f, next, mediaFixture(name), 'video/mp4');
      expect(
        (
          await commitEventMedia(
            request({ operationId: randomUUID(), expectedRevision: revision }),
            f.eventId,
            next.receipt.result.assetId
          )
        ).status
      ).toBe(400);
      expect(
        localOwnerSql(
          `select id from public.event_media_assets where event_id='${f.eventId}' and state='attached'`
        ).map((a) => a.id)
      ).toEqual([original.receipt.result.assetId]);
    }
  } finally {
    jar.clear();
    await f.dispose();
  }
}, 60_000);

it('rejects stale replacements, protects attached cleanup and removes through one receipt', async () => {
  const f = await createPackageBrowserFixture();
  try {
    await authorize(f);
    const original = await beginUpload(f, 1);
    await store(f, original, await png());
    const attached = await commitEventMedia(
      request({ operationId: randomUUID(), expectedRevision: original.revision }),
      f.eventId,
      original.receipt.result.assetId
    );
    expect(attached.status).toBe(200);
    const saved = await attached.json();
    expect(
      (
        await f.local.service.rpc('event_media_cleanup', {
          p_asset_id: original.receipt.result.assetId,
          p_removed: true,
        })
      ).error?.message
    ).toBe('invalid_transition');
    const next = await beginUpload(f, saved.revision);
    await store(f, next, await png());
    const newer = await beginUpload(f, next.revision, 'montage');
    const stale = await commitEventMedia(
      request({ operationId: randomUUID(), expectedRevision: next.revision }),
      f.eventId,
      next.receipt.result.assetId
    );
    expect((await stale.json()).code).toBe('stale_revision');
    expect(
      localOwnerSql(
        `select id from public.event_media_assets where event_id='${f.eventId}' and state='attached'`
      ).map((a) => a.id)
    ).toEqual([original.receipt.result.assetId]);
    const removeId = randomUUID();
    const remove = () =>
      commitEventMedia(
        request({ operationId: removeId, expectedRevision: newer.revision }, 'DELETE'),
        f.eventId,
        original.receipt.result.assetId
      );
    const removed = await remove();
    expect(removed.status).toBe(200);
    const result = await removed.json();
    expect(result.receipt.result).toEqual({
      assetId: original.receipt.result.assetId,
      cleanupPending: true,
    });
    expect((await (await remove()).json()).receipt).toEqual(result.receipt);
    expect(
      localOwnerSql(
        `select count(*)::int as n from public.activity_events where event_id='${f.eventId}' and operation_kind='media_remove'`
      )[0].n
    ).toBe(1);
  } finally {
    jar.clear();
    await f.dispose();
  }
}, 60_000);

it('denies browser asset writes and expired upload authorization', async () => {
  const f = await createPackageBrowserFixture();
  try {
    await authorize(f);
    const pending = await beginUpload(f, 1);
    const id = pending.receipt.result.assetId;
    expect(
      (await f.adminClient.from('event_media_assets').update({ state: 'attached' }).eq('id', id))
        .error
    ).not.toBeNull();
    expect(
      (
        await f.adminClient.rpc('event_media_operation', {
          p_admin_user_id: f.adminUser.id,
          p_admin_session_id: f.adminSessionId,
          p_operation: 'attach',
          p_operation_id: randomUUID(),
          p_payload: {},
        })
      ).error
    ).not.toBeNull();
    expect(
      (await f.adminClient.rpc('event_media_cleanup', { p_asset_id: id, p_removed: true })).error
    ).not.toBeNull();
    localOwnerSql(
      `update public.event_media_assets set upload_expires_at=clock_timestamp()-interval '1 second' where id='${id}'`
    );
    expect(
      (
        await f.adminClient.storage
          .from('event_media')
          .upload(pending.receipt.result.path, await png(), { contentType: 'image/png' })
      ).error
    ).not.toBeNull();
    const row = localOwnerSql(`select state from public.event_media_assets where id='${id}'`)[0];
    expect(row.state).toBe('uploading');
  } finally {
    jar.clear();
    await f.dispose();
  }
}, 30_000);

it.each(['storage', 'attachment'])(
  'rechecks Admin authority after the Event lock for %s',
  async (boundary) => {
    const f = await createPackageBrowserFixture();
    try {
      await authorize(f);
      const pending = await beginUpload(f, 1);
      if (boundary === 'attachment') await store(f, pending, await png());
      const bytes = await png();
      const result = await withMediaEventHeld(
        f.eventId,
        async () => {
          if (boundary === 'storage')
            return (
              (
                await f.adminClient.storage
                  .from('event_media')
                  .upload(pending.receipt.result.path, bytes, { contentType: 'image/png' })
              ).error !== null
            );
          return (
            (
              await commitEventMedia(
                request({ operationId: randomUUID(), expectedRevision: pending.revision }),
                f.eventId,
                pending.receipt.result.assetId
              )
            ).status === 401
          );
        },
        () => {
          localOwnerSql(`delete from auth.sessions where id='${f.adminSessionId}'`);
        }
      );
      expect(result).toBe(true);
      expect(
        localOwnerSql(
          `select count(*)::int as n from public.event_media_assets where event_id='${f.eventId}' and state='attached'`
        )[0].n
      ).toBe(0);
      if (boundary === 'storage')
        expect((await f.local.service.storage.from('event_media').list(f.eventId)).data).toEqual(
          []
        );
    } finally {
      jar.clear();
      await f.dispose();
    }
  },
  30_000
);

it('enforces complete validated metadata even at the database constraint boundary', async () => {
  const f = await createPackageBrowserFixture();
  try {
    const id = randomUUID();
    expect(() =>
      localOwnerSql(
        `insert into public.event_media_assets(id,event_id,kind,path,uploaded_by,state,content_type,byte_length,duration_ms) values('${id}','${f.eventId}','montage','${f.eventId}/${id}','${f.adminUser.id}','attached','video/mp4',100,null)`
      )
    ).toThrow();
  } finally {
    await f.dispose();
  }
}, 30_000);
