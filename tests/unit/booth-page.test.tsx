// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => {} }));
import { BoothEntry } from '@/features/booth/entry';
import { BoothClient, BoothPaused } from '@/features/booth/booth-client';
it('keeps production disabled even when simulator enablement is set', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
  expect((await BoothEntry()).type).toBe(BoothPaused);
  vi.unstubAllEnvs();
});
it('serves the Guest simulator only under server development/test enablement', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
  expect((await BoothEntry()).type).toBe(BoothClient);
  vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'false');
  expect((await BoothEntry()).type).toBe(BoothPaused);
  vi.unstubAllEnvs();
});
