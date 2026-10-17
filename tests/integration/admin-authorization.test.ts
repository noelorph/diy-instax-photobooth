// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { localSupabase, readProfile } from '../fixtures/local-supabase';

describe('Admin authorization through local Auth and the Data API', () => {
  let local: ReturnType<typeof localSupabase>;

  beforeAll(() => {
    local = localSupabase();
  });
  afterEach(async () => {
    await local?.cleanup();
  });

  it('lets the provisioned Admin read its Profile', async () => {
    const admin = await local.provisionUser();
    const provisioned = await local.allowlist(admin.id);
    expect(provisioned.error).toBeNull();
    const signedIn = await local.signIn(admin);

    const profile = await readProfile(signedIn.client);

    expect(profile.error).toBeNull();
    expect(profile.data).toEqual([{ id: admin.id, phone: null, theme: 'light' }]);
  });

  it('persists the Admin phone and theme through the Data API', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const signedIn = await local.signIn(admin);

    const updated = await signedIn.client
      .from('admin_profiles')
      .update({ phone: '+639171234567', theme: 'dark' })
      .eq('id', admin.id)
      .select();

    expect(updated.error).toBeNull();
    const revisited = await local.signIn(admin);
    expect((await readProfile(revisited.client)).data).toEqual([
      { id: admin.id, phone: '+639171234567', theme: 'dark' },
    ]);
  });

  it('denies a signed-in non-Admin Profile reads and updates', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const nonAdmin = await local.provisionUser();
    const signedIn = await local.signIn(nonAdmin);

    const profile = await readProfile(signedIn.client);
    expect(profile.error).toBeNull();
    expect(profile.data).toEqual([]);
    const updated = await signedIn.client
      .from('admin_profiles')
      .update({ theme: 'dark' })
      .eq('id', admin.id)
      .select();
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual([]);
    const actualAdmin = await local.signIn(admin);
    expect((await readProfile(actualAdmin.client)).data).toEqual([
      { id: admin.id, phone: null, theme: 'light' },
    ]);
  });

  it('immediately denies both unexpired Admin JWTs after global sign-out', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const first = await local.signIn(admin);
    const second = await local.signIn(admin);
    for (const signedIn of [first, second]) {
      expect((await readProfile(signedIn.client)).data).toHaveLength(1);
    }
    expect((await first.client.auth.signOut({ scope: 'global' })).error).toBeNull();

    // Replay the original tokens directly: no cookie clearing or refresh can mask RLS failure.
    for (const session of [first.session, second.session]) {
      expect(session.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
      const stale = local.tokenClient(session.access_token);
      const read = await readProfile(stale);
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);
      const update = await stale
        .from('admin_profiles')
        .update({ theme: 'dark' })
        .eq('id', admin.id)
        .select();
      expect(update.error).toBeNull();
      expect(update.data).toEqual([]);
    }
    const fresh = await local.signIn(admin);
    expect((await readProfile(fresh.client)).data).toEqual([
      { id: admin.id, phone: null, theme: 'light' },
    ]);
  });

  it('local sign-out denies the old JWT while a second Admin session stays active', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const first = await local.signIn(admin);
    const second = await local.signIn(admin);
    expect((await readProfile(first.client)).data).toHaveLength(1);
    expect((await readProfile(second.client)).data).toHaveLength(1);

    expect((await first.client.auth.signOut({ scope: 'local' })).error).toBeNull();

    expect(first.session.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const stale = local.tokenClient(first.session.access_token);
    const denied = await readProfile(stale);
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual([]);
    const deniedUpdate = await stale
      .from('admin_profiles')
      .update({ theme: 'dark' })
      .eq('id', admin.id)
      .select();
    expect(deniedUpdate.error).toBeNull();
    expect(deniedUpdate.data).toEqual([]);
    const surviving = local.tokenClient(second.session.access_token);
    expect((await readProfile(surviving)).data).toHaveLength(1);
    const updated = await surviving
      .from('admin_profiles')
      .update({ theme: 'dark' })
      .eq('id', admin.id)
      .select();
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual([{ id: admin.id, phone: null, theme: 'dark' }]);
  });

  it('denies anonymous Profile reads and mutations', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const anonymous = local.client();
    const read = await readProfile(anonymous);
    expect(read.error?.code).toBe('42501');
    expect(read.data).toBeNull();
    const update = await anonymous
      .from('admin_profiles')
      .update({ theme: 'dark' })
      .eq('id', admin.id)
      .select();
    expect(update.error?.code).toBe('42501');
    const insert = await anonymous.from('admin_profiles').insert({ id: admin.id });
    expect(insert.error?.code).toBe('42501');
    const actualAdmin = await local.signIn(admin);
    expect((await readProfile(actualAdmin.client)).data).toEqual([
      { id: admin.id, phone: null, theme: 'light' },
    ]);
  });

  it('prevents clients from self-provisioning or changing the Admin identity', async () => {
    const admin = await local.provisionUser();
    expect((await local.allowlist(admin.id)).error).toBeNull();
    const nonAdmin = await local.provisionUser();
    const signedIn = await local.signIn(nonAdmin);
    const insert = await signedIn.client.from('admin_profiles').insert({ id: nonAdmin.id });
    expect(insert.error?.code).toBe('42501');
    expect((await readProfile(signedIn.client)).data).toEqual([]);
    const actualAdmin = await local.signIn(admin);
    const adminInsert = await actualAdmin.client.from('admin_profiles').insert({ id: nonAdmin.id });
    expect(adminInsert.error?.code).toBe('42501');
    const reassigned = await actualAdmin.client
      .from('admin_profiles')
      .update({ id: nonAdmin.id })
      .eq('id', admin.id)
      .select();
    expect(reassigned.error?.code).toBe('42501');
    const deleted = await actualAdmin.client.from('admin_profiles').delete().eq('id', admin.id);
    expect(deleted.error?.code).toBe('42501');
    expect((await readProfile(actualAdmin.client)).data).toEqual([
      { id: admin.id, phone: null, theme: 'light' },
    ]);
  });

  it('rejects public signup while provisioned users can sign in', async () => {
    const registration = await local.client().auth.signUp({
      email: `public-signup-${randomUUID()}@example.test`,
      password: `Boundary-${randomUUID()}!`,
    });
    if (registration.data.user) {
      await local.service.auth.admin.deleteUser(registration.data.user.id);
    }
    expect(registration.error?.code).toBe('signup_disabled');
    expect(registration.data.session).toBeNull();
    const provisioned = await local.provisionUser();
    const signedIn = await local.signIn(provisioned);
    expect(signedIn.session.user.id).toBe(provisioned.id);
  });
});
