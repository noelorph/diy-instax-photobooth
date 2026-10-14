import type { NextRequest } from 'next/server';
import { refreshSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/events/:path*',
    '/history/:path*',
    '/profile/:path*',
    '/sign-in',
    '/forgot-password',
    '/reset-password',
    '/auth/:path*',
  ],
};
