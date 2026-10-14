// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { saveProfile, changePassword, signOut } from '@/features/admin/profile/actions';
import { localSupabase, readProfile } from '../fixtures/local-supabase';
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
  it('reports a failed local sign-out with a still-active session and permits retry', async () => {
    const { client } = await adminSession();
    vi.spyOn(client.auth, 'signOut').mockResolvedValueOnce({
      error: new AuthRetryableFetchError('lost', 503),
    });
    const failed = await signOut({}, new FormData());
    expect(failed.error).toMatch(/still signed in.*try again/i);
    expect((await readProfile(client)).data).toHaveLength(1);
    await expect(signOut(failed, new FormData())).rejects.toThrow(/NEXT_REDIRECT/);
  });
  it('redirects after an ambiguous sign-out failure if revocation actually committed', async () => {
    const { client } = await adminSession();
    const real = client.auth.signOut.bind(client.auth);
    vi.spyOn(client.auth, 'signOut').mockImplementationOnce(async () => {
      await real({ scope: 'local' });
      return { error: new AuthRetryableFetchError('lost response', 503) };
    });
    await expect(signOut({}, new FormData())).rejects.toThrow(/NEXT_REDIRECT/);
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
