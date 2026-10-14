import { Suspense, type ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth/require-admin';

async function AuthorizedAdmin({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status">Checking access…</p>}>
      <AuthorizedAdmin>{children}</AuthorizedAdmin>
    </Suspense>
  );
}
