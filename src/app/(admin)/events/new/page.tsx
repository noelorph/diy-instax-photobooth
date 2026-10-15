import { requireAdmin } from '@/lib/auth/require-admin';
import { DraftForm } from '@/features/admin/events/draft-form';
import { createDraftAction, updateDraftAction } from '@/features/admin/events/actions';

export default async function NewEventPage() {
  await requireAdmin();
  return <DraftForm createAction={createDraftAction} updateAction={updateDraftAction} />;
}
