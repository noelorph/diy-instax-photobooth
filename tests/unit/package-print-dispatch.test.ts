import { afterEach, expect, it, vi } from 'vitest';
import {
  dispatchReservedAttempt,
  recordAndReportObservation,
} from '@/features/booth/print-dispatch';
import { BrowserBoothMetadataJournal } from '@/features/booth/print-journal';
import { SimulatedPrinterV2 } from '@/features/booth/printer/simulator-v2';
import type { DispatchDependencies, DispatchInput } from '@/features/booth/print-dispatch';

let nextSession = 0;
afterEach(() => vi.useRealTimers());
async function rig() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const journal = new BrowserBoothMetadataJournal(storage);
  const printer = new SimulatedPrinterV2('printer');
  const connectionGeneration = (await printer.connect()).connectionGeneration;
  const sessionId = `session-${++nextSession}`;
  const input: DispatchInput = {
    runId: 'run',
    sessionId,
    captureId: 'capture',
    reservationOperationId: `reserve-${sessionId}`,
    dispatchOperationId: `dispatch-${sessionId}`,
    printerId: 'printer',
    connectionGeneration,
    image: new Uint8Array([1]),
  };
  const deps: DispatchDependencies = {
    journal,
    printer,
    reserve: vi.fn(async () => ({ attemptId: `attempt-${sessionId}` })),
    authorizeDispatch: vi.fn(async (attemptId) => ({
      sendAllowed: true,
      replayed: false,
      authorization: {
        attemptId,
        dispatchId: `physical-${sessionId}`,
        printerId: 'printer',
        connectionGeneration,
      },
    })),
    reconcile: vi.fn(async () => 'clear' as const),
    canSendNow: () => true,
    releaseImage: vi.fn(),
  };
  return { input, deps, storage, values, journal, printer };
}

it('samples current readiness after repeated polling', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const { input, deps, printer } = await rig();
  const originalGeneration = input.connectionGeneration;
  for (const time of [2_000, 4_000, 6_000]) {
    vi.setSystemTime(time);
    const snapshot = await printer.readReadiness();
    expect(snapshot.observedAgeMs).toBe(0);
    expect(snapshot.connectionGeneration).toBe(originalGeneration);
    expect(snapshot.connected).toBe(true);
    expect(snapshot.ready).toBe(true);
  }
  await dispatchReservedAttempt(input, deps);
  expect(printer.commandCount).toBe(1);
});

it('rejects readiness aged 5,001 ms before reservation', async () => {
  const { input, deps, printer, journal } = await rig();
  const snapshot = await printer.readReadiness();
  deps.printer = {
    disconnect: printer.disconnect.bind(printer),
    connect: printer.connect.bind(printer),
    readReadiness: async () => ({ ...snapshot, observedAgeMs: 5_001 }),
    observe: printer.observe.bind(printer),
    observeReload: printer.observeReload.bind(printer),
    sendOnce: printer.sendOnce.bind(printer),
  };
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('Printer not ready');
  expect(deps.reserve).not.toHaveBeenCalled();
  expect(deps.authorizeDispatch).not.toHaveBeenCalled();
  expect(journal.readOperations()).toEqual([]);
  expect(printer.commandCount).toBe(0);
  expect(deps.releaseImage).toHaveBeenCalledOnce();
});

it('journals before reserve and sends one live authorized command', async () => {
  const values = new Map<string, string>();
  const journal = new BrowserBoothMetadataJournal({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  });
  const write = vi.fn(async () => {});
  const printer = new SimulatedPrinterV2('printer', write);
  const connectionGeneration = (await printer.connect('printer')).connectionGeneration;
  await dispatchReservedAttempt(
    {
      runId: 'run',
      sessionId: 'session',
      captureId: 'capture',
      reservationOperationId: 'reserve',
      dispatchOperationId: 'dispatch-op',
      printerId: 'printer',
      connectionGeneration,
      image: new Uint8Array([1]),
    },
    {
      journal,
      printer,
      reserve: async () => {
        expect(journal.readOperations().map((entry) => entry.kind)).toEqual(['reservation']);
        return { attemptId: 'attempt' };
      },
      authorizeDispatch: async () => {
        expect(journal.readOperations().map((entry) => entry.kind)).toEqual([
          'reservation',
          'dispatch_intent',
        ]);
        return {
          sendAllowed: true,
          replayed: false,
          authorization: {
            attemptId: 'attempt',
            dispatchId: 'dispatch',
            printerId: 'printer',
            connectionGeneration,
          },
        };
      },
      reconcile: async () => 'clear',
      canSendNow: () => true,
      releaseImage: () => {},
    }
  );
  expect(write).toHaveBeenCalledTimes(1);
  expect(journal.readOperations().map((entry) => entry.kind)).toEqual([
    'reservation',
    'dispatch_intent',
  ]);
});

it('reconciles a lost reservation response without authorizing a send', async () => {
  const values = new Map<string, string>();
  const journal = new BrowserBoothMetadataJournal({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  });
  const printer = new SimulatedPrinterV2('printer');
  const generation = (await printer.connect()).connectionGeneration;
  const reconciled: string[][] = [];
  await expect(
    dispatchReservedAttempt(
      {
        runId: 'run',
        sessionId: 'lost-reserve',
        captureId: 'capture',
        reservationOperationId: 'reserve',
        dispatchOperationId: 'dispatch-op',
        printerId: 'printer',
        connectionGeneration: generation,
        image: new Uint8Array([1]),
      },
      {
        journal,
        printer,
        reserve: async () => {
          throw new Error('response lost');
        },
        authorizeDispatch: async () => {
          throw new Error('must not dispatch');
        },
        reconcile: async (entries) => {
          reconciled.push(entries.map((entry) => entry.kind));
          return entries.length ? 'pending' : 'clear';
        },
        canSendNow: () => true,
        releaseImage: () => {},
      }
    )
  ).rejects.toThrow('response lost');
  expect(reconciled).toEqual([[], ['reservation']]);
  expect(journal.readOperations().map((entry) => entry.kind)).toEqual(['reservation']);
  expect(printer.commandCount).toBe(0);
});

it('does not dispatch when reservation is denied at exhausted package capacity', async () => {
  const { input, deps, journal, printer } = await rig();
  deps.reserve = async () => {
    throw new Error('booked_prints_exhausted');
  };
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('booked_prints_exhausted');
  expect(deps.authorizeDispatch).not.toHaveBeenCalled();
  expect(printer.commandCount).toBe(0);
  expect(journal.readOperations().map((entry) => entry.kind)).toEqual(['reservation']);
  expect(deps.releaseImage).toHaveBeenCalledOnce();
});

it('does not reserve when metadata storage fails before reservation', async () => {
  const { input, deps, storage, printer } = await rig();
  deps.journal = new BrowserBoothMetadataJournal({
    ...storage,
    setItem: () => {
      throw new Error('quota');
    },
  });
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('quota');
  expect(deps.reserve).not.toHaveBeenCalled();
  expect(printer.commandCount).toBe(0);
  expect(deps.releaseImage).toHaveBeenCalledOnce();
});

it('does not reserve when the existing journal cannot be read', async () => {
  const { input, deps, printer } = await rig();
  deps.journal = new BrowserBoothMetadataJournal({
    getItem: () => {
      throw new Error('storage read failed');
    },
    setItem: () => {},
    removeItem: () => {},
  });
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('storage read failed');
  expect(deps.reconcile).toHaveBeenCalledWith([]);
  expect(deps.reserve).not.toHaveBeenCalled();
  expect(printer.commandCount).toBe(0);
});

it('keeps a reservation hold and does not dispatch when local readiness changes', async () => {
  const { input, deps, journal, printer } = await rig();
  deps.reserve = async () => {
    printer.emit('connection_changed');
    return { attemptId: 'attempt' };
  };
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('Printer not ready');
  expect(deps.authorizeDispatch).not.toHaveBeenCalled();
  expect(journal.readOperations().map((entry) => entry.kind)).toEqual(['reservation']);
});

it('keeps intent and reconciles a lost dispatch response without sending', async () => {
  const { input, deps, journal, printer } = await rig();
  deps.authorizeDispatch = async () => {
    throw new Error('dispatch response lost');
  };
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('dispatch response lost');
  expect(journal.readOperations().at(-1)).toMatchObject({
    kind: 'dispatch_intent',
    phase: 'requested',
  });
  expect(deps.reconcile).toHaveBeenCalledTimes(2);
  expect(printer.commandCount).toBe(0);
});

it('releases the photo before waiting on offline reconciliation', async () => {
  const { input, deps, printer } = await rig();
  deps.authorizeDispatch = async () => {
    throw new Error('dispatch response lost');
  };
  let finishReconcile!: () => void;
  let reconciliationStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    reconciliationStarted = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    finishReconcile = resolve;
  });
  let calls = 0;
  deps.reconcile = async () => {
    calls++;
    if (calls === 1) return 'clear';
    reconciliationStarted();
    await pending;
    return 'pending';
  };
  const dispatching = dispatchReservedAttempt(input, deps).then(
    () => null,
    (error: unknown) => error
  );
  await started;
  try {
    expect(deps.releaseImage).toHaveBeenCalledOnce();
    expect(printer.commandCount).toBe(0);
  } finally {
    finishReconcile();
  }
  expect(await dispatching).toBeInstanceOf(Error);
  expect(deps.releaseImage).toHaveBeenCalledOnce();
});

it('does not send when a local stop arrives during dispatch authorization', async () => {
  const { input, deps, printer, journal } = await rig();
  let allowed = true;
  deps.canSendNow = () => allowed;
  const authorize = deps.authorizeDispatch;
  deps.authorizeDispatch = async (attemptId, operationId) => {
    const result = await authorize(attemptId, operationId);
    allowed = false;
    return result;
  };
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('Local dispatch stopped');
  expect(printer.commandCount).toBe(0);
  expect(deps.releaseImage).toHaveBeenCalledOnce();
  expect(deps.reconcile).toHaveBeenCalledTimes(2);
  expect(journal.readOperations().at(-1)).toMatchObject({
    kind: 'dispatch_intent',
    phase: 'requested',
  });
});

it('does not reserve after a stop during the first readiness read', async () => {
  const { input, deps, printer } = await rig();
  let allowed = true;
  deps.canSendNow = () => allowed;
  deps.printer = {
    disconnect: printer.disconnect.bind(printer),
    connect: printer.connect.bind(printer),
    readReadiness: async () => {
      const snapshot = await printer.readReadiness();
      allowed = false;
      return snapshot;
    },
    observe: printer.observe.bind(printer),
    observeReload: printer.observeReload.bind(printer),
    sendOnce: printer.sendOnce.bind(printer),
  };
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('Local dispatch stopped');
  expect(deps.reserve).not.toHaveBeenCalled();
  expect(printer.commandCount).toBe(0);
  expect(deps.releaseImage).toHaveBeenCalledOnce();
});

it('checks a local stop after the final awaited readiness read', async () => {
  const { input, deps, printer } = await rig();
  let allowed = true;
  let reads = 0;
  deps.canSendNow = () => allowed;
  deps.printer = {
    disconnect: printer.disconnect.bind(printer),
    connect: printer.connect.bind(printer),
    readReadiness: async () => {
      const snapshot = await printer.readReadiness();
      if (++reads === 3) allowed = false;
      return snapshot;
    },
    observe: printer.observe.bind(printer),
    observeReload: printer.observeReload.bind(printer),
    sendOnce: printer.sendOnce.bind(printer),
  };
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('Local dispatch stopped');
  expect(reads).toBe(3);
  expect(printer.commandCount).toBe(0);
  expect(deps.releaseImage).toHaveBeenCalledOnce();
});

it('does not send a replayed authorization even if a caller supplies a grant', async () => {
  const { input, deps, printer } = await rig();
  deps.authorizeDispatch = async (attemptId) => ({
    sendAllowed: false,
    replayed: true,
    authorization: {
      attemptId,
      dispatchId: 'fake',
      printerId: 'printer',
      connectionGeneration: input.connectionGeneration,
    },
  });
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow(
    'No live dispatch authorization'
  );
  expect(printer.commandCount).toBe(0);
});

it('blocks physical write if authorized intent cannot be durably updated', async () => {
  const { input, deps, journal, printer } = await rig();
  deps.journal = {
    readOperations: () => journal.readOperations(),
    acknowledgeOperation: (id) => journal.acknowledgeOperation(id),
    putOperation: (entry) => {
      if (entry.kind === 'dispatch_intent' && entry.phase === 'authorized')
        throw new Error('journal write lost');
      journal.putOperation(entry);
    },
  };
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('journal write lost');
  expect(printer.commandCount).toBe(0);
  expect(journal.readOperations().at(-1)).toMatchObject({ phase: 'requested' });
});

it('requires server reconciliation after restart even if the local journal is missing', async () => {
  const { input, deps, printer } = await rig();
  deps.reconcile = async () => 'pending';
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('Previous operation pending');
  expect(deps.reserve).not.toHaveBeenCalled();
  expect(printer.commandCount).toBe(0);
});

it('does not send after restart with an authorized intent already persisted', async () => {
  const { input, deps, journal, storage, printer } = await rig();
  journal.putOperation({
    kind: 'dispatch_intent',
    operationId: input.dispatchOperationId,
    runId: input.runId,
    attemptId: 'attempt',
    printerId: input.printerId,
    connectionGeneration: input.connectionGeneration,
    phase: 'requested',
    recordedAt: 1,
  });
  journal.putOperation({
    kind: 'dispatch_intent',
    operationId: input.dispatchOperationId,
    runId: input.runId,
    attemptId: 'attempt',
    printerId: input.printerId,
    connectionGeneration: input.connectionGeneration,
    phase: 'authorized',
    dispatchId: 'dispatch',
    recordedAt: 1,
  });
  deps.journal = new BrowserBoothMetadataJournal(storage);
  deps.reconcile = async () => 'pending';
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow('Previous operation pending');
  expect(deps.reserve).not.toHaveBeenCalled();
  expect(printer.commandCount).toBe(0);
});

it('does not let a new journal instance resend the same session in the running page', async () => {
  const { input, deps, storage, journal } = await rig();
  await dispatchReservedAttempt(input, deps);
  journal.acknowledgeOperation(input.reservationOperationId);
  journal.acknowledgeOperation(input.dispatchOperationId);
  const secondPrinter = new SimulatedPrinterV2('printer');
  await secondPrinter.connect();
  await expect(
    dispatchReservedAttempt(input, {
      ...deps,
      journal: new BrowserBoothMetadataJournal(storage),
      printer: secondPrinter,
    })
  ).rejects.toThrow();
  expect(secondPrinter.commandCount).toBe(0);
});

it('blocks concurrent helpers for the same session before either can send twice', async () => {
  const { input, deps, printer } = await rig();
  let resolveReserve!: (value: { attemptId: string }) => void;
  let reserveStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    reserveStarted = resolve;
  });
  deps.reserve = async () => {
    reserveStarted();
    return new Promise((resolve) => {
      resolveReserve = resolve;
    });
  };
  const first = dispatchReservedAttempt(input, deps);
  await started;
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow(
    'Session already dispatched or pending'
  );
  resolveReserve({ attemptId: 'attempt' });
  await first;
  expect(printer.commandCount).toBe(1);
});

it('holds photo bytes only until an already authorized transport finishes', async () => {
  const { input, deps } = await rig();
  let allowed = true;
  deps.canSendNow = () => allowed;
  let finishWrite!: () => void;
  let startedWrite!: () => void;
  const started = new Promise<void>((resolve) => {
    startedWrite = resolve;
  });
  const writing = new Promise<void>((resolve) => {
    finishWrite = resolve;
  });
  const printer = new SimulatedPrinterV2('printer', async () => {
    allowed = false;
    startedWrite();
    await writing;
  });
  await printer.connect();
  deps.printer = printer;
  const dispatching = dispatchReservedAttempt(input, deps);
  await started;
  expect(deps.releaseImage).not.toHaveBeenCalled();
  finishWrite();
  await dispatching;
  expect(deps.releaseImage).toHaveBeenCalledOnce();
});

it('retains accepted evidence until acknowledgement and then discards it', async () => {
  const { journal } = await rig();
  const observation = {
    kind: 'command_accepted' as const,
    observationId: 'accepted-1',
    printerId: 'printer',
    adapterVersion: 'simulator-v2',
    evidenceVersion: 'simulator-v1',
    connectionGeneration: 1,
    attemptId: 'attempt',
    dispatchId: 'dispatch',
  };
  const reported: string[] = [];
  await expect(
    recordAndReportObservation('run', observation, journal, async (entry) => {
      reported.push(entry.observationId);
      throw new Error('ack lost');
    })
  ).rejects.toThrow('ack lost');
  expect(journal.readOperations().map((entry) => entry.kind)).toEqual(['observation']);
  await recordAndReportObservation('run', observation, journal, async (entry) => {
    reported.push(entry.observationId);
  });
  expect(reported).toEqual(['accepted-1', 'accepted-1']);
  expect(journal.readOperations()).toEqual([]);
});

it('retains full ejection evidence while offline without keeping image bytes', async () => {
  const { journal, values } = await rig();
  const observation = {
    kind: 'full_ejection_confirmed' as const,
    observationId: 'ejected-1',
    printerId: 'printer',
    adapterVersion: 'simulator-v2',
    evidenceVersion: 'simulator-v1',
    connectionGeneration: 1,
    attemptId: 'attempt',
    dispatchId: 'dispatch',
  };
  await expect(
    recordAndReportObservation('run', observation, journal, async () => {
      throw new Error('offline');
    })
  ).rejects.toThrow('offline');
  expect(journal.readOperations()).toMatchObject([
    { kind: 'observation', observationKind: 'full_ejection_confirmed', observationId: 'ejected-1' },
  ]);
  expect([...values.values()].join(' ')).not.toContain('image');
});

it('rejects a replay that changes the attempt under one observation ID', async () => {
  const { journal } = await rig();
  const observation = {
    kind: 'command_accepted' as const,
    observationId: 'same-observation',
    printerId: 'printer',
    adapterVersion: 'simulator-v2',
    evidenceVersion: 'simulator-v1',
    connectionGeneration: 1,
    attemptId: 'first-attempt',
    dispatchId: 'first-dispatch',
  };
  await expect(
    recordAndReportObservation('run', observation, journal, async () => {
      throw new Error('offline');
    })
  ).rejects.toThrow('offline');
  await expect(
    recordAndReportObservation(
      'run',
      { ...observation, attemptId: 'second-attempt' },
      journal,
      async () => {}
    )
  ).rejects.toThrow('Observation journal conflict');
  expect(journal.readOperations()).toMatchObject([{ attemptId: 'first-attempt' }]);
});

it('retains the safe printer identity for an offline connection observation', async () => {
  const { journal } = await rig();
  const observation = {
    kind: 'connection_changed' as const,
    attemptId: 'attempt',
    dispatchId: 'dispatch',
    observationId: 'connection-1',
    printerId: 'printer',
    adapterVersion: 'simulator-v2',
    evidenceVersion: 'simulator-v1',
    connectionGeneration: 1,
  };
  await expect(
    recordAndReportObservation('run', observation, journal, async () => {
      throw new Error('offline');
    })
  ).rejects.toThrow('offline');
  expect(journal.readOperations()).toMatchObject([{ kind: 'observation', printerId: 'printer' }]);
});
