'use server';

import { revalidatePath } from 'next/cache';
import { createDraft, updateDraft, type DraftSaveResult } from '@/lib/events/drafts';
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
  };
}

export async function createDraftAction(
  _state: DraftActionState,
  data: FormData
): Promise<DraftActionState> {
  return savedState(await createDraft(draftInputFromFormData(data)));
}

export async function updateDraftAction(
  id: string,
  expectedRevision: number,
  _state: DraftActionState,
  data: FormData
): Promise<DraftActionState> {
  return savedState(await updateDraft(id, expectedRevision, draftInputFromFormData(data)));
}
