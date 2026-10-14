import { requireAdmin } from '@/lib/auth/require-admin';

export default async function HistoryPage() {
  await requireAdmin();
  return (
    <section className="admin-foundation">
      <p>Admin foundation</p>
      <h1>History</h1>
      <p>Event history is not available yet.</p>
    </section>
  );
}
