import { z } from 'zod';

const id = z.string().min(1).max(128);
const base = { operationId: id, runId: id, recordedAt: z.number().int().nonnegative() };
const dispatchBase = {
  ...base,
  kind: z.literal('dispatch_intent'),
  attemptId: id,
  printerId: id,
  connectionGeneration: z.number().int().nonnegative(),
};
const journalEntrySchema = z.union([
  z.strictObject({
    ...base,
    kind: z.literal('capture'),
    sessionId: id,
    captureId: id,
    capturedAt: z.iso.datetime(),
  }),
  z.strictObject({ ...base, kind: z.literal('reservation'), sessionId: id, captureId: id }),
  z.strictObject({ ...dispatchBase, phase: z.literal('requested') }),
  z.strictObject({ ...dispatchBase, phase: z.literal('authorized'), dispatchId: id }),
  z.strictObject({
    ...base,
    kind: z.literal('observation'),
    attemptId: id,
    printerId: id,
    dispatchId: id.nullable(),
    observationId: id,
    observationKind: z.enum([
      'definitely_not_sent',
      'command_accepted',
      'full_ejection_confirmed',
      'no_film_rejected',
      'outcome_unknown',
      'ready_for_new_job',
      'connection_changed',
    ]),
    adapterVersion: id,
    evidenceVersion: id,
    connectionGeneration: z.number().int().nonnegative(),
  }),
]);
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export interface BoothMetadataJournal {
  putOperation(entry: JournalEntry): void;
  readOperations(): readonly JournalEntry[];
  acknowledgeOperation(operationId: string): void;
}

const key = 'booth-operations-v2';
export class BrowserBoothMetadataJournal implements BoothMetadataJournal {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}

  readOperations(): readonly JournalEntry[] {
    const raw = this.storage.getItem(key);
    if (raw === null) return [];
    const entries = z.array(journalEntrySchema).parse(JSON.parse(raw));
    if (new Set(entries.map((entry) => entry.operationId)).size !== entries.length)
      throw new Error('Duplicate journal operation');
    return entries;
  }

  putOperation(entry: JournalEntry) {
    const safe = journalEntrySchema.parse(entry);
    const entries = this.readOperations();
    const prior = entries.find((item) => item.operationId === safe.operationId);
    if (
      prior &&
      (prior.kind !== 'dispatch_intent' ||
        safe.kind !== 'dispatch_intent' ||
        prior.phase !== 'requested' ||
        safe.phase !== 'authorized' ||
        prior.attemptId !== safe.attemptId ||
        prior.runId !== safe.runId ||
        prior.printerId !== safe.printerId ||
        prior.connectionGeneration !== safe.connectionGeneration)
    )
      throw new Error('Journal operation already exists');
    this.write([...entries.filter((item) => item.operationId !== safe.operationId), safe]);
  }

  acknowledgeOperation(operationId: string) {
    this.write(this.readOperations().filter((entry) => entry.operationId !== operationId));
  }

  private write(entries: readonly JournalEntry[]) {
    if (entries.length) {
      const serialized = JSON.stringify(entries);
      this.storage.setItem(key, serialized);
      if (this.storage.getItem(key) !== serialized) throw new Error('Journal write not durable');
    } else {
      this.storage.removeItem(key);
      if (this.storage.getItem(key) !== null) throw new Error('Journal removal failed');
    }
  }
}
