import { requireAdmin } from '@/lib/auth/require-admin';
import { DraftForm } from '@/features/admin/events/draft-form';
import {
  createDraftAction,
  recoverDraftCreationAction,
  updateDraftAction,
} from '@/features/admin/events/actions';

export default async function NewEventPage() {
  const admin = await requireAdmin();
  return (
    <DraftForm
      key={admin.userId}
      adminUserId={admin.userId}
      recoverAction={recoverDraftCreationAction}
      createAction={createDraftAction}
      updateAction={updateDraftAction}
    />
  );
}
