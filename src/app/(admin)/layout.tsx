import { Suspense, type ReactNode } from 'react';
import { readAdminProfile } from '@/features/admin/profile/read';
import { AppShell } from '@/features/admin/app-shell';

async function AuthorizedAdmin({ children }: { children: ReactNode }) {
  const profile = await readAdminProfile();
  return <AppShell theme={profile.theme}>{children}</AppShell>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status">Checking access…</p>}>
      <AuthorizedAdmin>{children}</AuthorizedAdmin>
    </Suspense>
  );
}
