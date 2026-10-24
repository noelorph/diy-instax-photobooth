import { execFileSync, spawn } from 'node:child_process';
const local = JSON.parse(
  execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
);
if (local.API_URL !== 'http://127.0.0.1:56321') throw new Error('Isolated local stack required');
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '1439'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
      SUPABASE_SECRET_KEY: local.SERVICE_ROLE_KEY,
      ADMIN_AUTH_ORIGIN: 'http://127.0.0.1:1439',
      BOOTH_SIMULATOR_ENABLED: 'true',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  }
);
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
