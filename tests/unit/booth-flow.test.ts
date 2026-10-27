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
function setup() {
  let state = 'Active';
  let calls = 0;
  let fail = false;
  const printer = new SimulatedPrinterV2('simulator');
  const transport = async (path: string) => {
    if (fail) throw Object.assign(new Error('denied'), { status: 401 });
    if (path === '/api/booth/readiness') {
      calls++;
      return {
        revision: 3,
        receipt: {
          operationId: crypto.randomUUID(),
          kind: 'report_readiness',
          committedRevision: 3,
          result: {},
        },
        replayed: false,
      };
    }
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
      pendingAttemptId: null,
    };
  };
  const flow = new BoothFlow({
    transport,
    printer,
    journal: new BrowserBoothMetadataJournal(sessionStorage),
  });
  return {
    flow,
    printer,
    reports: () => calls,
    state: (s: string) => {
      state = s;
    },
    deny: () => {
      fail = true;
    },
  };
}
afterEach(() => {
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
  const original = s.flow.getSnapshot();
  s.flow.dispose();
  await s.flow.reportEquipment(observation);
  expect(s.flow.getSnapshot()).toBe(original);
  expect(s.reports()).toBe(0);
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
            operationId: crypto.randomUUID(),
            kind: 'report_readiness',
            committedRevision: 3,
            result: {},
          },
        };
      }
      return {
        state: 'Active',
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
