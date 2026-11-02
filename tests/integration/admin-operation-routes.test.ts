// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
import { localSupabaseStatus } from '../fixtures/local-supabase';
beforeAll(() => {
  const status = localSupabaseStatus();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', status.API_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', status.ANON_KEY);
  vi.stubEnv('SUPABASE_SECRET_KEY', status.SERVICE_ROLE_KEY);
});
afterAll(() => vi.unstubAllEnvs());
import { POST as start } from '@/app/api/admin/events/[eventId]/booth/start/route';
import { POST as pause } from '@/app/api/admin/events/[eventId]/booth/pause/route';
import { POST as finish } from '@/app/api/admin/events/[eventId]/booth/finish/route';
import { POST as deleteDraft } from '@/app/api/admin/events/[eventId]/delete-draft/route';
it.each([
  ['start', start],
  ['pause', pause],
  ['finish', finish],
  ['delete Draft', deleteDraft],
] as const)(
  'retains missing-Admin and cross-origin denial for current %s',
  async (_name, invoke) => {
    const context = { params: Promise.resolve({ eventId: randomUUID() }) };
    const request = (origin: string) =>
      new Request('https://booth.test/api/action', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ operationId: randomUUID(), expectedRevision: 1 }),
      });
    const crossOrigin = await invoke(request('https://evil.test'), context);
    expect(crossOrigin.status).toBe(403);
    const unauthenticated = await invoke(request('https://booth.test'), context);
    expect(unauthenticated.status).toBe(401);
  }
);
