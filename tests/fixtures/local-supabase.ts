import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type LocalStatus = {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
};

// Always discover this checkout's local stack; never consume application/remote env vars.
export function localSupabaseStatus() {
  const status = JSON.parse(
    execFileSync(resolve('node_modules/.bin/supabase'), ['status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  ) as LocalStatus;
  if (status.API_URL !== 'http://127.0.0.1:55321') {
    throw new Error('Integration fixtures require the isolated local Supabase API on port 55321.');
  }
  return status;
}

export function localSupabase() {
  const status = localSupabaseStatus();
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const client = () => createClient(status.API_URL, status.ANON_KEY, options);
  const tokenClient = (accessToken: string) =>
    createClient(status.API_URL, status.ANON_KEY, {
      ...options,
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
  const userIds: string[] = [];

  async function provisionUser() {
    const email = `admin-boundary-${randomUUID()}@example.test`;
    const password = `Boundary-${randomUUID()}!`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error(`Local Auth fixture provisioning failed: ${error?.message}`);
    userIds.push(data.user.id);
    return { id: data.user.id, email, password };
  }

  async function allowlist(id: string) {
    return service.from('admin_profiles').insert({ id });
  }

  async function signIn(user: { email: string; password: string }) {
    const signedIn = client();
    const { data, error } = await signedIn.auth.signInWithPassword(user);
    if (error || !data.session)
      throw new Error(`Local Auth fixture sign-in failed: ${error?.message}`);
    return { client: signedIn, session: data.session };
  }

  async function cleanup() {
    // Deleting these fixture users also removes their sessions and Profiles by FK cascade.
    for (const id of userIds.splice(0)) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) throw new Error(`Local Auth fixture cleanup failed: ${error.message}`);
    }
  }

  return { client, tokenClient, service, provisionUser, allowlist, signIn, cleanup };
}

export async function readProfile(client: SupabaseClient) {
  return client.from('admin_profiles').select('id, phone, theme');
}
