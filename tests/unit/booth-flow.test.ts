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
