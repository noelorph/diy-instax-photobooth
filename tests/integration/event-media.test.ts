// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
import { deletePackageDraft } from '@/lib/operations/package-draft-deletion';
import { POST as cancelDraft } from '@/app/api/admin/events/[eventId]/cancel/route';
import { removeEventMedia } from '@/lib/operations/draft-media-cleanup';
import { localOwnerSql, localSupabaseStatus } from '../fixtures/local-supabase';
import { sessionCookies, expiredSession } from '../fixtures/admin-route-server';
import { createPackageFixture, type PackageFixture } from '../fixtures/package-contract';
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

import {
  createPackageBrowserFixture,
  withMediaEventHeld,
  withMediaCommitHeld,
  mediaFixtureBackendFiles,
  terminateMediaFixtureUpload,
} from '../fixtures/package-browser';

// ADR-0031: active uploads and their transfer/cleanup probes remain deferred until qualification.
describe.skip('planned active Event Media upload qualification (ADR-0031)', () => {
  it('deletion stays pending while an upload can still finish', async () => {
    const f = await createPackageBrowserFixture();
    try {
      await authorize(f);
      const asset = await beginUpload(f, 1);
      const path = asset.receipt.result.path;
      const bytes = await png();
      const status = localSupabaseStatus();
      const token = (await f.adminClient.auth.getSession()).data.session!.access_token;
      const headers = { authorization: `Bearer ${token}`, 'tus-resumable': '1.0.0' };
      const created = await fetch(`${status.API_URL}/storage/v1/upload/resumable`, {
        method: 'POST',
        headers: {
          ...headers,
          'upload-length': String(bytes.length),
          'upload-metadata': Object.entries({
            bucketName: 'event_media',
            objectName: path,
            contentType: 'image/png',
          })
            .map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`)
            .join(','),
        },
      });
      expect(created.status).toBe(201);
      const url = created.headers.get('location')!;
      const payload = { operationId: randomUUID(), expectedRevision: asset.revision };
      let deletion: { mediaRemovalState: string } | undefined;
      const finalized = await withMediaCommitHeld(
        path,
        () =>
          fetch(url, {
            method: 'PATCH',
            headers: {
              ...headers,
              'content-type': 'application/offset+octet-stream',
              'upload-offset': '0',
            },
            body: new Uint8Array(bytes),
          }),
        async () => {
          // The waiter has passed RLS and written its bytes, but not committed metadata.
          expect(
            mediaFixtureBackendFiles(f.eventId).some((file) => file.bytes === bytes.length)
          ).toBe(true);
          const response = await deletePackageDraft(request(payload), f.eventId);
          expect(response.status).toBe(200);
          deletion = await response.json();
        }
      );
      const storage = f.local.service.storage.from('event_media');
      console.info('Real deletion race:', {
        mediaRemovalState: deletion?.mediaRemovalState,
        finalChunkStatus: finalized.status,
        objectCount: (await storage.list(f.eventId)).data?.length,
      });
      expect(deletion?.mediaRemovalState).toBe('pending');
      expect(finalized.status).toBe(403);
      await expect
        .poll(
          () => mediaFixtureBackendFiles(f.eventId).filter((file) => !file.name.endsWith('.json')),
          { timeout: 10_000 }
        )
        .toEqual([]);
      console.info(
        'Remaining local TUS metadata files:',
        mediaFixtureBackendFiles(f.eventId).length
      );
      expect(
        mediaFixtureBackendFiles(f.eventId).some(
          (file) => file.name.endsWith('.json') && file.bytes > 0
        )
      ).toBe(true);
      expect((await storage.list(f.eventId)).data).toEqual([]);
      expect((await storage.download(path)).error).not.toBeNull();
      const retried = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...headers,
          'content-type': 'application/offset+octet-stream',
          'upload-offset': '0',
        },
        body: new Uint8Array(bytes),
      });
      expect(retried.ok).toBe(false);
      expect((await storage.list(f.eventId)).data).toEqual([]);
      expect(
        mediaFixtureBackendFiles(f.eventId).filter((file) => !file.name.endsWith('.json'))
      ).toEqual([]);
      // Local physical observation is evidence, not a product-side transfer inventory.
      expect(
        (await (await deletePackageDraft(request(payload), f.eventId)).json()).mediaRemovalState
      ).toBe('pending');
    } finally {
      jar.clear();
      await f.dispose();
    }
  }, 60_000);

  it('cancels a Draft through the protected route while retaining its attached bytes', async () => {
    const f = await createPackageBrowserFixture();
    try {
      await authorize(f);
      const asset = await beginUpload(f, 1);
      const bytes = await png();
      await store(f, asset, bytes);
      const saved = await commitEventMedia(
        request({ operationId: randomUUID(), expectedRevision: asset.revision }),
        f.eventId,
        asset.receipt.result.assetId
      );
      expect(saved.status).toBe(200);
      const payload = {
        operationId: randomUUID(),
        expectedRevision: (await saved.json()).revision,
      };
      const cancelled = await cancelDraft(request(payload), {
        params: Promise.resolve({ eventId: f.eventId }),
      });
      expect(cancelled.status).toBe(200);
      expect(
        localOwnerSql(`select state from public.events where id='${f.eventId}'`)[0].state
      ).toBe('Cancelled');
      const stored = await f.local.service.storage
        .from('event_media')
        .download(asset.receipt.result.path);
      expect(stored.error).toBeNull();
      expect(Buffer.from(await stored.data!.arrayBuffer())).toEqual(bytes);
      await removeEventMedia(f.local.service, f.eventId);
      const retained = await f.local.service.storage
        .from('event_media')
        .download(asset.receipt.result.path);
      expect(retained.error).toBeNull();
      expect(Buffer.from(await retained.data!.arrayBuffer())).toEqual(bytes);
      expect(
        localOwnerSql(
          `select state from public.event_media_assets where id='${asset.receipt.result.assetId}'`
        )[0].state
      ).toBe('attached');
    } finally {
      jar.clear();
      await f.dispose();
    }
  }, 30_000);

  it('does not acknowledge media removal or complete deletion from an empty listing alone', async () => {
    const f = await createPackageBrowserFixture();
    try {
      await authorize(f);
      const asset = await beginUpload(f, 1);
      const retired = await f.local.service.rpc('event_media_cleanup', {
        p_asset_id: asset.receipt.result.assetId,
        p_removed: false,
      });
      expect(retired.error).toBeNull();
      expect(
        (
          await f.local.service.rpc('event_media_cleanup', {
            p_asset_id: asset.receipt.result.assetId,
            p_removed: true,
          })
        ).error?.message
      ).toBe('not_ready');
      const begun = await f.admin('begin_delete_draft', { expectedRevision: asset.revision });
      expect(begun.error).toBeNull();
      expect(
        (await f.admin('complete_delete_draft', { expectedRevision: begun.data.revision })).error
          ?.message
      ).toBe('not_ready');
    } finally {
      jar.clear();
      await f.dispose();
    }
  }, 30_000);

  it('blocks privileged media overwrites while leaving other Storage buckets usable', async () => {
    const f = await createPackageBrowserFixture();
    const otherBucket = `guard-fixture-${randomUUID()}`;
    try {
      await authorize(f);
      const asset = await beginUpload(f, 1);
      const bytes = await png();
      await store(f, asset, bytes);
      const storage = f.local.service.storage.from('event_media');
      expect(
        (
          await storage.upload(asset.receipt.result.path, new Uint8Array([1, 2, 3]), {
            contentType: 'image/png',
            upsert: true,
          })
        ).error
      ).not.toBeNull();
      const retained = await storage.download(asset.receipt.result.path);
      expect(retained.error).toBeNull();
      expect(Buffer.from(await retained.data!.arrayBuffer())).toEqual(bytes);
      expect(
        (await f.local.service.storage.createBucket(otherBucket, { public: false })).error
      ).toBeNull();
      const other = f.local.service.storage.from(otherBucket);
      expect(
        (await other.upload('synthetic', bytes, { contentType: 'image/png' })).error
      ).toBeNull();
      expect((await other.remove(['synthetic'])).error).toBeNull();
    } finally {
      await f.local.service.storage.from(otherBucket).remove(['synthetic']);
      await f.local.service.storage.deleteBucket(otherBucket);
      jar.clear();
      await f.dispose();
    }
  }, 30_000);

  it('terminates a known closed TUS upload without exposing the permission-test sentinel', async () => {
    const f = await createPackageBrowserFixture();
    try {
      await authorize(f);
      const asset = await beginUpload(f, 1);
      const status = localSupabaseStatus();
      const token = (await f.adminClient.auth.getSession()).data.session!.access_token;
      const headers = { authorization: `Bearer ${token}`, 'tus-resumable': '1.0.0' };
      const created = await fetch(`${status.API_URL}/storage/v1/upload/resumable`, {
        method: 'POST',
        headers: {
          ...headers,
          'upload-length': '1',
          'upload-metadata': Object.entries({
            bucketName: 'event_media',
            objectName: asset.receipt.result.path,
            contentType: 'image/png',
            version: '1',
          })
            .map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`)
            .join(','),
        },
      });
      expect(created.status).toBe(201);
      const url = created.headers.get('location')!;
      const generatedId = Buffer.from(
        new URL(url).pathname.split('/').at(-1)!,
        'base64url'
      ).toString();
      expect(generatedId.split('/').at(-1)).toMatch(/^[a-f0-9-]{36}$/);
      expect((await f.admin('cancel', { expectedRevision: asset.revision })).error).toBeNull();
      expect(() =>
        localOwnerSql(
          `begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${f.adminUser.id}","role":"authenticated","session_id":"${f.adminSessionId}"}',true); insert into storage.objects(bucket_id,name,version) values('event_media','${asset.receipt.result.path}','1'); rollback;`
        )
      ).toThrow(/row-level security/i);
      await terminateMediaFixtureUpload(url);
      expect(mediaFixtureBackendFiles(f.eventId)).toEqual([]);
      const retry = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...headers,
          'content-type': 'application/offset+octet-stream',
          'upload-offset': '0',
        },
        body: new Uint8Array([1]),
      });
      expect(retry.ok).toBe(false);
      expect((await f.local.service.storage.from('event_media').list(f.eventId)).data).toEqual([]);
    } finally {
      jar.clear();
      await f.dispose();
    }
  }, 30_000);

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
      expect(
        (
          await f.local
            .client()
            .storage.from('event_media')
            .upload(path, await png(), { contentType: 'image/png' })
        ).error
      ).toMatchObject({ message: expect.stringMatching(/row-level security/i) });
      await store(f, pending, await png());
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
      const expiredAsset = await beginUpload(f, pending.revision);
      const expired = expiredSession((await f.adminClient.auth.getSession()).data.session!);
      expect(
        (
          await f.local
            .tokenClient(expired.access_token)
            .storage.from('event_media')
            .upload(expiredAsset.receipt.result.path, await png(), { contentType: 'image/png' })
        ).error
      ).toMatchObject({ message: expect.stringMatching(/exp.*timestamp/i) });
      const next = await beginUpload(f, expiredAsset.revision);
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
      expect((await f.local.service.storage.from('event_media').list(f.eventId)).data).toEqual([]);
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
});

it('enforces complete validated metadata even at the database constraint boundary', async () => {
  const f = await createPackageFixture();
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
