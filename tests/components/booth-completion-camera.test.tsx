import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BoothClient } from '@/features/booth/booth-client';
import { BoothFlow } from '@/features/booth/flow';
import { SimulatedPrinterV2 } from '@/features/booth/printer/simulator-v2';
import { BrowserBoothMetadataJournal } from '@/features/booth/print-journal';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  });
}
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
});

async function completedGuest(lastPrint = false) {
  vi.useFakeTimers();
  const printer = new SimulatedPrinterV2('simulator');
  await printer.connect();
  const runId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const attemptId = crypto.randomUUID();
  const authorization = {
    attemptId,
    dispatchId: crypto.randomUUID(),
    printerId: 'simulator',
    connectionGeneration: 1,
  };
  const end = deferred();
  const readiness = deferred();
  const unknown = deferred();
  let holdReadiness = false;
  let state = 'Active';
  let printed = 0;
  let pending = false;
  let safe = true;
  let open = false;
  let revision = 1;
  const requests: { path: string; body?: Record<string, unknown> }[] = [];
  const flow = new BoothFlow({
    printer,
    journal: new BrowserBoothMetadataJournal(sessionStorage),
    transport: async (path, body) => {
      requests.push({ path, body });
      if (path === '/api/booth/state')
        return {
          revision,
          runId,
          state,
          counts: {
            originalPackages: 1,
            additionalPackages: 0,
            totalBookedPrints: 10,
            printed,
            unresolved: pending ? 1 : 0,
            printsRemaining: (lastPrint ? 1 : 10) - printed,
            printsAvailable: (lastPrint ? 1 : 10) - printed - Number(pending),
          },
          blockers: [
            ...(open ? ['guest_session_open'] : []),
            ...(pending ? ['print_pending'] : []),
            ...(!safe ? ['printer_not_safe'] : []),
            ...(lastPrint && printed ? ['booked_prints_exhausted'] : []),
          ],
          allowedActions: { startGuest: !open && !pending && safe, reportReadiness: true },
          readinessWindowId: crypto.randomUUID(),
          printerId: 'simulator',
          connectionGeneration: 1,
          pendingAttemptId: pending ? attemptId : null,
        };
      const kind = path.endsWith('/readiness')
        ? 'report_readiness'
        : path.endsWith('/sessions')
          ? 'start_session'
          : path.endsWith('/captures')
            ? 'record_capture'
            : path.endsWith('/print-attempts')
              ? 'reserve'
              : path.endsWith('/dispatch')
                ? 'dispatch'
                : path.endsWith('/observations')
                  ? 'observe'
                  : 'end_session';
      if (kind === 'observe' && body!.kind === 'outcome_unknown') await unknown.promise;
      if (kind === 'end_session') {
        await end.promise;
        open = false;
      }
      if (kind === 'report_readiness' && holdReadiness) await readiness.promise;
      if (kind === 'start_session') open = true;
      if (kind === 'reserve') pending = true;
      if (kind === 'dispatch') safe = false;
      if (kind === 'observe' && body!.kind === 'full_ejection_confirmed') {
        printed = 1;
        pending = false;
      }
      if (kind === 'observe' && body!.kind === 'ready_for_new_job') safe = true;
      revision++;
      return {
        revision,
        replayed: false,
        receipt: {
          operationId: body!.operationId,
          kind,
          committedRevision: revision,
          result:
            kind === 'start_session'
              ? { sessionId }
              : kind === 'reserve'
                ? { attemptId, state: 'Reserved' }
                : kind === 'dispatch' || kind === 'observe'
                  ? { attemptId, state: printed ? 'Printed' : 'Dispatching' }
                  : {},
        },
        ...(kind === 'dispatch' ? { sendAllowed: true, authorization } : {}),
      };
    },
  });
  let video: HTMLVideoElement;
  const camera = {
    start: async (element: HTMLVideoElement) => {
      video = element;
      Object.defineProperties(video, {
        srcObject: {
          value: { active: true, getVideoTracks: () => [{ readyState: 'live' }] },
          configurable: true,
        },
        videoWidth: { value: 600, configurable: true },
        videoHeight: { value: 800, configurable: true },
      });
    },
    stop: vi.fn(() => {
      if (video) Object.defineProperty(video, 'srcObject', { value: null, configurable: true });
    }),
    capture: vi.fn(async () => ({
      bytes: new Uint8Array([1]),
      url: 'blob:selected',
      discard: vi.fn(),
    })),
  };
  render(<BoothClient printerMode="simulated" flow={flow} camera={camera} />);
  await flush();
  expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  await act(async () => {
    await flow.start();
    flow.countdown();
    await flow.shutter(camera.capture);
    await flow.print();
  });
  printer.emit('full_ejection_confirmed', authorization);
  await flush();
  expect(screen.getByRole('heading', { name: 'Print complete' })).toBeTruthy();
  holdReadiness = true;
  return {
    flow,
    printer,
    camera,
    authorization,
    end,
    readiness,
    unknown,
    requests,
    setState: (value: string) => {
      state = value;
    },
    printed: () => printed,
  };
}

it('retains the live camera through session-end and next-job readiness waits after one print', async () => {
  const s = await completedGuest();
  await act(() => vi.advanceTimersByTimeAsync(2999));
  expect(screen.getByRole('heading', { name: 'Print complete' })).toBeTruthy();
  expect(s.requests.filter(({ path }) => path.endsWith('/end'))).toHaveLength(0);
  await act(() => vi.advanceTimersByTimeAsync(1));
  await act(() => s.flow.start());
  expect(s.requests.filter(({ path }) => path.endsWith('/sessions'))).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  s.end.resolve();
  await flush();
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  expect(s.camera.stop).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(s.camera.stop).not.toHaveBeenCalled();
  s.printer.emit('ready_for_new_job', s.authorization);
  await flush();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  s.readiness.resolve();
  await flush();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Enable Camera' })).toBeNull();
  expect(s.camera.stop).not.toHaveBeenCalled();
  expect(s.printer.commandCount).toBe(1);
  expect(s.printed()).toBe(1);
  expect(
    s.requests.filter(
      ({ path, body }) => path.endsWith('/observations') && body?.kind === 'full_ejection_confirmed'
    )
  ).toHaveLength(1);
  expect(s.requests.filter(({ path }) => path.endsWith('/end'))).toHaveLength(1);
});

it.each(['Paused', 'offline', 'camera', 'printer', 'loadFault'] as const)(
  'stops the camera for %s during post-completion admission wait',
  async (fault) => {
    const s = await completedGuest();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    s.end.resolve();
    await flush();
    if (fault === 'Paused') {
      s.setState('Paused');
      await act(() => s.flow.refresh());
    } else if (fault === 'loadFault') {
      const read = s.printer.readReadiness.bind(s.printer);
      vi.spyOn(s.printer, 'readReadiness').mockImplementation(async () => ({
        ...(await read()),
        loadFault: 'cover_open',
        loadFaultId: crypto.randomUUID(),
      }));
      await act(() => s.flow.refresh());
    } else if (fault === 'printer') {
      s.printer.emit('connection_changed');
      await flush();
    } else {
      void s.flow.reportEnvironment({
        cameraPermission: fault !== 'camera',
        cameraLive: fault !== 'camera',
        serverReachable: fault !== 'offline',
      });
      await flush();
    }
    expect(s.camera.stop).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    s.readiness.resolve();
    await flush();
  }
);

it('stops the camera when the completed print exhausts booked capacity', async () => {
  const s = await completedGuest(true);
  await act(() => vi.advanceTimersByTimeAsync(3000));
  s.end.resolve();
  await flush();
  expect(s.camera.stop).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  s.readiness.resolve();
  await flush();
});

it.each(['Paused', 'offline', 'camera', 'printer'] as const)(
  'stops the camera for %s while session-end acknowledgement is held',
  async (fault) => {
    const s = await completedGuest();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    if (fault === 'Paused') {
      s.setState('Paused');
      await act(() => s.flow.refresh());
    } else if (fault === 'printer') {
      s.printer.emit('connection_changed');
      await flush();
    } else {
      void s.flow.reportEnvironment({
        cameraPermission: fault !== 'camera',
        cameraLive: fault !== 'camera',
        serverReachable: fault !== 'offline',
      });
      await flush();
    }
    expect(s.camera.stop).toHaveBeenCalled();
    s.end.resolve();
    s.readiness.resolve();
    await flush();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  }
);

it.each(['matching', 'attemptId', 'dispatchId', 'printerId', 'connectionGeneration'] as const)(
  'revokes completion camera retention only for a fully correlated generic fault: %s',
  async (binding) => {
    const s = await completedGuest();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    s.end.resolve();
    await flush();
    expect(s.flow.getSnapshot().phase).toBe('unavailable');
    expect(s.camera.stop).not.toHaveBeenCalled();
    const authorization = { ...s.authorization };
    if (binding === 'connectionGeneration') authorization.connectionGeneration = 2;
    else if (binding !== 'matching') authorization[binding] = crypto.randomUUID();
    s.printer.emit('outcome_unknown', authorization);
    await flush();
    expect((await s.printer.readReadiness()).connected).toBe(true);
    if (binding === 'matching') expect(s.camera.stop).toHaveBeenCalled();
    else expect(s.camera.stop).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(s.printer.commandCount).toBe(1);
    expect(s.printed()).toBe(1);
    s.unknown.resolve();
    s.readiness.resolve();
    await flush();
  }
);
