import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';

async function Entry() {
  await requireAdmin();
  return redirect('/dashboard');
}

export default function Home() {
  return (
    <Suspense fallback={<p role="status">Checking access…</p>}>
      <Entry />
    </Suspense>
  );
}
