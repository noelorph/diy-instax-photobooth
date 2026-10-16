import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
const status = JSON.parse(
  execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
);
if (status.API_URL !== 'http://127.0.0.1:55321') throw new Error('Isolated local stack required.');
const faultFile = resolve('test-results/events-read-fault');
rmSync(faultFile, { force: true });
const env = {
  ...process.env,
  EVENTS_READ_FAULT_FILE: faultFile,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
  ADMIN_AUTH_ORIGIN: 'http://127.0.0.1:1437',
  NEXT_TELEMETRY_DISABLED: '1',
};
execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  env,
  stdio: 'inherit',
});
const child = spawn(
  process.execPath,
  [
    '--import',
    resolve('tests/fixtures/events-read-fault.mjs'),
    'node_modules/next/dist/bin/next',
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    '1437',
  ],
  { env, stdio: 'inherit' }
);
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
