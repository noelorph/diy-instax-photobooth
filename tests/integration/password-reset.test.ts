import { testStack } from '../fixtures/test-stack.mjs';
// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AuthApiError } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';
import { requestRecovery } from '@/features/admin/auth/actions';
import { resetPassword } from '@/features/admin/auth/reset-action';
import { GET } from '@/app/auth/callback/route';
import { GET as boothState } from '@/app/api/booth/state/route';
import { hashSecret } from '@/lib/operations/booth-authority';
import {
  cleanupEvents,
  localOwnerSql,
  localSupabase,
  localSupabaseStatus,
  ownerInsert,
  ownerUpdate,
  readProfile,
} from '../fixtures/local-supabase';
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('server-only', () => ({}));

function passwords(password: string, confirmation = password) {
  const data = new FormData();
  data.set('password', password);
  data.set('confirmation', confirmation);
  return data;
}

describe('Password recovery through local Mailpit, PKCE and active-session RLS', () => {
  let local: ReturnType<typeof localSupabase>;
  const packageEventIds: string[] = [];
  beforeAll(() => {
    local = localSupabase();
  });
  beforeEach(() => {
    vi.stubEnv('ADMIN_AUTH_ORIGIN', 'http://127.0.0.1:3000');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    cleanupEvents(packageEventIds.splice(0));
    await local.cleanup();
  });

  async function recovery() {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const status = localSupabaseStatus();
    const jar = new Map<string, string>();
    const client = createServerClient(status.API_URL, status.ANON_KEY, {
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (values) => {
          for (const { name, value } of values) jar.set(name, value);
        },
      },
    });
    vi.mocked(createClient).mockResolvedValue(client);
    const form = new FormData();
    form.set('email', admin.email);
    expect((await requestRecovery({ email: '' }, form)).confirmation).toBeTruthy();
    let id: string | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      const inbox = await fetch(
        `${testStack.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${admin.email}`)}`
      ).then((r) => r.json());
      id = inbox.messages[0]?.ID;
      if (id) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(Boolean(id), 'Recovery email delivered').toBe(true);
    const message = await fetch(`${testStack.mailpitUrl}/api/v1/message/${id}`).then((r) =>
      r.json()
    );
    const href = message.HTML.match(/href="([^"]+)"/)?.[1];
    expect(Boolean(href)).toBe(true);
    const verified = await fetch(href.replaceAll('&amp;', '&'), { redirect: 'manual' });
    const callback = new URL(verified.headers.get('location')!);
    expect(callback.origin).toBe('http://127.0.0.1:3000');
    expect(Boolean(callback.searchParams.get('code'))).toBe(true);
    return { admin, client, callback };
  }

  it('resets through the delivered link, revokes two existing sessions and recovery, then allows fresh sign-in', async () => {
    const { admin, client, callback } = await recovery();
    const first = await local.signIn(admin);
    const second = await local.signIn(admin);
    const status = localSupabaseStatus();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', status.API_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', status.ANON_KEY);
    vi.stubEnv('SUPABASE_SECRET_KEY', status.SERVICE_ROLE_KEY);
    const eventId = randomUUID(),
      runId = randomUUID(),
      grantId = randomUUID();
    const secret = '9'.repeat(64),
      deviceHash = 'd'.repeat(64);
    packageEventIds.push(eventId);
    ownerInsert('events', {
      id: eventId,
      accounting_version: 2,
      title: 'Reset grant fixture',
      client_name: 'Client',
      client_email: 'reset@example.test',
      client_phone: '123',
      venue_address: 'Hall',
      time_zone: 'Asia/Manila',
      starts_at: '2026-12-01T10:00:00Z',
      ends_at: '2026-12-01T12:00:00Z',
      film_package_count: 1,
    });
    ownerUpdate('events', eventId, { state: 'Live', revision: 2 });
    ownerInsert('booth_runs', {
      id: runId,
      event_id: eventId,
      accounting_version: 2,
      state: 'Active',
      device_hash: deviceHash,
      printer_id: 'fixture-printer',
      film_loaded_confirmed: true,
      power_confirmed: true,
      guided_access_confirmed: true,
    });
    ownerInsert('booth_grants', {
      id: grantId,
      event_id: eventId,
      run_id: runId,
      accounting_version: 2,
      state: 'Active',
      secret_hash: hashSecret(secret),
      device_hash: deviceHash,
      expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    });
    const boothRequest = () =>
      new Request('https://booth.test/api/booth/state', {
        headers: { cookie: `__Host-booth-grant=${secret}` },
      });
    expect((await boothState(boothRequest())).status).toBe(200);
    const response = await GET(new Request(callback));
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/reset-password');
    const temporary = (await client.auth.getSession()).data.session!;
    expect(Boolean(temporary)).toBe(true);
    const newPassword = `Reset-${randomUUID()}!`;
    expect((await resetPassword({}, passwords(newPassword))).confirmation).toMatch(/sign in/i);
    const ids = [first.session, second.session, temporary].map(
      (session) =>
        JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString())
          .session_id as string
    );
    expect(
      localOwnerSql(
        `select count(*)::integer n from auth.sessions where id in (${ids.map((id) => `'${id}'`).join(',')})`
      )[0].n
    ).toBe(0);
    const afterReset = await boothState(boothRequest());
    expect(afterReset.status).toBe(200);
    expect((await afterReset.json()).runId).toBe(runId);
    for (const session of [first.session, second.session, temporary]) {
      expect(session.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect((await readProfile(local.tokenClient(session.access_token))).data).toEqual([]);
      const update = await local
        .tokenClient(session.access_token)
        .from('admin_profiles')
        .update({ phone: 'forbidden' })
        .eq('id', admin.id)
        .select('id');
      expect(update.data).toEqual([]);
    }
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect((await local.client().auth.signInWithPassword(admin)).error).not.toBeNull();
    const fresh = await local.signIn({ email: admin.email, password: newPassword });
    expect((await readProfile(fresh.client)).data?.map((row) => row.id)).toEqual([admin.id]);
  }, 15000);

  it('completes after global revocation even when local recovery cleanup throws', async () => {
    const { admin, client, callback } = await recovery();
    const first = await local.signIn(admin);
    const second = await local.signIn(admin);
    await GET(new Request(callback));
    const temporary = (await client.auth.getSession()).data.session!;
    vi.spyOn(client.auth, 'signOut').mockRejectedValueOnce(new Error('local cleanup failed'));

    const newPassword = `Reset-${randomUUID()}!`;
    const result = await resetPassword({}, passwords(newPassword));

    expect(result.confirmation).toMatch(/all Admin sessions have ended/i);
    expect(result.error).toBeUndefined();
    expect(result.revocationIncomplete).toBeUndefined();
    for (const session of [first.session, second.session, temporary]) {
      expect((await readProfile(local.tokenClient(session.access_token))).data).toEqual([]);
    }
    const fresh = await local.signIn({ email: admin.email, password: newPassword });
    expect((await readProfile(fresh.client)).data?.map((row) => row.id)).toEqual([admin.id]);
  }, 15000);

  it('rejects mismatched and short passwords while leaving the recovery link usable', async () => {
    const { client, callback } = await recovery();
    await GET(new Request(callback));
    expect(
      (await resetPassword({}, passwords('Valid-new-password!', 'different'))).fieldErrors
        ?.confirmation
    ).toMatch(/match/i);
    expect((await resetPassword({}, passwords('short'))).fieldErrors?.password).toMatch(/12/i);
    expect((await resetPassword({}, passwords('Valid-new-password!'))).confirmation).toBeTruthy();
    expect((await client.auth.getSession()).data.session).toBeNull();
  }, 15000);

  it('does not complete a first reset that reuses the current password', async () => {
    const { admin, client, callback } = await recovery();
    const other = await local.signIn(admin);
    await GET(new Request(callback));

    const result = await resetPassword({}, passwords(admin.password));

    expect(result.confirmation).toBeUndefined();
    expect(result.fieldErrors?.password ?? result.error).toMatch(/different password/i);
    expect((await client.auth.getSession()).data.session).not.toBeNull();
    expect((await readProfile(local.tokenClient(other.session.access_token))).data).toEqual([
      expect.objectContaining({ id: admin.id }),
    ]);
    expect((await local.client().auth.signInWithPassword(admin)).error).toBeNull();
  }, 15000);

  it('rejects an ordinary password session even when the submitted state claims recovery', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const { client } = await local.signIn(admin);
    vi.mocked(createClient).mockResolvedValue(client);
    const result = await resetPassword(
      { confirmation: 'forged success' },
      passwords('Attacker-new-password!')
    );
    expect(result.invalidLink).toBe(true);
    expect((await local.client().auth.signInWithPassword(admin)).error).toBeNull();
  });

  it.each(['https://untrusted.example/', '//untrusted.example/', '/dashboard'])(
    'rejects unapproved callback redirect %s without exchanging the code',
    async (next) => {
      const { callback, client } = await recovery();
      callback.searchParams.set('next', next);
      const response = await GET(new Request(callback));
      expect(response.headers.get('location')).toBe(
        'http://127.0.0.1:3000/reset-password?error=invalid-link'
      );
      expect((await client.auth.getSession()).data.session).toBeNull();
    },
    15000
  );

  it('rejects invalid and reused codes even with an existing password session', async () => {
    const { admin, client, callback } = await recovery();
    const invalid = new URL(callback);
    invalid.searchParams.set('code', 'invalid');
    expect((await GET(new Request(invalid))).headers.get('location')).toContain(
      'error=invalid-link'
    );
    await GET(new Request(callback));
    expect((await GET(new Request(callback))).headers.get('location')).toContain(
      'error=invalid-link'
    );
    // A failed exchange must not silently fall back to an already authenticated session.
    expect((await resetPassword({}, passwords('Another-new-password!'))).invalidLink).toBe(true);
    expect((await local.client().auth.signInWithPassword(admin)).error).toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
  }, 15000);
  it('rejects a genuinely expired PKCE code without changing the password', async () => {
    const { admin, callback, client } = await recovery();
    // Move only this fixture's Auth flow clock; observe denial through the real callback.
    execFileSync(
      'docker',
      [
        'exec',
        testStack.databaseContainer,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `update auth.flow_state set created_at = now() - interval '1 day', auth_code_issued_at = now() - interval '1 day' where user_id = '${admin.id}'::uuid;`,
      ],
      { stdio: 'pipe' }
    );
    expect((await GET(new Request(callback))).headers.get('location')).toContain(
      'error=invalid-link'
    );
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect((await resetPassword({}, passwords('Expired-new-password!'))).invalidLink).toBe(true);
    expect((await local.client().auth.signInWithPassword(admin)).error).toBeNull();
  }, 15000);

  it('keeps a saved reset incomplete until revocation succeeds with a different password', async () => {
    const { callback, client, admin } = await recovery();
    await GET(new Request(callback));
    vi.spyOn(client.auth.admin, 'signOut').mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('private outage diagnostic', 503, 'unexpected_failure'),
    });
    const firstPassword = 'Retry-new-password!';
    const failed = await resetPassword({}, passwords(firstPassword));
    expect(failed.confirmation).toBeUndefined();
    expect(failed.revocationIncomplete).toBe(true);
    expect(failed.error).toMatch(/password was saved.*sessions could not all be ended/i);
    expect(failed.error).toMatch(/different password/i);
    expect(JSON.stringify(failed)).not.toContain('private outage diagnostic');
    expect((await client.auth.getSession()).data.session).not.toBeNull();
    const samePassword = await resetPassword(failed, passwords(firstPassword));
    expect(samePassword.confirmation).toBeUndefined();
    expect(samePassword.fieldErrors?.password).toMatch(/different password/i);
    const secondPassword = 'Retry-different-password!';
    expect((await resetPassword(samePassword, passwords(secondPassword))).confirmation).toMatch(
      /all Admin sessions have ended/i
    );
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(
      (await local.signIn({ email: admin.email, password: secondPassword })).session
    ).toBeTruthy();
    expect(
      (
        await local
          .client()
          .auth.signInWithPassword({ email: admin.email, password: firstPassword })
      ).error
    ).not.toBeNull();
  }, 15000);

  it('requests a new recovery link when global revocation committed but its response was lost', async () => {
    const { callback, client, admin } = await recovery();
    const other = await local.signIn(admin);
    await GET(new Request(callback));
    const temporary = (await client.auth.getSession()).data.session!;
    const real = client.auth.admin.signOut.bind(client.auth.admin);
    vi.spyOn(client.auth.admin, 'signOut').mockImplementationOnce(async (jwt, scope) => {
      await real(jwt, scope);
      throw new TypeError('lost response');
    });

    const result = await resetPassword({}, passwords('Saved-after-lost-response!'));

    expect(result.confirmation).toBeUndefined();
    expect(result.requiresNewLink).toBe(true);
    expect(result.error).toMatch(/could not confirm.*all Admin sessions/i);
    expect(result.error).toMatch(/request another recovery link/i);
    expect(result.error).not.toMatch(/enter a different password/i);
    expect((await readProfile(local.tokenClient(temporary.access_token))).data).toEqual([]);
    expect((await readProfile(local.tokenClient(other.session.access_token))).data).toEqual([]);
  }, 15000);

  it('keeps all-session revocation uncertain when the live-session check is unavailable', async () => {
    const { callback, client } = await recovery();
    await GET(new Request(callback));
    vi.spyOn(client.auth.admin, 'signOut').mockImplementationOnce(async () => {
      vi.spyOn(client, 'from').mockImplementationOnce(() => {
        throw new TypeError('RLS probe offline');
      });
      return { data: null, error: new AuthApiError('lost response', 503, 'unexpected_failure') };
    });

    const result = await resetPassword({}, passwords('Saved-without-verification!'));

    expect(result.confirmation).toBeUndefined();
    expect(result.requiresNewLink).toBe(true);
    expect(result.error).toMatch(/could not confirm whether all Admin sessions ended/i);
    expect(result.error).not.toMatch(/enter a different password/i);
  }, 15000);

  it('keeps callback destinations fixed despite foreign request hosts and rejects missing configuration', async () => {
    const response = await GET(
      new Request('https://untrusted.example/auth/callback?error=access_denied')
    );
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:3000/reset-password?error=invalid-link'
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    vi.stubEnv('ADMIN_AUTH_ORIGIN', '');
    const unavailable = await GET(new Request('https://untrusted.example/auth/callback'));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('location')).toBeNull();
  });
});
