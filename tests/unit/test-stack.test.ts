// @vitest-environment node
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const exec = vi.hoisted(() => vi.fn());
const files = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  cpSync: vi.fn(),
}));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    ...files,
    readFileSync: (path: string, encoding: BufferEncoding) =>
      path === 'supabase/config.toml'
        ? actual.readFileSync(path, encoding)
        : 'project_id = "another-project"',
  };
});
vi.mock('node:child_process', () => ({ execFileSync: exec }));
beforeEach(() => {
  vi.stubEnv('INSTAX_TEST_WORKDIR', undefined);
  vi.stubEnv('INSTAX_TEST_PROFILE', undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  exec.mockReset();
  files.existsSync.mockReset().mockReturnValue(false);
  files.writeFileSync.mockReset();
  files.mkdirSync.mockReset();
  files.cpSync.mockReset();
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
    .mockReturnValueOnce(JSON.stringify({ events: 0, liveEvents: 0, unresolvedAttempts: 0 }));
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

it('selects the fixed integration stack and workdir automatically', async () => {
  vi.stubEnv('INSTAX_TEST_PROFILE', 'integration');
  const { testStack, testStackWorkdir, readLocalSupabaseStatus } =
    await import('../fixtures/test-stack.mjs');
  expect(testStackWorkdir).toBe(resolve('.worktrees/instax-verification-stack'));
  expect(testStack).toEqual({
    projectId: 'diy-instax-integration-verification',
    apiUrl: 'http://127.0.0.1:61321',
    mailpitUrl: 'http://127.0.0.1:61324',
    databaseContainer: 'supabase_db_diy-instax-integration-verification',
    storageContainer: 'supabase_storage_diy-instax-integration-verification',
  });
  exec
    .mockReturnValueOnce(JSON.stringify({ API_URL: testStack.apiUrl, ANON_KEY: 'fixture-key' }))
    .mockReturnValueOnce(testStack.projectId)
    .mockReturnValueOnce(JSON.stringify({ events: 0, liveEvents: 0, unresolvedAttempts: 0 }));
  expect(readLocalSupabaseStatus().ANON_KEY).toBe('fixture-key');
  expect(exec.mock.calls[0][1]).toContain(testStackWorkdir);
});

it.each(['unknown', 'retirement', ' integration'])(
  'rejects unknown profile %s before subprocesses',
  async (profile) => {
    vi.stubEnv('INSTAX_TEST_PROFILE', profile);
    await expect(import('../fixtures/test-stack.mjs')).rejects.toThrow(
      'Unknown INSTAX_TEST_PROFILE'
    );
    expect(exec).not.toHaveBeenCalled();
  }
);

it('rejects conflicting integration workdir before subprocesses', async () => {
  vi.stubEnv('INSTAX_TEST_PROFILE', 'integration');
  vi.stubEnv('INSTAX_TEST_WORKDIR', '/tmp/another-stack');
  await expect(import('../fixtures/test-stack.mjs')).rejects.toThrow('fixed integration workdir');
  expect(exec).not.toHaveBeenCalled();
});

it.each(['http://127.0.0.1:56321', 'http://127.0.0.1:58321', 'https://example.supabase.co'])(
  'integration rejects endpoint %s',
  async (url) => {
    vi.stubEnv('INSTAX_TEST_PROFILE', 'integration');
    exec.mockReturnValueOnce(JSON.stringify({ API_URL: url }));
    const { readLocalSupabaseStatus } = await import('../fixtures/test-stack.mjs');
    expect(() => readLocalSupabaseStatus()).toThrow('local test stack');
    expect(exec).toHaveBeenCalledTimes(1);
  }
);

it.each([
  { events: 1, liveEvents: 1, unresolvedAttempts: 0 },
  { events: 1, liveEvents: 0, unresolvedAttempts: 1 },
  { events: 1, liveEvents: 0, unresolvedAttempts: 0 },
])('integration retains existing work %j', async (existing) => {
  vi.stubEnv('INSTAX_TEST_PROFILE', 'integration');
  exec
    .mockReturnValueOnce(JSON.stringify({ API_URL: 'http://127.0.0.1:61321' }))
    .mockReturnValueOnce('diy-instax-integration-verification')
    .mockReturnValueOnce(JSON.stringify(existing));
  const { readLocalSupabaseStatus } = await import('../fixtures/test-stack.mjs');
  expect(() => readLocalSupabaseStatus()).toThrow();
  expect(exec).toHaveBeenCalledTimes(3);
});

it('integration refuses a mismatched project label before reading records', async () => {
  vi.stubEnv('INSTAX_TEST_PROFILE', 'integration');
  exec
    .mockReturnValueOnce(JSON.stringify({ API_URL: 'http://127.0.0.1:61321' }))
    .mockReturnValueOnce('diy-instax-retirement-verification');
  const { readLocalSupabaseStatus } = await import('../fixtures/test-stack.mjs');
  expect(() => readLocalSupabaseStatus()).toThrow('another project');
  expect(exec).toHaveBeenCalledTimes(2);
});

it.each([
  {
    profile: undefined,
    directory: '.worktrees/verification-stack',
    project: 'diy-instax-retirement-verification',
    ports: [58321, 58322, 58320, 58329, 58323, 58324, 58327],
  },
  {
    profile: 'integration',
    directory: '.worktrees/instax-verification-stack',
    project: 'diy-instax-integration-verification',
    ports: [61321, 61322, 61320, 61329, 61323, 61324, 61327],
  },
])(
  'startup prepares only the selected fixed stack: $project',
  async ({ profile, directory, project, ports }) => {
    vi.stubEnv('INSTAX_TEST_PROFILE', profile);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await import('../fixtures/start-verification-stack.mjs');
      const [destination, config] = files.writeFileSync.mock.calls[0] as unknown as [
        string,
        string,
      ];
      expect(destination).toBe(resolve(directory, 'supabase/config.toml'));
      expect(config).toContain(`project_id = "${project}"`);
      expect(
        [...config.matchAll(/^(?:port|shadow_port) = (\d+)$/gm)].map((match) => Number(match[1]))
      ).toEqual(ports);
      expect(config).toContain('sql_paths = []');
      expect(exec.mock.calls.map((call) => call[1])).toEqual([
        [
          'start',
          '--workdir',
          resolve(directory),
          '-x',
          'studio,postgres-meta,edge-runtime,imgproxy',
        ],
      ]);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          profile ? 'INSTAX_TEST_PROFILE=integration' : 'INSTAX_TEST_WORKDIR='
        )
      );
    } finally {
      log.mockRestore();
    }
  }
);

it('startup refuses a conflicting config without writes or subprocesses', async () => {
  vi.stubEnv('INSTAX_TEST_PROFILE', 'integration');
  files.existsSync.mockReturnValue(true);
  await expect(import('../fixtures/start-verification-stack.mjs')).rejects.toThrow(
    'conflicting generated config'
  );
  expect(files.writeFileSync).not.toHaveBeenCalled();
  expect(files.cpSync).not.toHaveBeenCalled();
  expect(exec).not.toHaveBeenCalled();
});

it.each(['unknown', 'integration'])(
  'startup rejects invalid selection before filesystem mutation: %s',
  async (profile) => {
    vi.stubEnv('INSTAX_TEST_PROFILE', profile);
    vi.stubEnv('INSTAX_TEST_WORKDIR', '/tmp/conflicting-stack');
    await expect(import('../fixtures/start-verification-stack.mjs')).rejects.toThrow();
    expect(files.mkdirSync).not.toHaveBeenCalled();
    expect(files.writeFileSync).not.toHaveBeenCalled();
    expect(files.cpSync).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  }
);

it('accepts the integration workdir when it resolves to the fixed path', async () => {
  vi.stubEnv('INSTAX_TEST_PROFILE', 'integration');
  vi.stubEnv('INSTAX_TEST_WORKDIR', '.worktrees/../.worktrees/instax-verification-stack');
  const { testStackWorkdir } = await import('../fixtures/test-stack.mjs');
  expect(testStackWorkdir).toBe(resolve('.worktrees/instax-verification-stack'));
});
