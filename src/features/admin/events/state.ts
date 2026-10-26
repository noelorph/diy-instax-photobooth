import type { DraftEvent, DraftSaveResult } from '@/lib/events/drafts';

export type DraftActionState =
  | { status: 'idle' }
  | Exclude<DraftSaveResult, { status: 'success' }>
  | { status: 'success'; id: string; revision: number; confirmation: string; draft?: DraftEvent };
