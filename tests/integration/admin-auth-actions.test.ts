// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { requestRecovery, signIn } from '@/features/admin/auth/actions';
import { localSupabase, localSupabaseStatus, readProfile } from '../fixtures/local-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('server-only', () => ({}));

function credentials(email: string, password: string) {
  const data = new FormData();
  data.set('email', email);
  data.set('password', password);
  return data;
}

describe('Public Admin sign-in action with local Auth', () => {
  let local: ReturnType<typeof localSupabase>;
  beforeAll(() => {
    local = localSupabase();
  });
  afterEach(async () => {
    vi.resetAllMocks();
    await local.cleanup();
  });

  it('rejects malformed fields before reaching Auth and never returns the password', async () => {
    const state = await signIn({ email: '' }, credentials('invalid', ''));
    expect(state).toEqual({
      email: 'invalid',
      fieldErrors: { email: 'Enter a valid email address.', password: 'Enter your password.' },
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(state).not.toHaveProperty('password');
  });

  it('opens dashboard only after Auth and the live Admin Profile check succeed', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const client = local.client();
    vi.mocked(createClient).mockResolvedValue(client);
    const data = credentials(admin.email, admin.password);
    data.set('next', 'https://untrusted.example/');
    await expect(signIn({ email: '' }, data)).rejects.toMatchObject({
      digest: expect.stringContaining(';/dashboard;'),
    });
    expect((await readProfile(client)).data?.map((row) => row.id)).toEqual([admin.id]);
  });

  it('denies and signs out a valid non-Admin locally while another session stays active', async () => {
    const nonAdmin = await local.provisionUser();
    const otherDevice = await local.signIn(nonAdmin);
    const client = local.client();
    vi.mocked(createClient).mockResolvedValue(client);
    const state = await signIn({ email: '' }, credentials(nonAdmin.email, nonAdmin.password));
    expect(state.error).toMatch(/email or password is incorrect/i);
    expect(state.email).toBe(nonAdmin.email);
    expect((await client.auth.getSession()).data.session).toBeNull();
    const active = await otherDevice.client.auth.refreshSession();
    expect(active.error).toBeNull();
    expect(active.data.user?.id).toBe(nonAdmin.id);
  });

  it('gives identical neutral credential feedback for wrong passwords and unknown addresses', async () => {
    const admin = await local.provisionUser();
    vi.mocked(createClient).mockImplementation(async () => local.client());
    const wrong = await signIn({ email: '' }, credentials(admin.email, 'Incorrect-password!'));
    const unknown = await signIn(
      { email: '' },
      credentials('unknown@example.test', 'Incorrect-password!')
    );
    expect(wrong.error).toBeTruthy();
    expect(unknown.error).toBe(wrong.error);
    expect(wrong.email).toBe(admin.email);
    expect(JSON.stringify(wrong)).not.toContain(admin.password);
  });

  it('reports a connection failure and succeeds when retried', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    vi.mocked(createClient)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(local.client());
    const data = credentials(admin.email, admin.password);
    const failed = await signIn({ email: '' }, data);
    expect(failed.error).toMatch(/connection.*try again/i);
    expect(failed.email).toBe(admin.email);
    await expect(signIn(failed, data)).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it('reports Auth service failure without leaking its diagnostic', async () => {
    const client = local.client();
    vi.spyOn(client.auth, 'signInWithPassword').mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('private service diagnostic', 503, 'unexpected_failure'),
    });
    vi.mocked(createClient).mockResolvedValue(client);
    const state = await signIn({ email: '' }, credentials('owner@example.test', 'password'));
    expect(state.error).toMatch(/connection.*try again/i);
    expect(JSON.stringify(state)).not.toContain('private service diagnostic');
  });

  it('signs out after an interrupted final authorization check', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const client = local.client();
    vi.spyOn(client, 'from').mockImplementation(() => {
      throw new TypeError('Lookup connection lost');
    });
    vi.mocked(createClient).mockResolvedValue(client);
    const state = await signIn({ email: '' }, credentials(admin.email, admin.password));
    expect(state.error).toMatch(/connection.*try again/i);
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
});

describe('Neutral recovery action and local Mailpit delivery', () => {
  let local: ReturnType<typeof localSupabase>;
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
    await local.cleanup();
  });

  it('validates the address before contacting Auth', async () => {
    const state = await requestRecovery({ email: '' }, credentials('invalid', ''));
    expect(state.fieldErrors?.email).toMatch(/valid email/i);
    expect(state.email).toBe('invalid');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('delivers a real Admin recovery email to Mailpit with a fixed callback and neutral unknown-address response', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const status = localSupabaseStatus();
    const cookies = new Map<string, string>();
    const client = createServerClient(status.API_URL, status.ANON_KEY, {
      cookies: {
        getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
        setAll: (values) => {
          for (const { name, value } of values) cookies.set(name, value);
        },
      },
    });
    vi.mocked(createClient).mockResolvedValue(client);
    const data = credentials(admin.email, '');
    data.set('redirectTo', 'https://untrusted.example/');
    data.set('origin', 'https://untrusted.example/');
    const known = await requestRecovery({ email: '' }, data);
    const unknown = await requestRecovery(
      { email: '' },
      credentials(`unknown-${randomUUID()}@example.test`, '')
    );
    expect(known.error).toBeUndefined();
    expect(known.confirmation).toMatch(/check your email/i);
    expect(unknown.confirmation).toBe(known.confirmation);
    expect(unknown.error).toBeUndefined();
    expect(Array.from(cookies.keys()).some((name) => name.endsWith('-code-verifier'))).toBe(true);

    let messageId: string | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await fetch(
        `http://127.0.0.1:55324/api/v1/search?query=${encodeURIComponent(`to:${admin.email}`)}`
      );
      expect(response.ok).toBe(true);
      const inbox = (await response.json()) as { messages: { ID: string }[] };
      messageId = inbox.messages[0]?.ID;
      if (messageId) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(messageId, 'A recovery email must arrive in the isolated Mailpit inbox').toBeTruthy();
    const response = await fetch(`http://127.0.0.1:55324/api/v1/message/${messageId}`);
    expect(response.ok).toBe(true);
    const message = (await response.json()) as { HTML: string };
    const href = message.HTML.match(/href="([^"]+)"/)?.[1];
    expect(Boolean(href)).toBe(true);
    const recoveryLink = new URL(href!.replaceAll('&amp;', '&'));
    // Assert only safe metadata: never print recovery tokens or the whole message.
    expect(recoveryLink.origin).toBe('http://127.0.0.1:55321');
    expect(recoveryLink.pathname).toBe('/auth/v1/verify');
    expect(recoveryLink.searchParams.get('type')).toBe('recovery');
    expect(recoveryLink.searchParams.get('redirect_to')).toBe(
      'http://127.0.0.1:3000/auth/callback'
    );
  }, 15000);

  it.each([
    '',
    'not-a-url',
    'http://production.example',
    'https://user:secret@production.example',
    'https://production.example/path',
    'https://production.example?next=evil',
    'https://production.example#fragment',
  ])('fails closed for an invalid configured origin (%s)', async (origin) => {
    vi.stubEnv('ADMIN_AUTH_ORIGIN', origin);
    const state = await requestRecovery({ email: '' }, credentials('owner@example.test', ''));
    expect(state.error).toMatch(/try again/i);
    expect(state.confirmation).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain('secret');
  });

  it('accepts an approved HTTPS origin from server configuration only', async () => {
    vi.stubEnv('ADMIN_AUTH_ORIGIN', 'https://admin.example.test');
    const client = local.client();
    const request = vi
      .spyOn(client.auth, 'resetPasswordForEmail')
      .mockResolvedValue({ data: {}, error: null });
    vi.mocked(createClient).mockResolvedValue(client);
    const state = await requestRecovery({ email: '' }, credentials('owner@example.test', ''));
    expect(state.confirmation).toMatch(/check your email/i);
    expect(request).toHaveBeenCalledWith('owner@example.test', {
      redirectTo: 'https://admin.example.test/auth/callback',
    });
  });

  it('keeps repeated known and unknown recovery requests publicly identical during a real cooldown', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const client = local.client();
    const request = vi.spyOn(client.auth, 'resetPasswordForEmail');
    vi.mocked(createClient).mockResolvedValue(client);
    const first = await requestRecovery({ email: '' }, credentials(admin.email, ''));
    const repeated = await requestRecovery(first, credentials(admin.email, ''));
    const cooldownResult = await request.mock.results[1].value;
    expect(cooldownResult.error?.code).toBe('over_email_send_rate_limit');
    const unknownEmail = `unknown-${randomUUID()}@example.test`;
    const unknown = await requestRecovery({ email: '' }, credentials(unknownEmail, ''));
    const repeatedUnknown = await requestRecovery(unknown, credentials(unknownEmail, ''));
    expect(repeated).toEqual(first);
    expect({ ...repeated, email: unknownEmail }).toEqual(unknown);
    expect(repeatedUnknown).toEqual(unknown);
    expect(repeated.error).toBeUndefined();
    expect(repeated.confirmation).toMatch(/check your email/i);
  });

  it.each([
    [
      'cooldown',
      new AuthApiError('private cooldown diagnostic', 429, 'over_email_send_rate_limit'),
    ],
    ['delivery', new AuthRetryableFetchError('private SMTP diagnostic', 500)],
    ['legacy delivery', new AuthApiError('private SMTP diagnostic', 500, 'unexpected_failure')],
    [
      'address authorization',
      new AuthApiError('private address diagnostic', 403, 'email_address_not_authorized'),
    ],
  ])('normalizes %s errors to unknown-address confirmation and permits retry', async (_, error) => {
    const client = local.client();
    vi.spyOn(client.auth, 'resetPasswordForEmail')
      .mockResolvedValueOnce({ data: null, error: error as AuthApiError })
      .mockResolvedValue({ data: {}, error: null });
    vi.mocked(createClient).mockResolvedValue(client);
    const data = credentials('owner@example.test', '');
    const accountFailure = await requestRecovery({ email: '' }, data);
    const unknown = await requestRecovery({ email: '' }, credentials('unknown@example.test', ''));
    expect({ ...accountFailure, email: 'unknown@example.test' }).toEqual(unknown);
    expect(accountFailure.error).toBeUndefined();
    expect(accountFailure.confirmation).toMatch(/check your email/i);
    expect(JSON.stringify(accountFailure)).not.toContain('private');
    expect(await requestRecovery(accountFailure, data)).toEqual(accountFailure);
  });

  it('shows retry failure only for address-independent connection loss', async () => {
    const client = local.client();
    vi.spyOn(client.auth, 'resetPasswordForEmail').mockResolvedValue({
      data: null,
      error: new AuthRetryableFetchError('private connection diagnostic', 0),
    });
    vi.mocked(createClient).mockResolvedValue(client);
    const known = await requestRecovery({ email: '' }, credentials('owner@example.test', ''));
    const unknown = await requestRecovery({ email: '' }, credentials('unknown@example.test', ''));
    expect(known.error).toMatch(/connection.*try again/i);
    expect(known.confirmation).toBeUndefined();
    expect({ ...known, email: 'unknown@example.test' }).toEqual(unknown);
    expect(JSON.stringify(known)).not.toContain('private');
  });

  it('normalizes a thrown Auth delivery error to the same neutral confirmation', async () => {
    const client = local.client();
    vi.spyOn(client.auth, 'resetPasswordForEmail')
      .mockRejectedValueOnce(new AuthRetryableFetchError('private delivery diagnostic', 500))
      .mockResolvedValue({ data: {}, error: null });
    vi.mocked(createClient).mockResolvedValue(client);
    const known = await requestRecovery({ email: '' }, credentials('owner@example.test', ''));
    const unknown = await requestRecovery({ email: '' }, credentials('unknown@example.test', ''));
    expect({ ...known, email: 'unknown@example.test' }).toEqual(unknown);
    expect(known.error).toBeUndefined();
    expect(known.confirmation).toMatch(/check your email/i);
  });
});
