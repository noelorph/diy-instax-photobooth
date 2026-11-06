import { connection } from 'next/server';
import { Dashboard } from '@/features/admin/dashboard/dashboard';
import { readDashboard } from '@/features/admin/dashboard/read';

export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  await connection();
  const query = await searchParams;
  const activityDays = query.activityDays === '30' ? 30 : 7;
  const candidate =
    typeof query.page === 'string' && /^\d+$/.test(query.page) ? Number(query.page) : 0;
  const page = Number.isSafeInteger(candidate) && candidate <= 1000000 ? candidate : 0;
  // Request-time instant keeps the summary and activity window on the same clock.
  const now = new Date().toISOString();
  const result = await readDashboard({ now, activityDays, page });
  return <Dashboard result={result} now={now} activityDays={activityDays} page={page} />;
}
