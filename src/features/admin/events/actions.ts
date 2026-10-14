'use server';

import { revalidatePath } from 'next/cache';
import { createDraft, updateDraft, type DraftSaveResult } from '@/lib/events/drafts';
import type { DraftActionState } from './state';

function formInput(data: FormData) {
  if (!(data instanceof FormData)) return {};
  function count(field: string) {
    const value = data.get(field);
    return typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  }
  return {
    ...Object.fromEntries(data),
    ...(data.has('state')
      ? { state: data.getAll('state').every((value) => value === 'Draft') ? 'Draft' : null }
      : {}),
    filmPackageCount: count('filmPackageCount'),
    originalPrintAllowance: count('originalPrintAllowance'),
  };
}

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
  return savedState(await createDraft(formInput(data)));
}

export async function updateDraftAction(
  id: string,
  expectedRevision: number,
  _state: DraftActionState,
  data: FormData
): Promise<DraftActionState> {
  return savedState(await updateDraft(id, expectedRevision, formInput(data)));
}
