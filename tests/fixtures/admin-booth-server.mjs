import { readLocalSupabaseStatus } from './test-stack.mjs';
import { spawn } from 'node:child_process';
const port = process.argv[2];
if (!['1438', '1439'].includes(port)) throw new Error('Expected allowed simulator app port');
const local = readLocalSupabaseStatus();
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', port],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
      SUPABASE_SECRET_KEY: local.SERVICE_ROLE_KEY,
      ADMIN_AUTH_ORIGIN: `http://127.0.0.1:${port}`,
      BOOTH_SIMULATOR_ENABLED: 'true',
      NEXT_PUBLIC_BOOTH_SIMULATOR_CONTROLS: 'true',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  }
);
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
