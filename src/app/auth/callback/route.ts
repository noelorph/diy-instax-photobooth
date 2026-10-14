import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { recoveryCallbackUrl } from '@/features/admin/auth/config';
import { recoverySession } from '@/features/admin/auth/recovery-session';

export async function GET(request: Request) {
  let destination: URL;
  try {
    destination = new URL('/reset-password', recoveryCallbackUrl());
  } catch {
    return new Response('Recovery is unavailable. Please try again later.', {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  destination.searchParams.set('error', 'invalid-link');
  let client: Awaited<ReturnType<typeof createClient>> | undefined;
  try {
    client = await createClient();
    const params = new URL(request.url).searchParams;
    const code = params.get('code');
    const allowed = Array.from(params.keys()).every((key) =>
      ['code', 'sb_flow_id', 'next'].includes(key)
    );
    const next = params.get('next');
    if (
      code &&
      params.getAll('code').length === 1 &&
      allowed &&
      (!next || next === '/reset-password')
    ) {
      const flowId = params.get('sb_flow_id');
      const { error } = await client.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined
      );
      if (!error && (await recoverySession(client))) destination.search = '';
    }
    if (destination.search) await client.auth.signOut({ scope: 'local' });
  } catch (error) {
    unstable_rethrow(error);
    if (client) {
      try {
        await client.auth.signOut({ scope: 'local' });
      } catch {
        /* Keep the invalid-link destination. */
      }
    }
  }
  const response = NextResponse.redirect(destination);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
