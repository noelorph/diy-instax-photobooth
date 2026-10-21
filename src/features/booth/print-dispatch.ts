import {
  READINESS_MAX_AGE_MS,
  type DispatchAuthorization,
  type DispatchResult,
} from '@/lib/operations/package-contract';
import type { BoothMetadataJournal, JournalEntry } from './print-journal';
import type {
  PrinterAdapterV2,
  PrinterObservationV2,
  PrinterReadinessSnapshot,
} from './printer/contract-v2';

export type DispatchInput = {
  runId: string;
  sessionId: string;
  captureId: string;
  reservationOperationId: string;
  dispatchOperationId: string;
  printerId: string;
  connectionGeneration: number;
  image: Uint8Array;
};
export type DispatchDependencies = {
  journal: BoothMetadataJournal;
  printer: PrinterAdapterV2;
  reserve: (operationId: string) => Promise<{ attemptId: string }>;
  authorizeDispatch: (
    attemptId: string,
    operationId: string
  ) => Promise<
    Pick<DispatchResult, 'sendAllowed' | 'replayed'> & { authorization?: DispatchAuthorization }
  >;
  reconcile: (entries: readonly JournalEntry[]) => Promise<'clear' | 'pending'>;
  releaseImage: () => void;
};

const active = new Set<string>();
function ready(snapshot: PrinterReadinessSnapshot, input: DispatchInput) {
  return (
    snapshot.connected &&
    snapshot.ready &&
    snapshot.printerId === input.printerId &&
    snapshot.connectionGeneration === input.connectionGeneration &&
    Number.isFinite(snapshot.observedAgeMs) &&
    snapshot.observedAgeMs >= 0 &&
    snapshot.observedAgeMs <= READINESS_MAX_AGE_MS
  );
}

/** Returns after the write, never after physical completion. Observations are acknowledged separately. */
export async function dispatchReservedAttempt(
  input: DispatchInput,
  deps: DispatchDependencies
): Promise<void> {
  const session = JSON.stringify([input.runId, input.sessionId]);
  if (active.has(session)) throw new Error('Session already dispatched or pending');
  active.add(session);
  try {
    const old = deps.journal.readOperations();
    if (old.length && (await deps.reconcile(old)) !== 'clear')
      throw new Error('Previous operation pending');
    if (old.length) throw new Error('Previous journal requires acknowledgement');
    if ((await deps.reconcile([])) !== 'clear') throw new Error('Previous operation pending');
    if (!input.image.byteLength || !ready(await deps.printer.readReadiness(), input))
      throw new Error('Printer not ready');
    const recordedAt = Date.now();
    deps.journal.putOperation({
      kind: 'reservation',
      operationId: input.reservationOperationId,
      runId: input.runId,
      sessionId: input.sessionId,
      captureId: input.captureId,
      recordedAt,
    });
    const { attemptId } = await deps.reserve(input.reservationOperationId);
    if (!ready(await deps.printer.readReadiness(), input)) throw new Error('Printer not ready');
    const intent: JournalEntry = {
      kind: 'dispatch_intent',
      operationId: input.dispatchOperationId,
      runId: input.runId,
      attemptId,
      printerId: input.printerId,
      connectionGeneration: input.connectionGeneration,
      phase: 'requested',
      recordedAt: Date.now(),
    };
    deps.journal.putOperation(intent);
    const result = await deps.authorizeDispatch(attemptId, input.dispatchOperationId);
    if (!result.sendAllowed || result.replayed || !result.authorization)
      throw new Error('No live dispatch authorization');
    const grant = result.authorization;
    if (
      grant.attemptId !== attemptId ||
      grant.printerId !== input.printerId ||
      grant.connectionGeneration !== input.connectionGeneration ||
      !grant.dispatchId
    )
      throw new Error('Dispatch authorization mismatch');
    if (!ready(await deps.printer.readReadiness(), input)) throw new Error('Printer not ready');
    deps.journal.putOperation({ ...intent, phase: 'authorized', dispatchId: grant.dispatchId });
    const persisted = deps.journal
      .readOperations()
      .find((entry) => entry.operationId === input.dispatchOperationId);
    if (
      persisted?.kind !== 'dispatch_intent' ||
      persisted.phase !== 'authorized' ||
      persisted.dispatchId !== grant.dispatchId
    )
      throw new Error('Dispatch intent not durable');
    await deps.printer.sendOnce(grant, input.image);
  } catch (error) {
    let entries: readonly JournalEntry[] = [];
    try {
      entries = deps.journal.readOperations();
    } catch {
      // A corrupt journal cannot prove no command was sent.
    }
    try {
      await deps.reconcile(entries);
    } catch {
      // A later receipt read must settle an ambiguous operation.
    }
    throw error;
  } finally {
    deps.releaseImage();
  }
}

export async function recordAndReportObservation(
  runId: string,
  observation: PrinterObservationV2,
  journal: BoothMetadataJournal,
  report: (entry: Extract<JournalEntry, { kind: 'observation' }>) => Promise<void>
) {
  const stored = journal
    .readOperations()
    .find((entry) => entry.operationId === observation.observationId);
  const entry: Extract<JournalEntry, { kind: 'observation' }> =
    stored?.kind === 'observation'
      ? stored
      : 'attemptId' in observation
        ? {
            kind: 'observation',
            operationId: observation.observationId,
            runId,
            recordedAt: Date.now(),
            observationId: observation.observationId,
            observationKind: observation.kind,
            attemptId: observation.attemptId,
            dispatchId: observation.dispatchId,
            adapterVersion: observation.adapterVersion,
            evidenceVersion: observation.evidenceVersion,
            connectionGeneration: observation.connectionGeneration,
          }
        : {
            kind: 'observation',
            operationId: observation.observationId,
            runId,
            recordedAt: Date.now(),
            observationId: observation.observationId,
            observationKind: observation.kind,
            printerId: observation.printerId,
            adapterVersion: observation.adapterVersion,
            evidenceVersion: observation.evidenceVersion,
            connectionGeneration: observation.connectionGeneration,
          };
  if (stored) {
    if (
      stored.kind !== 'observation' ||
      stored.runId !== runId ||
      stored.observationKind !== observation.kind ||
      stored.adapterVersion !== observation.adapterVersion ||
      stored.evidenceVersion !== observation.evidenceVersion ||
      stored.connectionGeneration !== observation.connectionGeneration ||
      ('attemptId' in observation
        ? !('attemptId' in stored) ||
          stored.attemptId !== observation.attemptId ||
          stored.dispatchId !== observation.dispatchId
        : 'attemptId' in stored || stored.printerId !== observation.printerId)
    )
      throw new Error('Observation journal conflict');
  } else journal.putOperation(entry);
  await report(entry);
  journal.acknowledgeOperation(entry.operationId);
}
