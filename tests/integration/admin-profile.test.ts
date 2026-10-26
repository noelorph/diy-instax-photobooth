// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { saveProfile, changePassword, signOut } from '@/features/admin/profile/actions';
import { localSupabase, readProfile } from '../fixtures/local-supabase';
import { createPackageFixture } from '../fixtures/package-contract';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
describe('Profile actions with local Auth and RLS', () => {
  let local: ReturnType<typeof localSupabase>;
  beforeAll(() => {
    local = localSupabase();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    await local.cleanup();
  });
  async function adminSession() {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const device = await local.signIn(admin);
    vi.mocked(createClient).mockResolvedValue(device.client);
    return { admin, ...device };
  }
  it('persists phone and theme under the verified identity and allows clearing phone', async () => {
    const { admin, client } = await adminSession();
    const result = await saveProfile(
      {},
      form({ phone: '+63 917 123 4567', theme: 'dark', id: 'forged' })
    );
    expect(result.confirmation).toBeTruthy();
    expect((await readProfile(client)).data).toEqual([
      { id: admin.id, phone: '+63 917 123 4567', theme: 'dark' },
    ]);
    expect((await saveProfile({}, form({ phone: '', theme: 'light' }))).confirmation).toBeTruthy();
    expect((await readProfile(client)).data?.[0].phone).toBeNull();
  });
  it('reports a preference write failure without changing persisted values', async () => {
    const { client } = await adminSession();
    const from = client.from.bind(client);
    const failure = vi
      .spyOn(client, 'from')
      .mockImplementationOnce(from)
      .mockImplementationOnce(() => {
        throw new Error('connection lost');
      });
    const result = await saveProfile({}, form({ phone: '+639171234567', theme: 'dark' }));
    expect(result.error).toMatch(/could not be saved/);
    expect(result.confirmation).toBeUndefined();
    failure.mockRestore();
    expect((await readProfile(client)).data?.[0]).toMatchObject({ phone: null, theme: 'light' });
  });
  it('rejects invalid preferences without changing the saved row', async () => {
    const { client } = await adminSession();
    const result = await saveProfile({}, form({ phone: 'not a phone', theme: 'system' }));
    expect(result.fieldErrors?.phone).toBeTruthy();
    expect(result.fieldErrors?.theme).toBeTruthy();
    expect((await readProfile(client)).data?.[0].theme).toBe('light');
  });
  it('changes the actual password and reports validation and provider failure for retry', async () => {
    const { admin, client } = await adminSession();
    expect(
      (await changePassword({}, form({ password: 'short', confirmation: 'different' }))).fieldErrors
    ).toBeTruthy();
    const next = 'New-profile-password-123!';
    expect(
      (await changePassword({}, form({ password: next, confirmation: next }))).confirmation
    ).toBeTruthy();
    expect((await local.client().auth.signInWithPassword(admin)).error).not.toBeNull();
    expect(
      (await local.client().auth.signInWithPassword({ email: admin.email, password: next })).error
    ).toBeNull();
    vi.spyOn(client.auth, 'updateUser').mockResolvedValueOnce({
      data: { user: null },
      error: new AuthRetryableFetchError('private diagnostic', 503),
    });
    const failed = await changePassword({}, form({ password: next, confirmation: next }));
    expect(failed.error).toMatch(/try again/i);
    expect(JSON.stringify(failed)).not.toContain('private diagnostic');
  });
  it('locally signs out and immediately denies the old JWT while another device survives', async () => {
    const { admin, session } = await adminSession();
    const other = await local.signIn(admin);
    await expect(signOut({}, new FormData())).rejects.toMatchObject({
      digest: expect.stringContaining(';/sign-in;'),
    });
    expect((await readProfile(local.tokenClient(session.access_token))).data).toEqual([]);
    expect((await other.client.auth.refreshSession()).error).toBeNull();
    expect((await readProfile(other.client)).data?.[0].id).toBe(admin.id);
  });
  it('keeps the independent Booth grant active after Profile signs out this device', async () => {
    const fixture = await createPackageFixture();
    try {
      fixture.seedRun();
      const phone = await fixture.local.signIn(fixture.adminUser);
      vi.mocked(createClient).mockResolvedValue(fixture.adminClient);
      expect((await fixture.readBooth()).error).toBeNull();
      await expect(signOut({}, new FormData())).rejects.toThrow(/NEXT_REDIRECT/);
      expect((await fixture.readBooth()).error).toBeNull();
      expect((await readProfile(phone.client)).data).toHaveLength(1);
    } finally {
      await fixture.dispose();
    }
  });
  it('reports a failed local sign-out with a still-active session and permits retry', async () => {
    const { client, session } = await adminSession();
    vi.spyOn(client.auth.admin, 'signOut').mockResolvedValueOnce({
      data: null,
      error: new AuthRetryableFetchError('lost', 503),
    });
    const failed = await signOut({}, new FormData());
    expect(failed.error).toMatch(/still signed in.*try again/i);
    expect((await client.auth.getSession()).data.session).not.toBeNull();
    expect((await readProfile(client)).data).toHaveLength(1);
    expect((await readProfile(local.tokenClient(session.access_token))).data).toHaveLength(1);
    await expect(signOut(failed, new FormData())).rejects.toThrow(/NEXT_REDIRECT/);
  });
  it('redirects after an ambiguous sign-out failure if revocation actually committed', async () => {
    const { client, session } = await adminSession();
    const real = client.auth.admin.signOut.bind(client.auth.admin);
    vi.spyOn(client.auth.admin, 'signOut').mockImplementationOnce(async (jwt, scope) => {
      await real(jwt, scope);
      return { data: null, error: new AuthRetryableFetchError('lost response', 503) };
    });
    await expect(signOut({}, new FormData())).rejects.toThrow(/NEXT_REDIRECT/);
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect((await readProfile(local.tokenClient(session.access_token))).data).toEqual([]);
  });
  it('redirects after RLS confirms a revoked session even if local cookie cleanup throws', async () => {
    const { client, session } = await adminSession();
    vi.spyOn(client.auth, 'signOut').mockRejectedValue(new Error('cookie cleanup failed'));

    await expect(signOut({}, new FormData())).rejects.toThrow(/NEXT_REDIRECT/);
    expect((await readProfile(local.tokenClient(session.access_token))).data).toEqual([]);
  });
  it('denies direct mutations to an authenticated non-Admin and a revoked Admin', async () => {
    const outsider = await local.provisionUser();
    vi.mocked(createClient).mockResolvedValue((await local.signIn(outsider)).client);
    await expect(saveProfile({}, form({ phone: '', theme: 'dark' }))).rejects.toThrow(
      /NEXT_REDIRECT/
    );
    const { session, client } = await adminSession();
    await client.auth.signOut({ scope: 'global' });
    vi.mocked(createClient).mockResolvedValue(local.tokenClient(session.access_token));
    await expect(
      changePassword({}, form({ password: 'New-password-123!', confirmation: 'New-password-123!' }))
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
