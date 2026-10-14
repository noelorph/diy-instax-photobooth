import { execFileSync, spawn } from 'node:child_process';
const status = JSON.parse(
  execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
);
if (status.API_URL !== 'http://127.0.0.1:55321') throw new Error('Isolated local stack required.');
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  ADMIN_AUTH_ORIGIN: 'http://127.0.0.1:1437',
  NEXT_TELEMETRY_DISABLED: '1',
};
execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  env,
  stdio: 'inherit',
});
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '1437'],
  { env, stdio: 'inherit' }
);
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
