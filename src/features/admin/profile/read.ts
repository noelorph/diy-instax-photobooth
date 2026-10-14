import 'server-only';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import type { ProfileData } from './state';
export async function readAdminProfile(): Promise<ProfileData> {
  const { userId } = await requireAdmin();
  const client = await createClient();
  const [{ data: profile, error }, { data: claims }] = await Promise.all([
    client.from('admin_profiles').select('phone, theme').eq('id', userId).maybeSingle(),
    client.auth.getClaims(),
  ]);
  if (error || !profile || typeof claims?.claims.email !== 'string') redirect('/sign-in');
  return { phone: profile.phone, theme: profile.theme, email: claims.claims.email };
}
