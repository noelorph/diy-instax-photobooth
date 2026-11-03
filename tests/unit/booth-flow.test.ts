import { afterEach, expect, it, vi } from 'vitest';
import { BoothFlow } from '@/features/booth/flow';
import { SimulatedPrinterV2 } from '@/features/booth/printer/simulator-v2';
import { BrowserBoothMetadataJournal } from '@/features/booth/print-journal';
const counts = {
  originalPackages: 1,
  additionalPackages: 0,
  totalBookedPrints: 10,
  printed: 0,
  unresolved: 0,
  printsRemaining: 10,
  printsAvailable: 10,
};
const observation = {
  cameraPermission: true,
  cameraLive: true,
  serverReachable: true,
  printerConnected: true,
  printerReady: true,
  oldJobCleared: true,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const owned: BoothFlow[] = [];
function setup() {
  let stateGate: Promise<void> | undefined;
  let ackGate: Promise<void> | undefined;
  const observations: unknown[] = [];
  let state = 'Active';
  let calls = 0;
  let generation = 1;
  let fail = false;
  let failStatus = 401;
  let readinessError = false;
  const printer = new SimulatedPrinterV2('simulator');
  const transport = async (path: string, body?: Record<string, unknown>) => {
    if (fail) throw Object.assign(new Error('denied'), { status: failStatus });
    if (path === '/api/booth/readiness') {
      if (readinessError) throw Object.assign(new Error('not ready'), { status: 409 });
      if (body?.kind === 'connection_changed') generation = body.connectionGeneration as number;
      calls++;
      observations.push(body?.observation);
      await ackGate;
      return {
        revision: 3,
        receipt: {
          operationId: body!.operationId,
          kind: 'report_readiness',
          committedRevision: 3,
          result: {},
        },
        replayed: false,
      };
    }
    await stateGate;
    return {
      revision: 3,
      runId: crypto.randomUUID(),
      state,
      counts,
      readiness: { ready: true, stage: 'guest', blockers: [], counts },
      blockers: [],
      allowedActions: {
        startGuest: true,
        reportReadiness: true,
        connectPrinter: false,
        enableCamera: false,
      },
      readinessWindowId: crypto.randomUUID(),
      printerId: 'simulator',
      connectionGeneration: generation,
      pendingAttemptId: null,
    };
  };
  const flow = new BoothFlow({
    transport,
    printer,
    journal: new BrowserBoothMetadataJournal(sessionStorage),
  });
  owned.push(flow);
  return {
    holdState: (gate?: Promise<void>) => {
      stateGate = gate;
    },
    holdAck: (gate?: Promise<void>) => {
      ackGate = gate;
    },
    rejectReadiness: () => {
      readinessError = true;
    },
    observations,
    flow,
    printer,
    reports: () => calls,
    state: (s: string) => {
      state = s;
    },
    deny: (status = 401) => {
      fail = true;
      failStatus = status;
    },
  };
}
afterEach(() => {
  owned.splice(0).forEach((flow) => flow.dispose());
  sessionStorage.clear();
  vi.useRealTimers();
});
it('invalidates setup readiness until actual scoped equipment is acknowledged', async () => {
  const s = setup();
  await s.printer.connect();
  await s.flow.initialize();
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  await s.flow.reportEquipment(observation);
  expect(s.reports()).toBe(1);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
});
it('blocks arrival when camera absent, printer disconnected or local observations stale', async () => {
  vi.useFakeTimers();
  const s = setup();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  await s.flow.connectPrinter();
  await s.flow.reportEquipment({ ...observation, cameraLive: false });
  expect(s.flow.getSnapshot().allowedActions.enableCamera).toBe(true);
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
  await vi.advanceTimersByTimeAsync(5001);
  await s.flow.refresh();
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
});
it.each(['Paused', 'Finishing', 'Finished'])(
  'projects %s without offering Guest admission',
  async (state) => {
    const s = setup();
    s.state(state);
    await s.flow.initialize();
    expect(s.flow.getSnapshot().phase).toBe(state.toLowerCase());
  }
);
it('access denial clears the admission state', async () => {
  const s = setup();
  await s.flow.initialize();
  s.deny();
  await s.flow.refresh();
  expect(s.flow.getSnapshot().phase).toBe('access-required');
});
it('disposed owners ignore late readiness acknowledgements', async () => {
  const s = setup();
  await s.printer.connect();
  await s.flow.initialize();
  const gate = deferred();
  s.holdAck(gate.promise);
  const reporting = s.flow.reportEquipment(observation);
  await vi.waitFor(() => expect(s.reports()).toBe(1));
  s.flow.dispose();
  const original = s.flow.getSnapshot();
  gate.resolve();
  await reporting;
  expect(s.flow.getSnapshot()).toBe(original);
});
it('expires local welcome while a state request remains unresolved', async () => {
  vi.useFakeTimers();
  const s = setup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
  const gate = deferred();
  s.holdState(gate.promise);
  const pending = s.flow.reportEquipment(observation);
  await vi.advanceTimersByTimeAsync(5001);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  expect(s.flow.getSnapshot().blockers).toContain('readiness_stale');
  gate.resolve();
  await pending;
});
it('never sends a positive observation superseded while its state read is pending', async () => {
  const s = setup();
  await s.printer.connect();
  await s.flow.initialize();
  const gate = deferred();
  s.holdState(gate.promise);
  const positive = s.flow.reportEquipment(observation);
  const negative = s.flow.reportEquipment({ ...observation, cameraLive: false });
  s.holdState();
  gate.resolve();
  await Promise.all([positive, negative]);
  expect(s.observations).toEqual([{ ...observation, cameraLive: false }]);
});
it('never retimestamps an observation held beyond its freshness window', async () => {
  vi.useFakeTimers();
  const s = setup();
  await s.printer.connect();
  await s.flow.initialize();
  const gate = deferred();
  s.holdState(gate.promise);
  const pending = s.flow.reportEquipment(observation);
  await vi.advanceTimersByTimeAsync(5001);
  s.holdState();
  gate.resolve();
  await pending;
  expect(s.reports()).toBe(0);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
});
it('reports a new connection generation before using reconnected printer readiness', async () => {
  const printer = new SimulatedPrinterV2('simulator');
  await printer.connect();
  let changed = false;
  const flow = new BoothFlow({
    printer,
    journal: new BrowserBoothMetadataJournal(sessionStorage),
    transport: async (path, body) => {
      if (path === '/api/booth/readiness') {
        if (body?.kind === 'connection_changed') {
          expect(body.connectionGeneration).toBe(2);
          changed = true;
        }
        return {
          revision: 3,
          replayed: false,
          receipt: {
            operationId: body!.operationId,
            kind: 'report_readiness',
            committedRevision: 3,
            result: {},
          },
        };
      }
      return {
        state: 'Active',
        printerId: 'simulator',
        connectionGeneration: changed ? 2 : 1,
        revision: 3,
        runId: crypto.randomUUID(),
        counts,
        blockers: [],
        readinessWindowId: crypto.randomUUID(),
        allowedActions: { startGuest: true, reportReadiness: true },
      };
    },
  });
  await flow.initialize();
  await flow.reportEquipment(observation);
  printer.emit('connection_changed');
  await flow.connectPrinter();
  expect(changed).toBe(true);
  expect(flow.getSnapshot().phase).toBe('unavailable');
  await flow.reportEquipment(observation);
  expect(flow.getSnapshot().phase).toBe('welcome');
});
it.each([2, 3])(
  'rechecks observation epoch after awaited printer work %s before POST',
  async (blockedRead) => {
    const s = setup();
    await s.printer.connect();
    await s.flow.initialize();
    const gate = deferred();
    const read = s.printer.readReadiness.bind(s.printer);
    let reads = 0;
    vi.spyOn(s.printer, 'readReadiness').mockImplementation(async () => {
      reads++;
      if (reads === blockedRead) await gate.promise;
      return read();
    });
    const positive = s.flow.reportEquipment(observation);
    await vi.waitFor(() => expect(reads).toBe(blockedRead));
    const negative = s.flow.reportEquipment({ ...observation, cameraLive: false });
    gate.resolve();
    await Promise.all([positive, negative]);
    expect(s.observations).toEqual([{ ...observation, cameraLive: false }]);
  }
);
it('invalidates known camera loss before awaiting a blocked printer read', async () => {
  const s = setup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  const gate = deferred(),
    read = s.printer.readReadiness.bind(s.printer);
  vi.spyOn(s.printer, 'readReadiness').mockImplementation(async () => {
    await gate.promise;
    return read();
  });
  const pending = s.flow.reportEquipment({ ...observation, cameraLive: false });
  const phase = s.flow.getSnapshot().phase;
  gate.resolve();
  await pending;
  expect(phase).toBe('unavailable');
});

it.each(['Paused', 'Finishing'])(
  'keeps %s visible when restored access still needs equipment recovery',
  async (state) => {
    const s = setup();
    s.state(state);
    await s.flow.initialize();
    s.rejectReadiness();
    await s.flow.reportEquipment(observation);
    expect(s.flow.getSnapshot().phase).toBe(state.toLowerCase());
    expect(s.flow.getSnapshot().allowedActions.connectPrinter).toBe(true);
    expect(s.flow.getSnapshot().blockers).toContain('readiness_stale');
    expect(s.flow.getSnapshot().blockers).toContain('printer_connection');
    expect(s.flow.getSnapshot().counts).toEqual(counts);
  }
);

it('keeps access loss above a prior pause when a later status refresh is unavailable', async () => {
  const s = setup();
  s.state('Paused');
  await s.flow.initialize();
  s.deny();
  await s.flow.refresh();
  expect(s.flow.getSnapshot().phase).toBe('access-required');
  s.deny(503);
  await s.flow.refresh();
  expect(s.flow.getSnapshot().phase).toBe('access-required');
  expect(s.flow.getSnapshot().allowedActions.connectPrinter).toBe(false);
  expect(s.flow.getSnapshot().counts).toBeUndefined();
});

function connectionSetup(generation = 2, printer = new SimulatedPrinterV2('simulator')) {
  let revision = 3;
  let window = crypto.randomUUID();
  let failure: 'before' | 'after' | 'stale' | 'window' | undefined;
  const requests: Record<string, unknown>[] = [];
  const receipts = new Map<string, unknown>();
  const reports: Record<string, unknown>[] = [];
  let reportGate: Promise<void> | undefined;
  const transport = async (path: string, body?: Record<string, unknown>) => {
    if (body) {
      const loseReply = failure === 'after';
      if (body.kind === 'connection_changed') {
        requests.push(body);
        if (receipts.has(body.operationId as string))
          return receipts.get(body.operationId as string);
        const mode = failure;
        failure = undefined;
        if (mode === 'before') throw new Error('offline');
        if (mode === 'window') {
          window = crypto.randomUUID();
          throw Object.assign(new Error('expired window'), { status: 409 });
        }
        if (mode === 'stale') {
          revision++;
          throw Object.assign(new Error('stale revision'), { status: 409 });
        }
        if (
          body.printerId !== 'simulator' ||
          body.connectionGeneration !== generation + 1 ||
          body.expectedRevision !== revision ||
          body.readinessWindowId !== window
        )
          throw Object.assign(new Error('not ready'), { status: 409 });
        generation++;
        revision++;
      }
      if (!body.kind) {
        reports.push(body);
        await reportGate;
        if (body.connectionGeneration !== generation)
          throw Object.assign(new Error('not ready'), { status: 409 });
      }
      const reply = {
        revision,
        replayed: false,
        receipt: {
          operationId: body.operationId,
          kind: 'report_readiness',
          committedRevision: revision,
          result: {},
        },
      };
      receipts.set(body.operationId as string, reply);
      if (body.kind === 'connection_changed' && loseReply) throw new Error('lost reply');
      return reply;
    }
    window = crypto.randomUUID();
    return {
      state: 'Active',
      revision,
      runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      counts,
      printerId: 'simulator',
      connectionGeneration: generation,
      blockers: [],
      readinessWindowId: window,
      allowedActions: { startGuest: true, reportReadiness: true },
    };
  };
  const flow = new BoothFlow({
    printer,
    transport,
    journal: new BrowserBoothMetadataJournal(sessionStorage),
  });
  owned.push(flow);
  return {
    flow,
    printer,
    requests,
    reports,
    holdReport: (gate: Promise<void>) => {
      reportGate = gate;
    },
    fail: (mode: typeof failure) => {
      failure = mode;
    },
    generation: () => generation,
  };
}

it.each([0, 2])(
  'rebases a fresh adapter against authoritative generation %s',
  async (generation) => {
    const s = connectionSetup(generation);
    await s.flow.initialize();
    await s.flow.connectPrinter();
    expect(s.generation()).toBe(generation + 1);
    expect((await s.printer.readReadiness()).connectionGeneration).toBe(generation + 1);
    expect(s.flow.getSnapshot().phase).toBe('unavailable');
    await s.flow.reportEquipment(observation);
    expect(s.flow.getSnapshot().phase).toBe('welcome');
  }
);

it('retries a failed connection update with identical operation and exposes recovery', async () => {
  const s = connectionSetup();
  await s.flow.initialize();
  s.fail('before');
  await s.flow.connectPrinter();
  expect(s.flow.getSnapshot().allowedActions.connectPrinter).toBe(true);
  await s.flow.connectPrinter();
  expect(s.requests).toHaveLength(2);
  expect(s.requests[1]).toEqual(s.requests[0]);
  expect(s.generation()).toBe(3);
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
});

it.each(['stale', 'window'] as const)(
  'replaces a rejected %s connection operation using a fresh window',
  async (mode) => {
    const s = connectionSetup();
    await s.flow.initialize();
    s.fail(mode);
    await s.flow.connectPrinter();
    await s.flow.connectPrinter();
    expect(s.requests).toHaveLength(2);
    expect(s.requests[1].operationId).not.toBe(s.requests[0].operationId);
    expect(s.requests[1].expectedRevision).toBe(mode === 'stale' ? 4 : 3);
    expect(s.requests[1].readinessWindowId).not.toBe(s.requests[0].readinessWindowId);
    expect(s.generation()).toBe(3);
  }
);

it('recovers a lost committed connection reply by replaying its receipt without another generation', async () => {
  const s = connectionSetup();
  await s.flow.initialize();
  s.fail('after');
  await s.flow.connectPrinter();
  expect(s.generation()).toBe(3);
  expect(s.flow.getSnapshot().allowedActions.connectPrinter).toBe(true);
  await s.flow.connectPrinter();
  expect(s.requests[1]).toEqual(s.requests[0]);
  expect(s.generation()).toBe(3);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
});

it('coalesces duplicate connection gestures and retains a matching setup connection', async () => {
  const printer = new SimulatedPrinterV2('simulator');
  await printer.connect();
  const s = connectionSetup(1, printer);
  await s.flow.initialize();
  await Promise.all([s.flow.connectPrinter(), s.flow.connectPrinter()]);
  expect(s.requests).toHaveLength(0);
  expect(s.generation()).toBe(1);
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
});

it('rejects a different printer identity without advancing the bound generation', async () => {
  const s = connectionSetup(2, new SimulatedPrinterV2('wrong-printer'));
  await s.flow.initialize();
  await s.flow.connectPrinter();
  expect(s.requests).toHaveLength(0);
  expect(s.generation()).toBe(2);
  expect(s.flow.getSnapshot().allowedActions.connectPrinter).toBe(true);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
});

it('reconciles a recreated setup owner and coalesces duplicate reconnect gestures', async () => {
  const printer = new SimulatedPrinterV2('simulator');
  await printer.connect();
  const connect = vi.spyOn(printer, 'connect');
  const s = connectionSetup(2, printer);
  await s.flow.initialize();
  await Promise.all([s.flow.connectPrinter(), s.flow.connectPrinter()]);
  expect(connect).toHaveBeenCalledTimes(1);
  expect(s.requests).toHaveLength(1);
  expect(s.generation()).toBe(3);
  expect((await printer.readReadiness()).connectionGeneration).toBe(3);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
});

it('retains fresh acknowledged Welcome throughout a healthy refresh', async () => {
  const s = setup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  const phases: string[] = [];
  s.flow.subscribe(() => phases.push(s.flow.getSnapshot().phase));
  await s.flow.reportEquipment(observation);
  expect(phases.length).toBeGreaterThan(0);
  expect(new Set(phases)).toEqual(new Set(['welcome']));
});

it.each(['serverReachable', 'printerReady', 'oldJobCleared'] as const)(
  'blocks immediately on negative %s even with a held refresh',
  async (field) => {
    const s = setup();
    await s.printer.connect();
    await s.flow.initialize();
    await s.flow.reportEquipment(observation);
    const gate = deferred();
    s.holdState(gate.promise);
    const pending = s.flow.reportEquipment({ ...observation, [field]: false });
    expect(s.flow.getSnapshot().phase).toBe('unavailable');
    gate.resolve();
    await pending;
    expect(s.flow.getSnapshot().phase).toBe('unavailable');
  }
);

it('a late readiness failure cannot replace Finished with unavailable', async () => {
  const s = setup();
  await s.printer.connect();
  await s.flow.initialize();
  const gate = deferred();
  s.holdAck(
    gate.promise.then(() => {
      throw new Error('late failure');
    })
  );
  const reporting = s.flow.reportEquipment(observation);
  await vi.waitFor(() => expect(s.reports()).toBe(1));
  s.state('Finished');
  await s.flow.refresh();
  expect(s.flow.getSnapshot().phase).toBe('finished');
  gate.resolve();
  await reporting;
  expect(s.flow.getSnapshot().phase).toBe('finished');
});

it('accepts a fresh acknowledgement despite a newer healthy polling sample', async () => {
  vi.useFakeTimers();
  const s = setup();
  await s.printer.connect();
  await s.flow.initialize();
  const first = deferred(),
    second = deferred();
  s.holdAck(first.promise);
  const pending = s.flow.reportEquipment(observation);
  await vi.advanceTimersByTimeAsync(2000);
  s.flow.reportEquipment(observation);
  s.holdAck(second.promise);
  first.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(s.reports()).toBe(2);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
  second.resolve();
  await pending;
});

it('reports a recreated disconnected adapter against the authoritative connection before reconnecting', async () => {
  const s = connectionSetup(2);
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  expect(s.reports[0]).toMatchObject({
    connectionGeneration: 2,
    printerId: 'simulator',
    observation: { printerConnected: false, printerReady: false, oldJobCleared: false },
  });
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  expect(s.flow.getSnapshot().allowedActions.connectPrinter).toBe(true);
  expect((await s.printer.readReadiness()).connectionGeneration).toBe(0);
  await s.flow.connectPrinter();
  expect(s.generation()).toBe(3);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
});

it('settles an in-flight readiness write before changing its connection generation', async () => {
  const s = connectionSetup(2);
  await s.flow.initialize();
  const gate = deferred();
  s.holdReport(gate.promise);
  const reporting = s.flow.reportEquipment(observation);
  await vi.waitFor(() => expect(s.reports).toHaveLength(1));
  const connecting = s.flow.connectPrinter();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(s.requests).toHaveLength(0);
  gate.resolve();
  await Promise.all([reporting, connecting]);
  expect(s.requests).toHaveLength(1);
  expect(s.generation()).toBe(3);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
});

function guestSetup(baseCounts = counts) {
  const requests: { path: string; body?: Record<string, unknown> }[] = [];
  const runId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const attemptId = crypto.randomUUID();
  const dispatchId = crypto.randomUUID();
  const secondSessionId = crypto.randomUUID();
  const secondAttemptId = crypto.randomUUID();
  const secondDispatchId = crypto.randomUUID();
  let currentSessionId = sessionId;
  let currentAttemptId = attemptId;
  let currentAuthorization = {
    attemptId,
    dispatchId,
    printerId: 'simulator',
    connectionGeneration: 1,
  };
  let sessionsStarted = 0;
  const printer = new SimulatedPrinterV2('simulator');
  const journal = new BrowserBoothMetadataJournal(sessionStorage);
  let revision = 1;
  let captureGate: Promise<void> | undefined;
  let observationGate: Promise<void> | undefined;
  let startGate: Promise<void> | undefined;
  let state = 'Active';
  let openSessionState = false;
  let attemptState: string | undefined;
  let observationResponseLost = false;
  let dispatchResponseLost = false;
  let reserveResponseLost = false;
  let rejectBusyReadiness = false;
  let observationLostBeforeCommit = false;
  let acceptedLooksPrinted = false;
  let oldJobSafe = true;
  const receipts = new Map<string, Record<string, unknown>>();
  const authorization = { attemptId, dispatchId, printerId: 'simulator', connectionGeneration: 1 };
  const transport = async (path: string, body?: Record<string, unknown>) => {
    requests.push({ path, body });
    if (
      path === '/api/booth/readiness' &&
      rejectBusyReadiness &&
      attemptState === 'Dispatching' &&
      (body?.observation as { printerReady?: boolean } | undefined)?.printerReady === false
    )
      throw Object.assign(new Error('busy printer'), { status: 409 });
    if (path === '/api/booth/state')
      return {
        revision,
        runId,
        state,
        counts: attemptState
          ? {
              ...baseCounts,
              printed: baseCounts.printed + (attemptState === 'Printed' ? 1 : 0),
              unresolved: attemptState === 'Printed' || attemptState === 'NotPrinted' ? 0 : 1,
              printsRemaining: baseCounts.printsRemaining - (attemptState === 'Printed' ? 1 : 0),
              printsAvailable: baseCounts.printsAvailable - (attemptState === 'NotPrinted' ? 0 : 1),
            }
          : baseCounts,
        blockers: [
          ...(openSessionState ? ['guest_session_open'] : []),
          ...(attemptState && attemptState !== 'Printed' && attemptState !== 'NotPrinted'
            ? ['print_pending']
            : []),
          ...(!oldJobSafe ? ['printer_not_safe'] : []),
        ],
        allowedActions: {
          startGuest:
            !openSessionState &&
            oldJobSafe &&
            (!attemptState || attemptState === 'Printed' || attemptState === 'NotPrinted'),
          reportReadiness: true,
        },
        readinessWindowId: '00000000-0000-4000-8000-000000000001',
        printerId: 'simulator',
        connectionGeneration: 1,
        pendingAttemptId:
          attemptState && attemptState !== 'Printed' && attemptState !== 'NotPrinted'
            ? currentAttemptId
            : null,
      };
    if (path.startsWith('/api/booth/operations/')) {
      const receipt = receipts.get(path.split('/').at(-1)!);
      if (!receipt) throw Object.assign(new Error('missing receipt'), { status: 404 });
      return { revision, receipt };
    }
    const kind =
      path === '/api/booth/readiness'
        ? 'report_readiness'
        : path === '/api/booth/sessions'
          ? 'start_session'
          : path === '/api/booth/captures'
            ? 'record_capture'
            : path === '/api/booth/print-attempts'
              ? 'reserve'
              : path.endsWith('/dispatch')
                ? 'dispatch'
                : path.endsWith('/observations')
                  ? 'observe'
                  : path.endsWith('/reconcile')
                    ? 'reconcile'
                    : 'end_session';
    if (kind === 'start_session') await startGate;
    if (kind === 'record_capture') await captureGate;
    if (kind === 'observe') await observationGate;
    if (kind === 'reserve' && reserveResponseLost) throw new Error('reserve response lost');
    if (kind === 'observe' && observationLostBeforeCommit) {
      observationLostBeforeCommit = false;
      throw new Error('observation response lost before commit');
    }
    revision++;
    if (kind === 'start_session') {
      currentSessionId = sessionsStarted++ === 0 ? sessionId : secondSessionId;
      if (sessionsStarted > 1) attemptState = undefined;
    }
    if (kind === 'reserve') {
      attemptState = 'Reserved';
      if (sessionsStarted > 1) {
        currentAttemptId = secondAttemptId;
        currentAuthorization = {
          attemptId: secondAttemptId,
          dispatchId: secondDispatchId,
          printerId: 'simulator',
          connectionGeneration: 1,
        };
      }
    }
    if (kind === 'dispatch') {
      attemptState = 'Dispatching';
      oldJobSafe = false;
    }
    if (kind === 'observe')
      attemptState =
        body!.kind === 'full_ejection_confirmed'
          ? 'Printed'
          : body!.kind === 'command_accepted'
            ? acceptedLooksPrinted
              ? 'Printed'
              : 'Accepted'
            : body!.kind === 'ready_for_new_job'
              ? attemptState
              : 'Pending';
    if (kind === 'observe' && body!.kind === 'ready_for_new_job') oldJobSafe = true;
    if (kind === 'reconcile' && !(sessionsStarted > 1 && oldJobSafe))
      attemptState = attemptState === 'Reserved' ? 'NotPrinted' : 'Pending';
    const receipt = {
      operationId: body!.operationId,
      kind,
      committedRevision: revision,
      result:
        kind === 'start_session'
          ? { sessionId: currentSessionId }
          : kind === 'reserve'
            ? { attemptId: currentAttemptId, state: attemptState }
            : kind === 'dispatch' || kind === 'observe' || kind === 'reconcile'
              ? {
                  attemptId: currentAttemptId,
                  state:
                    kind === 'reconcile' && sessionsStarted > 1 && oldJobSafe
                      ? 'Printed'
                      : attemptState,
                }
              : {},
    };
    receipts.set(body!.operationId as string, receipt);
    if (kind === 'observe' && observationResponseLost) throw new Error('observation response lost');
    if (kind === 'dispatch' && dispatchResponseLost) throw new Error('dispatch response lost');
    return {
      revision,
      replayed: false,
      receipt,
      ...(kind === 'dispatch' ? { sendAllowed: true, authorization: currentAuthorization } : {}),
    };
  };
  const flow = new BoothFlow({ printer, journal, transport });
  owned.push(flow);
  return {
    flow,
    transport,
    printer,
    journal,
    requests,
    sessionId,
    attemptId,
    authorization,
    secondSessionId,
    secondAuthorization: {
      attemptId: secondAttemptId,
      dispatchId: secondDispatchId,
      printerId: 'simulator',
      connectionGeneration: 1,
    },
    loseObservationBeforeCommit: () => {
      observationLostBeforeCommit = true;
    },
    acceptedReturnsPrinted: () => {
      acceptedLooksPrinted = true;
    },
    loseObservationResponse: () => {
      observationResponseLost = true;
    },
    loseDispatchResponse: () => {
      dispatchResponseLost = true;
    },
    loseReserveResponse: () => {
      reserveResponseLost = true;
    },
    rejectBusyReadiness: () => {
      rejectBusyReadiness = true;
    },
    holdCapture: (gate?: Promise<void>) => {
      captureGate = gate;
    },
    holdObservation: (gate?: Promise<void>) => {
      observationGate = gate;
    },
    holdStart: (gate?: Promise<void>) => {
      startGate = gate;
    },
    setState: (next: string) => {
      state = next;
    },
    setOpenSessionState: (value: boolean) => {
      openSessionState = value;
    },
  };
}

it('starts a persisted Guest Session and records each completed shutter before review', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
  await s.flow.start();
  expect(s.flow.getSnapshot().phase).toBe('preview');
  const firstDiscard = vi.fn();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([1]),
    url: 'blob:first',
    discard: firstDiscard,
  }));
  expect(s.flow.getSnapshot().phase).toBe('review');
  const firstCaptureId = s.flow.getSnapshot().captureId;
  s.flow.retake();
  expect(firstDiscard).toHaveBeenCalledOnce();
  expect(s.flow.getSnapshot().phase).toBe('preview');
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([2]),
    url: 'blob:second',
    discard: vi.fn(),
  }));
  const selectedCaptureId = s.flow.getSnapshot().captureId;
  expect(selectedCaptureId).not.toBe(firstCaptureId);
  const recordCaptureBodies = s.requests
    .filter((request) => request.path === '/api/booth/captures')
    .map((request) => request.body!);
  expect(recordCaptureBodies).toHaveLength(2);
  expect(recordCaptureBodies.every((body) => !('image' in body) && !('url' in body))).toBe(true);
  expect(s.flow.getSnapshot().shutterCount).toBe(2);
  expect(s.journal.readOperations()).toEqual([]);
  expect(JSON.stringify(s.requests)).not.toContain('blob:');
});

it('warns at 75 seconds, ends the idle Guest at 90 seconds, and discards review photo', async () => {
  vi.useFakeTimers();
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  await vi.advanceTimersByTimeAsync(74_999);
  expect(s.flow.getSnapshot().inactivityWarning).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(s.flow.getSnapshot().inactivityWarning).toBe(true);
  s.flow.continueGuest();
  expect(s.flow.getSnapshot().inactivityWarning).toBe(false);
  await vi.advanceTimersByTimeAsync(74_999);
  expect(s.flow.getSnapshot().inactivityWarning).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(s.flow.getSnapshot().inactivityWarning).toBe(true);
  s.flow.continueGuest();
  s.flow.countdown();
  const discard = vi.fn();
  await s.flow.shutter(async () => ({ bytes: new Uint8Array([7]), url: 'blob:idle', discard }));
  await vi.advanceTimersByTimeAsync(89_999);
  expect(s.flow.getSnapshot().phase).toBe('review');
  expect(discard).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(discard).toHaveBeenCalledOnce();
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  expect(s.requests.some(({ path }) => path === `/api/booth/sessions/${s.sessionId}/end`)).toBe(
    true
  );
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
  await s.flow.start();
  expect(s.requests.filter(({ path }) => path === '/api/booth/sessions')).toHaveLength(2);
  expect(s.flow.getSnapshot().phase).toBe('preview');
  expect(s.flow.getSnapshot().captureId).toBeUndefined();
});

it('clears a warning when Guest leaves preview or review', async () => {
  vi.useFakeTimers();
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  const waitWithReadiness = async () => {
    for (let i = 0; i < 18; i++) {
      await vi.advanceTimersByTimeAsync(4_000);
      await s.flow.reportEquipment(observation);
    }
    await vi.advanceTimersByTimeAsync(3_000);
  };
  await waitWithReadiness();
  expect(s.flow.getSnapshot().inactivityWarning).toBe(true);
  await s.flow.reportEquipment(observation);
  s.flow.countdown();
  expect(s.flow.getSnapshot().inactivityWarning).toBe(false);
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([3]),
    url: 'blob:transition',
    discard: vi.fn(),
  }));
  expect(s.flow.getSnapshot().phase).toBe('review');
  await waitWithReadiness();
  expect(s.flow.getSnapshot().phase).toBe('review');
  expect(s.flow.getSnapshot().inactivityWarning).toBe(true);
  await s.flow.print();
  expect(s.flow.getSnapshot().phase).toBe('printing');
  expect(s.flow.getSnapshot().inactivityWarning).toBe(false);
});

it('does not time out the Guest during countdown or printing', async () => {
  vi.useFakeTimers();
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await vi.advanceTimersByTimeAsync(90_000);
  expect(s.flow.getSnapshot().phase).toBe('countdown');
  expect(s.requests.filter(({ path }) => path.endsWith('/end'))).toHaveLength(0);
  const p = guestSetup();
  await p.printer.connect();
  await p.flow.initialize();
  await p.flow.reportEquipment(observation);
  await p.flow.start();
  p.flow.countdown();
  await p.flow.shutter(async () => ({
    bytes: new Uint8Array([3]),
    url: 'blob:print',
    discard: vi.fn(),
  }));
  await p.flow.print();
  await vi.advanceTimersByTimeAsync(90_000);
  expect(p.flow.getSnapshot().phase).toBe('printing');
  expect(p.requests.filter(({ path }) => path.endsWith('/end'))).toHaveLength(0);
});

it('stops a reviewed Guest immediately on camera loss before an asynchronous readiness read', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  const discard = vi.fn();
  s.flow.countdown();
  await s.flow.shutter(async () => ({ bytes: new Uint8Array([9]), url: 'blob:private', discard }));
  const gate = deferred();
  const read = s.printer.readReadiness.bind(s.printer);
  vi.spyOn(s.printer, 'readReadiness').mockImplementation(async () => {
    await gate.promise;
    return read();
  });
  const reporting = s.flow.reportEquipment({ ...observation, cameraLive: false });
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  expect(discard).toHaveBeenCalledOnce();
  expect(s.requests.some(({ path }) => path.endsWith('/end'))).toBe(true);
  gate.resolve();
  await reporting;
  expect(s.requests.filter(({ path }) => path === '/api/booth/print-attempts')).toHaveLength(0);
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
  await s.flow.start();
  expect(s.requests.filter(({ path }) => path === '/api/booth/sessions')).toHaveLength(2);
  expect(s.flow.getSnapshot().captureId).toBeUndefined();
});

it('stops a reviewed Guest on an adapter connection-change callback', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  const discard = vi.fn();
  s.flow.countdown();
  await s.flow.shutter(async () => ({ bytes: new Uint8Array([9]), url: 'blob:printer', discard }));
  s.printer.emit('connection_changed');
  await vi.waitFor(() => expect(s.flow.getSnapshot().phase).toBe('unavailable'));
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  expect(discard).toHaveBeenCalledOnce();
  expect(s.requests.some(({ path }) => path.endsWith('/end'))).toBe(true);
});

it('stops Guest synchronously on connection loss while an earlier observation is held', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  const discard = vi.fn();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([9]),
    url: 'blob:queued',
    discard,
  }));
  await s.flow.print();
  const gate = deferred();
  s.holdObservation(gate.promise);
  s.printer.emit('command_accepted', s.authorization);
  await vi.waitFor(() =>
    expect(s.requests.filter(({ path }) => path.endsWith('/observations'))).toHaveLength(1)
  );
  s.printer.emit('connection_changed');
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  expect(discard).toHaveBeenCalledOnce();
  gate.resolve();
  await vi.waitFor(() =>
    expect(s.requests.filter(({ path }) => path.endsWith('/observations'))).toHaveLength(2)
  );
  expect(
    s.requests.filter(({ path }) => path.endsWith('/observations')).map(({ body }) => body?.kind)
  ).toEqual(['command_accepted', 'connection_changed']);
});

it('discards a late encoded photo after an immediate offline stop', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  const gate = deferred();
  const discard = vi.fn();
  const shutter = s.flow.shutter(() =>
    gate.promise.then(() => ({ bytes: new Uint8Array([7]), url: 'blob:late', discard }))
  );
  void s.flow.reportEquipment({ ...observation, serverReachable: false });
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  gate.resolve();
  await shutter;
  expect(discard).toHaveBeenCalledOnce();
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  expect(s.requests.filter(({ path }) => path === '/api/booth/print-attempts')).toHaveLength(0);
});

it('keeps an authorized transport buffer until send settles after a fault', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  const discard = vi.fn();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([8]),
    url: 'blob:transport',
    discard,
  }));
  const gate = deferred();
  const send = s.printer.sendOnce.bind(s.printer);
  vi.spyOn(s.printer, 'sendOnce').mockImplementation(async (authorization, bytes) => {
    await send(authorization, bytes);
    await gate.promise;
  });
  const printing = s.flow.print();
  await vi.waitFor(() => expect(s.printer.commandCount).toBe(1));
  void s.flow.reportEquipment({ ...observation, serverReachable: false });
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  expect(discard).not.toHaveBeenCalled();
  await s.flow.refresh();
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  gate.resolve();
  await printing;
  expect(discard).toHaveBeenCalledOnce();
  expect(s.printer.commandCount).toBe(1);
  expect(JSON.stringify(s.requests)).not.toContain('blob:transport');
});

it('keeps Print unavailable until the selected shutter is acknowledged and reserves that ID', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  const gate = deferred();
  s.holdCapture(gate.promise);
  s.flow.countdown();
  const shutter = s.flow.shutter(async () => ({
    bytes: new Uint8Array([7]),
    url: 'blob:selected',
    discard: vi.fn(),
  }));
  expect(s.flow.getSnapshot().phase).toBe('capturing');
  await s.flow.print();
  expect(s.requests.filter((request) => request.path === '/api/booth/print-attempts')).toHaveLength(
    0
  );
  expect(s.journal.readOperations()).toMatchObject([
    { kind: 'capture', capturedAt: expect.any(String), captureId: expect.any(String) },
  ]);
  gate.resolve();
  await shutter;
  const selectedCaptureId = s.flow.getSnapshot().captureId;
  await s.flow.print();
  const reservationBody = s.requests.find(
    (request) => request.path === '/api/booth/print-attempts'
  )?.body;
  expect(reservationBody?.captureId).toBe(selectedCaptureId);
  expect(s.flow.getSnapshot().phase).toBe('printing');
  expect(s.journal.readOperations()).toMatchObject([
    { kind: 'reservation', captureId: selectedCaptureId },
    { kind: 'dispatch_intent', phase: 'authorized' },
  ]);
});

it('sends one selected photo and confirms only an acknowledged full ejection', async () => {
  vi.useFakeTimers();
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  const discard = vi.fn();
  s.flow.countdown();
  await s.flow.shutter(async () => ({ bytes: new Uint8Array([7]), url: 'blob:print', discard }));
  await s.flow.print();
  expect(s.printer.commandCount).toBe(1);
  expect(discard).toHaveBeenCalledOnce();
  await s.flow.print();
  expect(s.printer.commandCount).toBe(1);
  expect(s.flow.getSnapshot().phase).toBe('printing');
  s.printer.emit('command_accepted', s.authorization);
  await vi.waitFor(() =>
    expect(s.requests.some(({ path }) => path.endsWith('/observations'))).toBe(true)
  );
  expect(s.flow.getSnapshot().phase).toBe('printing');
  s.printer.emit('full_ejection_confirmed', s.authorization);
  await vi.waitFor(() => expect(s.flow.getSnapshot().phase).toBe('confirmed'));
  s.printer.emit('ready_for_new_job');
  await s.flow.reportEquipment(observation);
  await vi.advanceTimersByTimeAsync(2_500);
  expect(s.flow.getSnapshot().phase).toBe('confirmed');
  await vi.advanceTimersByTimeAsync(500);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
});

it('acknowledges ready-for-new-job safety before dispatching the next Guest print', async () => {
  vi.useFakeTimers();
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([1]),
    url: 'blob:first',
    discard: vi.fn(),
  }));
  await s.flow.print();
  s.printer.emit('full_ejection_confirmed', s.authorization);
  await vi.waitFor(() => expect(s.flow.getSnapshot().phase).toBe('confirmed'));
  s.printer.emit('ready_for_new_job');
  await vi.waitFor(() =>
    expect(
      s.requests.some(
        ({ path, body }) => path.endsWith('/observations') && body?.kind === 'ready_for_new_job'
      )
    ).toBe(true)
  );
  await s.flow.reportEquipment(observation);
  await vi.advanceTimersByTimeAsync(3_000);
  expect(s.flow.getSnapshot().phase).toBe('welcome');
  await s.flow.start();
  expect(s.flow.getSnapshot().phase).toBe('preview');
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([2]),
    url: 'blob:second',
    discard: vi.fn(),
  }));
  await s.flow.print();
  expect(s.printer.commandCount).toBe(2);
  expect(s.requests.filter(({ path }) => path.endsWith('/dispatch'))).toHaveLength(2);
});

it('reports ready-for-new-job after the confirmation screen has ended', async () => {
  vi.useFakeTimers();
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([1]),
    url: 'blob:first',
    discard: vi.fn(),
  }));
  await s.flow.print();
  s.printer.emit('full_ejection_confirmed', s.authorization);
  await vi.waitFor(() => expect(s.flow.getSnapshot().phase).toBe('confirmed'));
  await vi.advanceTimersByTimeAsync(3_000);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  s.printer.emit('ready_for_new_job');
  await vi.waitFor(() =>
    expect(
      s.requests.some(
        ({ path, body }) => path.endsWith('/observations') && body?.kind === 'ready_for_new_job'
      )
    ).toBe(true)
  );
  await s.flow.reportEquipment(observation);
  await s.flow.refresh();
  expect(s.flow.getSnapshot().phase).toBe('welcome');
});

it('does not confirm a command-accepted observation even if its reply says Printed', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([1]),
    url: 'blob:selected',
    discard: vi.fn(),
  }));
  await s.flow.print();
  s.acceptedReturnsPrinted();
  s.printer.emit('command_accepted', s.authorization);
  await vi.waitFor(() =>
    expect(s.requests.some(({ path }) => path.endsWith('/observations'))).toBe(true)
  );
  expect(s.flow.getSnapshot().phase).toBe('printing');
});

it('dispatches the final reserved unit when available capacity becomes zero', async () => {
  const s = guestSetup({
    originalPackages: 5,
    additionalPackages: 0,
    totalBookedPrints: 50,
    printed: 49,
    unresolved: 0,
    printsRemaining: 1,
    printsAvailable: 1,
  });
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([5]),
    url: 'blob:last',
    discard: vi.fn(),
  }));
  await s.flow.print();
  expect(s.printer.commandCount).toBe(1);
  expect(s.flow.getSnapshot().counts?.printsAvailable).toBe(0);
  expect(s.flow.getSnapshot().phase).toBe('printing');
});

it('does not resend after a lost dispatch response', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([4]),
    url: 'blob:lost',
    discard: vi.fn(),
  }));
  s.loseDispatchResponse();
  await s.flow.print();
  expect(s.printer.commandCount).toBe(0);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  await s.flow.print();
  expect(s.printer.commandCount).toBe(0);
  expect(s.requests.some(({ path }) => path.endsWith('/reconcile'))).toBe(true);
});

it('closes the old session before clearing a reservation with no receipt', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  const discard = vi.fn();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([6]),
    url: 'blob:reserve-lost',
    discard,
  }));
  s.loseReserveResponse();
  await s.flow.print();
  expect(s.printer.commandCount).toBe(0);
  expect(s.requests.some(({ path }) => path === `/api/booth/sessions/${s.sessionId}/end`)).toBe(
    true
  );
  expect(s.journal.readOperations()).toEqual([]);
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  expect(discard).toHaveBeenCalledOnce();
});

it('reconciles the server pending attempt on reload with an empty journal', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([4]),
    url: 'blob:lost',
    discard: vi.fn(),
  }));
  s.loseDispatchResponse();
  await s.flow.print();
  s.flow.dispose();
  sessionStorage.clear();
  const before = s.requests.filter(({ path }) => path.endsWith('/reconcile')).length;
  const reloaded = new BoothFlow({
    transport: s.transport,
    printer: s.printer,
    journal: s.journal,
  });
  owned.push(reloaded);
  await reloaded.initialize();
  expect(s.requests.filter(({ path }) => path.endsWith('/reconcile')).length).toBeGreaterThan(
    before
  );
  expect(reloaded.getSnapshot().phase).toBe('unavailable');
  expect(s.printer.commandCount).toBe(0);
});

it('does not claim completion when the ejection response is lost', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([3]),
    url: 'blob:ejected',
    discard: vi.fn(),
  }));
  await s.flow.print();
  s.loseObservationResponse();
  s.printer.emit('full_ejection_confirmed', s.authorization);
  await vi.waitFor(() => expect(s.flow.getSnapshot().phase).toBe('unavailable'));
  expect(s.journal.readOperations().some((entry) => entry.kind === 'observation')).toBe(true);
  expect(s.printer.commandCount).toBe(1);
  expect(await s.flow.reconcilePending(s.journal.readOperations())).toBe('clear');
  expect(s.journal.readOperations()).toEqual([]);
  expect(s.flow.getSnapshot().phase).not.toBe('confirmed');
});

it('replays an uncommitted ejection observation with its original operation ID', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([1]),
    url: 'blob:pending',
    discard: vi.fn(),
  }));
  await s.flow.print();
  s.loseObservationBeforeCommit();
  s.printer.emit('full_ejection_confirmed', s.authorization);
  await vi.waitFor(() => expect(s.flow.getSnapshot().phase).toBe('unavailable'));
  const first = s.requests.find(({ path }) => path.endsWith('/observations'))?.body;
  expect(first?.kind).toBe('full_ejection_confirmed');
  expect(await s.flow.reconcilePending(s.journal.readOperations())).toBe('clear');
  const observations = s.requests.filter(({ path }) => path.endsWith('/observations'));
  expect(observations).toHaveLength(2);
  expect(observations[1].body).toEqual(first);
  expect(s.journal.readOperations()).toEqual([]);
});

it('does not replay a stale ejection observation against the current pending attempt', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([1]),
    url: 'blob:pending',
    discard: vi.fn(),
  }));
  s.loseDispatchResponse();
  await s.flow.print();
  const state = (await s.transport('/api/booth/state')) as { runId: string };
  const observationId = crypto.randomUUID();
  s.journal.putOperation({
    kind: 'observation',
    operationId: observationId,
    runId: state.runId,
    recordedAt: Date.now(),
    observationId,
    observationKind: 'full_ejection_confirmed',
    attemptId: crypto.randomUUID(),
    dispatchId: crypto.randomUUID(),
    adapterVersion: 'simulator-v2',
    evidenceVersion: 'simulator-v1',
    connectionGeneration: 1,
  });
  expect(await s.flow.reconcilePending(s.journal.readOperations())).toBe('pending');
  expect(s.requests.filter(({ path }) => path.endsWith('/observations'))).toHaveLength(0);
  expect(s.journal.readOperations()).toHaveLength(1);
});

it('reads server pending state despite a malformed local journal', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([1]),
    url: 'blob:pending',
    discard: vi.fn(),
  }));
  s.loseDispatchResponse();
  await s.flow.print();
  s.flow.dispose();
  sessionStorage.setItem('booth-operations-v2', '{');
  const before = s.requests.filter(({ path }) => path.endsWith('/reconcile')).length;
  const reloaded = new BoothFlow({
    transport: s.transport,
    printer: s.printer,
    journal: new BrowserBoothMetadataJournal(sessionStorage),
  });
  owned.push(reloaded);
  await reloaded.initialize();
  expect(s.requests.filter(({ path }) => path.endsWith('/reconcile')).length).toBeGreaterThan(
    before
  );
  expect(reloaded.getSnapshot().phase).toBe('unavailable');
});

it('keeps printing while the printer is busy with its authorized job', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([8]),
    url: 'blob:busy',
    discard: vi.fn(),
  }));
  await s.flow.print();
  s.rejectBusyReadiness();
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot().phase).toBe('printing');
  expect(s.requests.filter(({ path }) => path === '/api/booth/readiness')).toHaveLength(1);
});

it('does not count a pre-shutter cancellation or retain a photo completed after stop', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(() => {
    throw new Error('camera stopped before draw');
  });
  expect(s.flow.getSnapshot().shutterCount).toBe(0);
  expect(s.requests.filter((request) => request.path === '/api/booth/captures')).toHaveLength(0);
  s.flow.countdown();
  const photo = deferred();
  const discard = vi.fn();
  const shutter = s.flow.shutter(() =>
    photo.promise.then(() => ({ bytes: new Uint8Array([9]), url: 'blob:late', discard }))
  );
  expect(s.journal.readOperations()).toMatchObject([{ kind: 'capture' }]);
  s.flow.dispose();
  photo.resolve();
  await shutter;
  expect(discard).toHaveBeenCalledOnce();
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  expect(s.requests.filter((request) => request.path === '/api/booth/captures')).toHaveLength(1);
});

it('closes an active Guest Session and discards its photo when the run pauses', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  const discard = vi.fn();
  s.flow.countdown();
  await s.flow.shutter(async () => ({ bytes: new Uint8Array([1]), url: 'blob:private', discard }));
  s.setOpenSessionState(true);
  s.setState('Paused');
  await s.flow.refresh();
  expect(s.flow.getSnapshot().phase).toBe('paused');
  expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  expect(discard).toHaveBeenCalledOnce();
  expect(
    s.requests.find((request) => request.path === `/api/booth/sessions/${s.sessionId}/end`)?.body
  ).toMatchObject({ reason: 'booth_stopped' });
});

it('coalesces repeated Start taps into one persisted session', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  const gate = deferred();
  s.holdStart(gate.promise);
  const first = s.flow.start();
  const second = s.flow.start();
  expect(s.requests.filter((request) => request.path === '/api/booth/sessions')).toHaveLength(1);
  gate.resolve();
  await Promise.all([first, second]);
  expect(s.flow.getSnapshot().phase).toBe('preview');
});

it('keeps the owning Guest active when the server reports its open session as an admission blocker', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  await s.flow.start();
  s.setOpenSessionState(true);
  await s.flow.refresh();
  expect(s.flow.getSnapshot().phase).toBe('preview');
  expect(s.requests.filter((request) => request.path.endsWith('/end'))).toHaveLength(0);
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([1]),
    url: 'blob:selected',
    discard: vi.fn(),
  }));
  expect(s.flow.getSnapshot().phase).toBe('review');
  const selectedCaptureId = s.flow.getSnapshot().captureId;
  await s.flow.print();
  expect(
    s.requests.find((request) => request.path === '/api/booth/print-attempts')?.body?.captureId
  ).toBe(selectedCaptureId);
});

it('keeps a pending Start alive when its committed open session is polled before the receipt arrives', async () => {
  const s = guestSetup();
  await s.printer.connect();
  await s.flow.initialize();
  await s.flow.reportEquipment(observation);
  const gate = deferred();
  s.holdStart(gate.promise);
  const starting = s.flow.start();
  s.setOpenSessionState(true);
  await s.flow.refresh();
  gate.resolve();
  await starting;
  expect(s.flow.getSnapshot().phase).toBe('preview');
  expect(s.requests.filter((request) => request.path.endsWith('/end'))).toHaveLength(0);
});
