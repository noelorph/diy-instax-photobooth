'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';
import {
  createDraft,
  recoverDraftCreation,
  updateDraft,
  type DraftSaveResult,
} from '@/lib/events/drafts';
import type { DraftActionState } from './state';
import { draftInputFromFormData } from './draft-event.schema';

function savedState(result: DraftSaveResult): DraftActionState {
  if (result.status !== 'success') return result;
  revalidatePath('/events');
  revalidatePath(`/events/${result.draft.id}`);
  return {
    status: 'success',
    id: result.draft.id,
    revision: result.draft.revision,
    confirmation: 'Draft saved.',
    draft: result.draft,
  };
}

export async function createDraftAction(
  _state: DraftActionState,
  data: FormData
): Promise<DraftActionState> {
  const admin = await requireAdmin();
  const operationId = data instanceof FormData ? data.get('operationId') : null;
  if (
    !(data instanceof FormData) ||
    data.getAll('operationId').length !== 1 ||
    !z.uuid().safeParse(operationId).success
  ) {
    return {
      status: 'conflict',
      error: 'This save request is invalid. Return to Events and create a new Draft.',
    };
  }
  if (data.getAll('adminUserId').length !== 1 || data.get('adminUserId') !== admin.userId)
    return { status: 'unavailable', error: 'Sign in as the original Admin to recover this save.' };
  return savedState(await createDraft(operationId as string, draftInputFromFormData(data)));
}

export async function recoverDraftCreationAction(operationId: string, adminUserId: string) {
  const result = await recoverDraftCreation(operationId, adminUserId);
  return result.status === 'missing_receipt' ? result : savedState(result);
}

export async function updateDraftAction(
  id: string,
  expectedRevision: number,
  _state: DraftActionState,
  data: FormData
): Promise<DraftActionState> {
  return savedState(await updateDraft(id, expectedRevision, draftInputFromFormData(data)));
}
