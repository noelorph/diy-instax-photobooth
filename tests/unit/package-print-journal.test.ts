import { describe, expect, it } from 'vitest';
import { BrowserBoothMetadataJournal } from '@/features/booth/print-journal';

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    values,
  };
}

describe('metadata journal', () => {
  it('persists operation metadata and removes it only after acknowledgement', () => {
    const storage = memory();
    const journal = new BrowserBoothMetadataJournal(storage);
    journal.putOperation({
      kind: 'reservation',
      operationId: 'reserve',
      runId: 'run',
      sessionId: 'session',
      captureId: 'capture',
      recordedAt: 1,
    });
    expect(new BrowserBoothMetadataJournal(storage).readOperations()).toEqual([
      {
        kind: 'reservation',
        operationId: 'reserve',
        runId: 'run',
        sessionId: 'session',
        captureId: 'capture',
        recordedAt: 1,
      },
    ]);
    journal.acknowledgeOperation('reserve');
    expect(journal.readOperations()).toEqual([]);
  });
  it('rejects a phase update that changes the bound printer', () => {
    const journal = new BrowserBoothMetadataJournal(memory());
    const intent = {
      kind: 'dispatch_intent' as const,
      operationId: 'dispatch',
      runId: 'run',
      attemptId: 'attempt',
      printerId: 'printer',
      connectionGeneration: 1,
      phase: 'requested' as const,
      recordedAt: 1,
    };
    journal.putOperation(intent);
    expect(() =>
      journal.putOperation({
        ...intent,
        phase: 'authorized',
        printerId: 'other',
        dispatchId: 'dispatch-id',
      })
    ).toThrow();
  });
  it('requires a dispatch ID only after authorization', () => {
    const journal = new BrowserBoothMetadataJournal(memory());
    const intent = {
      kind: 'dispatch_intent' as const,
      operationId: 'dispatch',
      runId: 'run',
      attemptId: 'attempt',
      printerId: 'printer',
      connectionGeneration: 1,
      recordedAt: 1,
    };
    expect(() => journal.putOperation({ ...intent, phase: 'authorized' } as never)).toThrow();
    expect(() =>
      journal.putOperation({ ...intent, phase: 'requested', dispatchId: 'early' } as never)
    ).toThrow();
  });
  it('fails closed on malformed persisted metadata and never stores extra image data', () => {
    const storage = memory();
    const journal = new BrowserBoothMetadataJournal(storage);
    expect(() =>
      journal.putOperation({
        kind: 'capture',
        operationId: 'capture',
        runId: 'run',
        sessionId: 'session',
        recordedAt: 1,
        image: [1, 2],
      } as never)
    ).toThrow();
    storage.values.set('booth-operations-v2', '{bad-json');
    expect(() => journal.readOperations()).toThrow();
  });
  it('rejects duplicate persisted operation IDs instead of acknowledging ambiguous records', () => {
    const storage = memory();
    const entry = {
      kind: 'reservation',
      operationId: 'same',
      runId: 'run',
      sessionId: 'session',
      captureId: 'capture',
      recordedAt: 1,
    };
    storage.values.set('booth-operations-v2', JSON.stringify([entry, entry]));
    expect(() => new BrowserBoothMetadataJournal(storage).readOperations()).toThrow();
  });
  it('fails a quota error or lost write rather than claiming an operation was recorded', () => {
    const storage = memory();
    const journal = new BrowserBoothMetadataJournal({ ...storage, setItem: () => {} });
    expect(() =>
      journal.putOperation({
        kind: 'reservation',
        operationId: 'reserve',
        runId: 'run',
        sessionId: 'session',
        captureId: 'capture',
        recordedAt: 1,
      })
    ).toThrow();
  });
});

it('persists request-bound reload evidence as metadata only for original-ID replay', () => {
  const storage = new Map<string, string>();
  const journal = new BrowserBoothMetadataJournal({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
    removeItem: (key) => {
      storage.delete(key);
    },
  });
  const entry = {
    kind: 'reload_observation' as const,
    operationId: 'obs',
    observationId: 'obs',
    runId: 'run',
    recordedAt: 1,
    reloadRequestId: 'request',
    reloadRequestRevision: 3,
    printerId: 'printer',
    connectionGeneration: 2,
    adapterVersion: 'instax-mini-link3-v1',
    evidenceVersion: 'instax-fi033-0102-dev-v1',
  };
  journal.putOperation(entry);
  expect(journal.readOperations()).toEqual([entry]);
  expect(() => journal.putOperation({ ...entry, reloadRequestRevision: 4 })).toThrow();
  journal.acknowledgeOperation('obs');
  expect(journal.readOperations()).toEqual([]);
});
