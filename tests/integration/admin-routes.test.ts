// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { localSupabase } from '../fixtures/local-supabase';
import {
  expiredSession,
  sessionCookies,
  startAdminRouteServer,
} from '../fixtures/admin-route-server';

const destinations = ['/dashboard', '/events', '/history'];

function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toContain('private');
  expect(response.headers.get('cache-control')).toContain('no-store');
}

async function expectDenied(response: Response) {
  const body = await response.text();
  // Cache Components may stream a redirect after sending a neutral fallback.
  const destination =
    response.headers.get('location') ??
    body.match(/url=([^"<>]+)/)?.[1] ??
    body.match(/NEXT_REDIRECT;[^;]+;([^;]+);/)?.[1] ??
    '';
  expect(destination).toContain('/sign-in');
  expect(body).not.toContain('Admin foundation');
  expect(body).not.toContain('Event management is not available yet');
  expect(body).not.toContain('Event history is not available yet');
  expectPrivate(response);
}

describe('Admin page responses with local Auth sessions', () => {
  let local: ReturnType<typeof localSupabase>;
  let routes: Awaited<ReturnType<typeof startAdminRouteServer>>;
  beforeAll(async () => {
    local = localSupabase();
    routes = await startAdminRouteServer();
  }, 60000);
  afterEach(async () => local?.cleanup());
  afterAll(async () => routes?.stop());

  async function adminSession() {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    return local.signIn(admin);
  }

  it('redirects signed-out direct HTML and RSC requests without protected content', async () => {
    for (const destination of destinations) {
      for (const rsc of [false, true]) {
        await expectDenied(await routes.request(destination, '', rsc));
      }
    }
  }, 60000);

  it('renders truthful protected foundation pages only for the provisioned Admin', async () => {
    const { session } = await adminSession();
    for (const destination of destinations) {
      for (const rsc of [false, true]) {
        const response = await routes.request(destination, sessionCookies(session), rsc);
        const body = await response.text();
        expect(response.status).toBe(200);
        if (rsc) expect(response.headers.get('content-type')).toContain('text/x-component');
        expect(body).toContain('Admin foundation');
        expect(body).toContain('not available yet');
        expect(body).not.toMatch(/Start Booth|Resume Booth|Test Print|Create Event|<button/);
        expect(body).not.toContain(session.access_token);
        expect(body).not.toContain(session.refresh_token);
        expectPrivate(response);
      }
    }
  });

  it('denies a real signed-in identity that is not on the Admin allowlist', async () => {
    const nonAdmin = await local.provisionUser();
    const { session } = await local.signIn(nonAdmin);
    for (const destination of destinations) {
      await expectDenied(await routes.request(destination, sessionCookies(session)));
    }
  });

  it('denies an expired signed Admin token when its refresh credential is unavailable', async () => {
    const { session } = await adminSession();
    const expired = expiredSession(session);
    const verification = await local.client().auth.getClaims(expired.access_token);
    expect(verification.error).not.toBeNull();
    for (const destination of destinations) {
      await expectDenied(await routes.request(destination, sessionCookies(expired)));
    }
  });

  it('immediately denies two original unexpired Admin JWTs after global revocation', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const first = await local.signIn(admin);
    const second = await local.signIn(admin);
    expect((await routes.request('/dashboard', sessionCookies(first.session))).status).toBe(200);
    expect((await routes.request('/dashboard', sessionCookies(second.session))).status).toBe(200);
    expect((await first.client.auth.signOut({ scope: 'global' })).error).toBeNull();
    for (const { session } of [first, second]) {
      expect(session.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
      for (const destination of destinations) {
        for (const rsc of [false, true]) {
          const response = await routes.request(destination, sessionCookies(session), rsc);
          // The original still-unexpired JWT is replayed; refresh must not mask
          // the final live-session check by swapping it for a fresh credential.
          expect(response.headers.get('set-cookie')).toBeNull();
          await expectDenied(response);
        }
      }
    }
  });

  it('refreshes an expired Auth cookie and makes the response private and uncached', async () => {
    const { session } = await adminSession();
    const expired = expiredSession(session, session.refresh_token);
    const response = await routes.request('/dashboard', sessionCookies(expired));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('Admin foundation');
    expect(response.headers.get('set-cookie')).toContain('sb-127-auth-token');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expectPrivate(response);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const revisit = await routes.request('/history', cookie);
    expect(await revisit.text()).toContain('Admin foundation');
  });

  it('sends root requests to the public or protected entry for the current session', async () => {
    await expectDenied(await routes.request('/'));
    const { session } = await adminSession();
    const response = await routes.request('/', sessionCookies(session));
    const body = await response.text();
    expect(response.headers.get('location') ?? body).toContain('/dashboard');
    expectPrivate(response);
  });
});
