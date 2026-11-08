// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => {} }));
const run = vi.hoisted(() => ({ evidenceVersion: null as string | null, secret: '' }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: run.secret }) }) }));
vi.mock('@/lib/operations/package-state', () => ({
  readPackageBoothState: async () => ({ evidenceVersion: run.evidenceVersion }),
}));
import { BoothEntry } from '@/features/booth/entry';
import { BoothClient, BoothPaused } from '@/features/booth/booth-client';
it('keeps production disabled even when simulator enablement is set', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('BOOTH_PRINTER_MODE', 'simulated');
  expect((await BoothEntry()).type).toBe(BoothPaused);
  vi.unstubAllEnvs();
});
it('serves the Guest simulator only under server development/test enablement', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BOOTH_PRINTER_MODE', 'simulated');
  expect((await BoothEntry()).type).toBe(BoothClient);
  vi.stubEnv('BOOTH_PRINTER_MODE', 'false');
  expect((await BoothEntry()).type).toBe(BoothPaused);
  vi.unstubAllEnvs();
});

it('retains authenticated pinned reconciliation after disabling new work', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BOOTH_PRINTER_MODE', 'disabled');
  run.secret = 'a'.repeat(64);
  run.evidenceVersion = 'simulator-v1';
  expect((await BoothEntry()).type).toBe(BoothClient);
  run.evidenceVersion = 'instax-fi033-0102-dev-v1';
  expect((await BoothEntry()).type).toBe(BoothPaused);
  vi.stubEnv('BOOTH_PRINTER_MODE', 'simulated');
  expect((await BoothEntry()).type).toBe(BoothPaused);
  run.secret = '';
  run.evidenceVersion = null;
  vi.unstubAllEnvs();
});
