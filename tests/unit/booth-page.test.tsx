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
  expect((await BoothEntry()).props).toMatchObject({
    printerMode: 'instax-development',
    reconciliationOnly: true,
  });
  vi.stubEnv('BOOTH_PRINTER_MODE', 'simulated');
  expect((await BoothEntry()).props).toMatchObject({
    printerMode: 'instax-development',
    reconciliationOnly: true,
  });
  run.secret = '';
  run.evidenceVersion = null;
  vi.unstubAllEnvs();
});

it('keeps production physical mode disabled regardless of its explicit request', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('BOOTH_PRINTER_MODE', 'instax-development');
  run.secret = 'a'.repeat(64);
  run.evidenceVersion = 'instax-fi033-0102-dev-v1';
  try {
    expect((await BoothEntry()).type).toBe(BoothPaused);
  } finally {
    run.secret = '';
    run.evidenceVersion = null;
    vi.unstubAllEnvs();
  }
});

it('uses a bounded handoff entry key to replace cached controllers without granting authority or reconfirming', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BOOTH_PRINTER_MODE', 'disabled');
  run.secret = 'a'.repeat(64);
  run.evidenceVersion = 'instax-fi033-0102-dev-v1';
  try {
    const first = await BoothEntry({
      searchParams: Promise.resolve({ entry: '00000000-0000-4000-8000-000000000001' }),
    });
    const replacement = await BoothEntry({
      searchParams: Promise.resolve({ entry: '00000000-0000-4000-8000-000000000002' }),
    });
    expect(first.key).not.toBe(replacement.key);
    expect(replacement.props).toMatchObject({
      printerMode: 'instax-development',
      reconciliationOnly: true,
    });
    expect(
      (await BoothEntry({ searchParams: Promise.resolve({ entry: 'not-a-handoff' }) })).key
    ).toBe('scoped:instax-development:true');
    run.secret = '';
    run.evidenceVersion = null;
    expect(
      (
        await BoothEntry({
          searchParams: Promise.resolve({ entry: '00000000-0000-4000-8000-000000000003' }),
        })
      ).type
    ).toBe(BoothPaused);
  } finally {
    run.secret = '';
    run.evidenceVersion = null;
    vi.unstubAllEnvs();
  }
});
