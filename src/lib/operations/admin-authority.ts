import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { OperationError, type AdminAuthority } from './types';
export async function requireAdminRequest(request: Request): Promise<AdminAuthority> {
  // Auth is resolved exclusively by the request-scoped SSR cookie client.
  void request;
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims.sub,
    sessionId = data?.claims.session_id;
  if (error || !userId || typeof sessionId !== 'string' || !sessionId)
    throw new OperationError('unauthorized');
  // RLS checks both provisioning and the live auth.sessions row.
  const { data: profile, error: profileError } = await client
    .from('admin_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || !profile) throw new OperationError('forbidden');
  return { userId, sessionId };
}
