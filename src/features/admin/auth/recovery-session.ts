import 'server-only';
import { createClient } from '@/lib/supabase/server';

export async function recoverySession(client: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await client.auth.getClaims();
  // Verify the Auth-signed authentication method. The PKCE redirectType comes
  // from a browser cookie and is not authorization evidence.
  if (
    error ||
    !data?.claims.amr?.some((entry) => typeof entry !== 'string' && entry.method === 'recovery')
  )
    return false;
  const { data: profile, error: profileError } = await client
    .from('admin_profiles')
    .select('id')
    .eq('id', data.claims.sub)
    .maybeSingle();
  // Reuse the live-session RLS predicate; stale recovery JWTs fail here too.
  return !profileError && Boolean(profile);
}
