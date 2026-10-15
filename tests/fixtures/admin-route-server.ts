import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createChunks } from '@supabase/ssr';
import type { Session } from '@supabase/supabase-js';
import { localSupabaseStatus } from './local-supabase';

export function sessionCookies(session: Session) {
  return createChunks(
    'sb-127-auth-token',
    `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  )
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
}

// Keep the real local Auth identity/session and signature; move only the token's
// lifetime into the past so expiry can be tested without a one-hour sleep.
export function expiredSession(session: Session, refreshToken = 'expired-refresh-token'): Session {
  const payload = session.access_token.split('.')[1];
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const expiresAt = Math.floor(Date.now() / 1000) - 120;
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url'
  );
  const encodedPayload = Buffer.from(
    JSON.stringify({ ...claims, iat: expiresAt - 3600, exp: expiresAt })
  ).toString('base64url');
  // Local Supabase also accepts its CLI-provided symmetric JWT secret.
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', localSupabaseStatus().JWT_SECRET)
    .update(unsigned)
    .digest('base64url');
  return {
    ...session,
    access_token: `${unsigned}.${signature}`,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  };
}

export async function startAdminRouteServer() {
  const status = localSupabaseStatus();
  const origin = 'http://127.0.0.1:1436';
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    NEXT_TELEMETRY_DISABLED: '1',
  };
  // next dev intentionally replaces Cache-Control with no-store. Exercise the
  // built server so the assertions cover the response shipped to users.
  const build = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'build'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buildDiagnostics = '';
  for (const stream of [build.stdout, build.stderr]) {
    stream?.on('data', (chunk) => {
      buildDiagnostics = (buildDiagnostics + chunk.toString()).slice(-8000);
    });
  }
  const [buildExitCode] = await once(build, 'exit');
  if (buildExitCode !== 0) throw new Error(`Route server build failed: ${buildDiagnostics}`);
  const server: ChildProcess = spawn(
    process.execPath,
    [
      resolve('node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '1436',
    ],
    {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  // Suppress request details/tokens; retain bounded framework diagnostics for a
  // startup failure. The server is stopped even when startup fails.
  let diagnostics = '';
  for (const stream of [server.stdout, server.stderr]) {
    stream?.on('data', (chunk) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-8000);
    });
  }
  const stop = async () => {
    if (server.exitCode !== null) return;
    server.kill('SIGTERM');
    await once(server, 'exit');
  };
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (server.exitCode !== null) throw new Error(`Route server exited: ${diagnostics}`);
      try {
        const response = await fetch(`${origin}/`, { redirect: 'manual' });
        await response.text();
        return {
          stop,
          request: (path: string, cookie = '', rsc = false) =>
            fetch(`${origin}${path}${rsc ? '?_rsc' : ''}`, {
              redirect: 'manual',
              headers: { Cookie: cookie, ...(rsc ? { RSC: '1' } : {}) },
            }),
        };
      } catch {
        await new Promise((done) => setTimeout(done, 100));
      }
    }
    throw new Error(`Route server did not start: ${diagnostics}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
