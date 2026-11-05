// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const exec = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFileSync: exec }));
beforeEach(() => vi.stubEnv('INSTAX_TEST_WORKDIR', undefined));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  exec.mockReset();
});

it('rejects a hosted endpoint before exposing credentials to fixtures', async () => {
  exec.mockReturnValueOnce(JSON.stringify({ API_URL: 'https://example.supabase.co' }));
  const { readLocalSupabaseStatus } = await import('../fixtures/test-stack.mjs');
  expect(() => readLocalSupabaseStatus()).toThrow('local test stack');
});

it('rejects a database container owned by another project', async () => {
  exec
    .mockReturnValueOnce(JSON.stringify({ API_URL: 'http://127.0.0.1:56321' }))
    .mockReturnValueOnce('another-project');
  const { readLocalSupabaseStatus } = await import('../fixtures/test-stack.mjs');
  expect(() => readLocalSupabaseStatus()).toThrow('project');
});

it('refuses the ordinary stack when an isolated verification directory is selected', async () => {
  vi.stubEnv('INSTAX_TEST_WORKDIR', '/tmp/instax-comparison/baseline');
  exec.mockReturnValueOnce(JSON.stringify({ API_URL: 'http://127.0.0.1:56321' }));
  const { readLocalSupabaseStatus } = await import('../fixtures/test-stack.mjs');
  expect(() => readLocalSupabaseStatus()).toThrow('local test stack');
});

it('discovers credentials only for the selected verification project', async () => {
  vi.stubEnv('INSTAX_TEST_WORKDIR', '/tmp/instax-comparison/baseline');
  exec
    .mockReturnValueOnce(
      JSON.stringify({ API_URL: 'http://127.0.0.1:58321', ANON_KEY: 'fixture-key' })
    )
    .mockReturnValueOnce('diy-instax-retirement-verification')
    .mockReturnValueOnce(JSON.stringify({ liveEvents: 0, unresolvedAttempts: 0 }));
  const { readLocalSupabaseStatus } = await import('../fixtures/test-stack.mjs');
  expect(readLocalSupabaseStatus()).toEqual({
    API_URL: 'http://127.0.0.1:58321',
    ANON_KEY: 'fixture-key',
  });
});

it('refuses existing Live or unresolved printer work instead of deleting or settling it', async () => {
  exec
    .mockReturnValueOnce(JSON.stringify({ API_URL: 'http://127.0.0.1:56321' }))
    .mockReturnValueOnce('diy-instax-package-contracts')
    .mockReturnValueOnce(JSON.stringify({ liveEvents: 1, unresolvedAttempts: 1 }));
  const { readLocalSupabaseStatus } = await import('../fixtures/test-stack.mjs');
  expect(() => readLocalSupabaseStatus()).toThrow('existing Live Event or unresolved print');
});

it('refuses retained Event records before list/history assertions can be contaminated', async () => {
  exec
    .mockReturnValueOnce(JSON.stringify({ API_URL: 'http://127.0.0.1:56321' }))
    .mockReturnValueOnce('diy-instax-package-contracts')
    .mockReturnValueOnce(JSON.stringify({ events: 1, liveEvents: 0, unresolvedAttempts: 0 }));
  const { readLocalSupabaseStatus } = await import('../fixtures/test-stack.mjs');
  expect(() => readLocalSupabaseStatus()).toThrow('test stack is not empty');
});
