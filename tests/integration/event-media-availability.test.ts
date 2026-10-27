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
import { beginEventMediaUpload, commitEventMedia } from '@/lib/events/media';
import { deletePackageDraft } from '@/lib/operations/package-draft-deletion';
import { createPackageFixture, type PackageFixture } from '../fixtures/package-contract';
import { localOwnerSql, localSupabaseStatus, ownerInsert } from '../fixtures/local-supabase';
import { sessionCookies } from '../fixtures/admin-route-server';

beforeAll(() => {
  const status = localSupabaseStatus();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', status.API_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', status.ANON_KEY);
  vi.stubEnv('SUPABASE_SECRET_KEY', status.SERVICE_ROLE_KEY);
});
async function authorize(f: PackageFixture) {
  jar.clear();
  for (const pair of sessionCookies((await f.adminClient.auth.getSession()).data.session!).split(
    '; '
  )) {
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
function asset(f: PackageFixture, state = 'uploading') {
  const id = randomUUID();
  const row = {
    id,
    event_id: f.eventId,
    kind: 'background',
    path: `${f.eventId}/${id}`,
    uploaded_by: f.adminUser.id,
    state,
    ...(state === 'attached' ? { content_type: 'image/png', byte_length: 100 } : {}),
  };
  ownerInsert('event_media_assets', row);
  return row;
}
function mediaRpc(f: PackageFixture, operation: string, payload: object, key = randomUUID()) {
  return f.local.service.rpc('event_media_operation', {
    p_admin_user_id: f.adminUser.id,
    p_admin_session_id: f.adminSessionId,
    p_operation: operation,
    p_operation_id: key,
    p_payload: { eventId: f.eventId, expectedRevision: 1, ...payload },
  });
}
function receipt(
  f: PackageFixture,
  operation: string,
  key: string,
  payload: object,
  result: object
) {
  const literal = (value: object) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  localOwnerSql(`select private.package_commit_receipt('${f.eventId}', 'admin:${f.adminUser.id}',
    '${key}', 'media_${operation}', ${literal({ eventId: f.eventId, expectedRevision: 1, ...payload })},
    1, ${literal(result)})`);
}

it('denies new and replayed upload authorizations without creating assets', async () => {
  const f = await createPackageFixture();
  try {
    await authorize(f);
    const key = randomUUID();
    receipt(
      f,
      'begin_upload',
      key,
      { kind: 'background' },
      { assetId: randomUUID(), path: 'historical' }
    );
    for (const operationId of [randomUUID(), key]) {
      const response = await beginEventMediaUpload(
        request({ operationId, expectedRevision: 1, kind: 'background' }),
        f.eventId
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        message: 'Media uploads are temporarily unavailable.',
      });
      expect(
        (await mediaRpc(f, 'begin_upload', { kind: 'background' }, operationId)).error?.message
      ).toBe('operation_unavailable');
    }
    expect(
      (await f.local.service.from('event_media_assets').select('id').eq('event_id', f.eventId)).data
    ).toEqual([]);
    expect(
      (await f.local.service.from('events').select('revision').eq('id', f.eventId).single()).data
        ?.revision
    ).toBe(1);
  } finally {
    jar.clear();
    await f.dispose();
  }
});

it('denies attachment of an old authorization before downloading bytes or changing retained media', async () => {
  const f = await createPackageFixture();
  try {
    await authorize(f);
    const retained = asset(f, 'attached'),
      pending = asset(f);
    const response = await commitEventMedia(
      request({ operationId: randomUUID(), expectedRevision: 1 }),
      f.eventId,
      pending.id
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      message: 'Media uploads are temporarily unavailable.',
    });
    expect(
      (
        await mediaRpc(f, 'attach', {
          assetId: pending.id,
          contentType: 'image/png',
          byteLength: 100,
          durationMs: null,
        })
      ).error?.message
    ).toBe('operation_unavailable');
    expect(
      (
        await f.adminClient
          .from('event_media_assets')
          .select('state')
          .eq('id', retained.id)
          .single()
      ).data?.state
    ).toBe('attached');
    expect(
      (
        await f.local.service
          .from('event_media_assets')
          .select('state')
          .eq('id', pending.id)
          .single()
      ).data?.state
    ).toBe('uploading');
  } finally {
    jar.clear();
    await f.dispose();
  }
});

it('recovers an already committed attachment receipt but refuses a fresh attachment key', async () => {
  const f = await createPackageFixture();
  try {
    await authorize(f);
    const retained = asset(f, 'attached'),
      key = randomUUID();
    receipt(
      f,
      'attach',
      key,
      { assetId: retained.id, contentType: 'image/png', byteLength: 100, durationMs: null },
      { assetId: retained.id, cleanupPending: false }
    );
    const replay = await commitEventMedia(
      request({ operationId: key, expectedRevision: 1 }),
      f.eventId,
      retained.id
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, receipt: { operationId: key } });
    const fresh = await mediaRpc(f, 'attach', {
      assetId: retained.id,
      contentType: 'image/png',
      byteLength: 100,
      durationMs: null,
    });
    expect(fresh.error?.message).toBe('operation_unavailable');
    expect(
      (
        await f.adminClient
          .from('event_media_assets')
          .select('state')
          .eq('id', retained.id)
          .single()
      ).data?.state
    ).toBe('attached');
    expect(
      (await f.local.client().from('event_media_assets').select('id').eq('id', retained.id)).data ??
        []
    ).toEqual([]);
  } finally {
    jar.clear();
    await f.dispose();
  }
});

it('denies authenticated sentinel writes and privileged publication for old authorized paths', async () => {
  const f = await createPackageFixture();
  try {
    const pending = asset(f);
    const insert = (version: string) =>
      `insert into storage.objects(bucket_id,name,version) values('event_media','${pending.path}','${version}')`;
    // Every metadata-only statement rolls back, even before the hold is implemented.
    expect(() =>
      localOwnerSql(`begin; set local role authenticated;
      set local request.jwt.claims='{"sub":"${f.adminUser.id}","role":"authenticated","session_id":"${f.adminSessionId}"}';
      ${insert('1')}; rollback;`)
    ).toThrow(/row-level security/);
    expect(() => localOwnerSql(`begin; ${insert(randomUUID())}; rollback;`)).toThrow(
      /event_media_upload_closed/
    );
    expect(() =>
      localOwnerSql(`begin; ${insert('1')};
      update storage.objects set metadata='{}' where bucket_id='event_media' and name='${pending.path}'; rollback;`)
    ).toThrow(/event_media_upload_closed/);
    // Preserve Storage's rollback-only DELETE permission preflight.
    expect(() => localOwnerSql(`begin; ${insert('1')}; rollback;`)).not.toThrow();
    const bucket = `unrelated-${randomUUID()}`;
    expect(() =>
      localOwnerSql(`begin;
      insert into storage.buckets(id,name) values('${bucket}','${bucket}');
      insert into storage.objects(bucket_id,name,version) values('${bucket}','synthetic','${randomUUID()}');
      rollback;`)
    ).not.toThrow();
  } finally {
    await f.dispose();
  }
});

it('preserves request authority and refuses direct browser asset mutations', async () => {
  const f = await createPackageFixture();
  try {
    jar.clear();
    const body = { operationId: randomUUID(), expectedRevision: 1, kind: 'background' };
    expect((await beginEventMediaUpload(request(body), f.eventId)).status).toBe(401);
    await authorize(f);
    const foreign = request(body);
    foreign.headers.set('origin', 'https://other.test');
    expect((await beginEventMediaUpload(foreign, f.eventId)).status).toBe(403);
    const pending = asset(f);
    expect(
      (
        await f.adminClient
          .from('event_media_assets')
          .update({ state: 'attached' })
          .eq('id', pending.id)
      ).error
    ).not.toBeNull();
    expect(
      (
        await f.adminClient.rpc('event_media_operation', {
          p_admin_user_id: f.adminUser.id,
          p_admin_session_id: f.adminSessionId,
          p_operation: 'begin_upload',
          p_operation_id: randomUUID(),
          p_payload: { eventId: f.eventId, expectedRevision: 1, kind: 'background' },
        })
      ).error
    ).not.toBeNull();
  } finally {
    jar.clear();
    await f.dispose();
  }
});

it('preserves removal and cancellation while keeping media-bearing Draft deletion pending', async () => {
  const f = await createPackageFixture();
  try {
    await authorize(f);
    const retained = asset(f, 'attached');
    const removed = await commitEventMedia(
      request({ operationId: randomUUID(), expectedRevision: 1 }, 'DELETE'),
      f.eventId,
      retained.id
    );
    expect(removed.status).toBe(200);
    const body = { operationId: randomUUID(), expectedRevision: 2 };
    for (let attempt = 0; attempt < 2; attempt++) {
      const deleted = await deletePackageDraft(request(body), f.eventId);
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toMatchObject({ mediaRemovalState: 'pending' });
    }
    expect(
      (
        await f.local.service.rpc('event_media_cleanup', {
          p_asset_id: retained.id,
          p_removed: true,
        })
      ).error?.message
    ).toBe('not_ready');
    expect((await f.admin('complete_delete_draft', { expectedRevision: 3 })).error?.message).toBe(
      'not_ready'
    );
    expect(
      (
        await f.local.service
          .from('event_media_assets')
          .select('state')
          .eq('id', retained.id)
          .single()
      ).data?.state
    ).toBe('cleanup_pending');
  } finally {
    jar.clear();
    await f.dispose();
  }
  const terminal = await createPackageFixture();
  try {
    const retained = asset(terminal, 'attached');
    expect((await terminal.admin('cancel', { expectedRevision: 1 })).error).toBeNull();
    expect(
      (
        await terminal.adminClient
          .from('event_media_assets')
          .select('state')
          .eq('id', retained.id)
          .single()
      ).data?.state
    ).toBe('attached');
  } finally {
    await terminal.dispose();
  }
});
