import { testStack } from './test-stack.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createPackageFixture, type PackageFixture } from './package-contract';
import { DetailedError, Upload } from 'tus-js-client';
import { localSupabaseStatus, localOwnerSql, setPackageCreationDefault } from './local-supabase';

export async function createPackageBrowserFixture(): Promise<PackageFixture> {
  const policy = String(
    localOwnerSql('select mode from public.printer_completion_policy where id')[0].mode
  );
  if (!['disabled', 'simulated', 'instax-development'].includes(policy))
    throw new Error('Unexpected local printer policy.');
  const restoreDefault = setPackageCreationDefault();
  try {
    const fixture = await createPackageFixture();
    return {
      ...fixture,
      async dispose() {
        try {
          try {
            const media = await fixture.local.service.storage
              .from('event_media')
              .list(fixture.eventId);
            if (media.error) throw media.error;
            if (media.data.length) {
              const removed = await fixture.local.service.storage
                .from('event_media')
                .remove(media.data.map((asset) => `${fixture.eventId}/${asset.name}`));
              if (removed.error) throw removed.error;
            }
          } finally {
            try {
              await fixture.dispose();
            } finally {
              cleanupMediaFixtureBackend(fixture.eventId);
            }
          }
        } finally {
          try {
            localOwnerSql(`update public.printer_completion_policy set mode='${policy}' where id`);
          } finally {
            restoreDefault();
          }
        }
      },
    };
  } catch (error) {
    restoreDefault();
    throw error;
  }
}

// Observe the real database waiter before changing authority, rather than relying on a sleep.
export async function withMediaEventHeld<T>(
  eventId: string,
  work: () => Promise<T>,
  duringHold: () => void
): Promise<T> {
  return withMediaLockHeld(
    `select id from public.events where id='${eventId}' for update`,
    work,
    duringHold
  );
}

// Characterize the installed Storage v1.79.36 completion boundary after bytes and authorization.
export async function withMediaCommitHeld<T>(
  path: string,
  work: () => Promise<T>,
  duringHold: () => Promise<void>
) {
  let hash = 5381;
  for (const char of `event_media/${path}`) hash = (hash * 33) ^ char.charCodeAt(0);
  return withMediaLockHeld(`select pg_advisory_xact_lock(${hash >>> 0})`, work, duringHold);
}

async function withMediaLockHeld<T>(
  lockSql: string,
  work: () => Promise<T>,
  duringHold: () => void | Promise<void>
): Promise<T> {
  const child = spawn('docker', [
    'exec',
    '-i',
    testStack.databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
  ]);
  const done = once(child, 'exit');
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stdin.write(`begin;\n${lockSql};\nselect 'HOLDER:'||pg_backend_pid();\n`);
  let pending: Promise<T> | undefined;
  try {
    const deadline = Date.now() + 10_000;
    while (!/HOLDER:\d+\r?\n/.test(output)) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error('Media Event holder did not acquire lock');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const holder = Number(output.match(/HOLDER:(\d+)/)?.[1]);
    pending = work();
    while (
      !localOwnerSql(
        `select exists(select 1 from pg_stat_activity where ${holder}=any(pg_blocking_pids(pid))) waiting`
      )[0].waiting
    ) {
      if (Date.now() > deadline) throw new Error('Media operation did not wait on Event lock');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await duringHold();
  } finally {
    child.stdin.end('rollback;\n\\q\n');
    await done;
    if (pending) await pending;
  }
  return pending!;
}

// Read-only byte evidence scoped to one synthetic Event; never used by product cleanup.
export function mediaFixtureBackendFiles(eventId: string): { name: string; bytes: number }[] {
  if (!/^[a-f0-9-]{36}$/.test(eventId)) throw new Error('Expected fixture Event UUID');
  localSupabaseStatus();
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'exec',
        testStack.storageContainer,
        'node',
        '-e',
        `
    const fs=require('node:fs'), path=require('node:path');
    const root='/mnt/stub', event=process.argv[1], found=[];
    for (const tenant of fs.readdirSync(root)) {
      const dir=path.join(root,tenant,'event_media',event);
      if (!fs.existsSync(dir)) continue;
      const walk=p=>{ for(const item of fs.readdirSync(p,{withFileTypes:true})) {
        const file=path.join(p,item.name);
        if(item.isDirectory()) walk(file); else found.push({name:path.relative(dir,file),bytes:fs.statSync(file).size});
      }}; walk(dir);
    }
    process.stdout.write(JSON.stringify(found));
  `,
        eventId,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
  );
}

// Teardown only, after product assertions: remove this fixture's leftover TUS metadata/bytes.
function cleanupMediaFixtureBackend(eventId: string) {
  if (!/^[a-f0-9-]{36}$/.test(eventId)) throw new Error('Expected fixture Event UUID');
  localSupabaseStatus();
  execFileSync(
    'docker',
    [
      'exec',
      testStack.storageContainer,
      'node',
      '-e',
      `
    const fs=require('node:fs'), path=require('node:path'), root='/mnt/stub';
    for(const tenant of fs.readdirSync(root)) fs.rmSync(path.join(root,tenant,'event_media',process.argv[1]), {recursive:true,force:true});
  `,
      eventId,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

export async function terminateMediaFixtureUpload(url: string) {
  const status = localSupabaseStatus();
  if (!url.startsWith(`${status.API_URL}/storage/v1/upload/resumable/`))
    throw new Error('Fixture termination requires the isolated local Storage endpoint.');
  try {
    await Upload.terminate(url, {
      headers: { authorization: `Bearer ${status.SERVICE_ROLE_KEY}` },
      retryDelays: [],
    });
  } catch (error) {
    if (error instanceof DetailedError && error.originalResponse?.getStatus() === 404) return;
    // Never include TUS request headers/credentials in a thrown fixture diagnostic.
    throw new Error('Local fixture upload termination failed.');
  }
}
