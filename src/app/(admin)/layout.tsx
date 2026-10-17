import { Suspense, type ReactNode } from 'react';
import { readAdminProfile } from '@/features/admin/profile/read';
import { AdminShell } from '@/components/layout/admin-shell';

async function AuthorizedAdmin({ children }: { children: ReactNode }) {
  const profile = await readAdminProfile();
  return <AdminShell theme={profile.theme}>{children}</AdminShell>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status">Checking access…</p>}>
      <AuthorizedAdmin>{children}</AuthorizedAdmin>
    </Suspense>
  );
}
