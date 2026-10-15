import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { connection } from 'next/server';

export async function createClient() {
  // Auth starts a background session subscription that reads the clock.
  // Wait for an actual request before constructing it during partial prefetch.
  await connection();
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. Proxy performs refresh
            // before rendering and forwards cookies and cache headers.
          }
        },
      },
    }
  );
}
