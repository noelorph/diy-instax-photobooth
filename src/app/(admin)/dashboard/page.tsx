import { requireAdmin } from '@/lib/auth/require-admin';

export default async function DashboardPage() {
  await requireAdmin();
  return (
    <section className="admin-foundation">
      <p>Admin foundation</p>
      <h1>Dashboard</h1>
      <p>Event summaries and activity are not available yet.</p>
    </section>
  );
}
