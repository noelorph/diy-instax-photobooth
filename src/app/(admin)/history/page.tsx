import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { requireAdmin } from '@/lib/auth/require-admin';

export default async function HistoryPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="History" />
      <EmptyState title="Admin foundation" description="Event history is not available yet." />
    </div>
  );
}
