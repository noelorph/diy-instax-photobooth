import { PageHeader } from '@/components/shared/page-header';
import { FormFeedback } from '@/components/shared/form-feedback';
export default function DashboardLoading() {
  return (
    <div>
      <PageHeader title="Dashboard" />
      <FormFeedback kind="status">Loading Event summaries and recent activity…</FormFeedback>
    </div>
  );
}
