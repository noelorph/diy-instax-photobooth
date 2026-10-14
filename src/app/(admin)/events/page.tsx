import { requireAdmin } from '@/lib/auth/require-admin';

export default async function EventsPage() {
  await requireAdmin();
  return (
    <main className="admin-foundation">
      <p>Admin foundation</p>
      <h1>Events</h1>
      <p>Event management is not available yet.</p>
    </main>
  );
}
