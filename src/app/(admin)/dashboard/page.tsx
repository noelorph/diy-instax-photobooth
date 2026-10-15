import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { requireAdmin } from '@/lib/auth/require-admin';

export default async function DashboardPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Dashboard" />
      <EmptyState
        title="Admin foundation"
        description="Event summaries and activity are not available yet."
      />
    </div>
  );
}
