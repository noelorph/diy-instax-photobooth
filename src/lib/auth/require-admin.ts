import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requireAdmin(): Promise<{ userId: string; sessionId: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  const sessionId = data?.claims.session_id;
  if (error || !userId || typeof sessionId !== 'string' || !sessionId) {
    redirect('/sign-in');
  }

  // The Profile SELECT policy calls private.is_active_admin(): the verified
  // identity must be provisioned and its JWT session must still exist in Auth.
  // getClaims alone accepts an unexpired JWT after its session is revoked.
  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || !profile) redirect('/sign-in');
  return { userId, sessionId };
}
