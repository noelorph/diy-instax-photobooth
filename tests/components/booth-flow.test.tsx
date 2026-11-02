import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BoothClient } from '@/features/booth/booth-client';
import { BoothFlow } from '@/features/booth/flow';
import { SimulatedPrinterV2 } from '@/features/booth/printer/simulator-v2';
import { BrowserBoothMetadataJournal } from '@/features/booth/print-journal';
afterEach(cleanup);
it('arrival uses passive camera intent and Enable Camera uses explicit request', async () => {
  const printer = new SimulatedPrinterV2('simulator');
  const counts = {
    originalPackages: 1,
    additionalPackages: 0,
    totalBookedPrints: 10,
    printed: 0,
    unresolved: 0,
    printsRemaining: 10,
    printsAvailable: 10,
  };
  const flow = new BoothFlow({
    printer,
    journal: new BrowserBoothMetadataJournal(sessionStorage),
    transport: async (path) =>
      path.endsWith('/readiness')
        ? {
            revision: 1,
            replayed: false,
            receipt: {
              operationId: crypto.randomUUID(),
              kind: 'report_readiness',
              committedRevision: 1,
              result: {},
            },
          }
        : {
            state: 'Active',
            printerId: 'simulator',
            connectionGeneration: 0,
            revision: 1,
            runId: crypto.randomUUID(),
            counts,
            blockers: [],
            readinessWindowId: crypto.randomUUID(),
            allowedActions: { startGuest: true, reportReadiness: true },
          },
  });
  const intents: string[] = [];
  const camera = {
    start: async (
      _video: HTMLVideoElement,
      _disconnected: () => void,
      intent: 'request' | 'existing'
    ) => {
      intents.push(intent);
      throw new Error('denied');
    },
    stop: vi.fn(),
    capture: vi.fn(),
  };
  render(<BoothClient flow={flow} camera={camera} />);
  await waitFor(() => expect(intents).toContain('existing'));
  fireEvent.click(await screen.findByRole('button', { name: 'Enable Camera' }));
  await waitFor(() => expect(intents).toEqual(['existing', 'request']));
  expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
});

it('polls every two seconds only while visible and refreshes immediately on focus', async () => {
  vi.useFakeTimers();
  const flow = new BoothFlow({
    printer: new SimulatedPrinterV2('simulator'),
    journal: new BrowserBoothMetadataJournal(sessionStorage),
    transport: async () => ({}),
  });
  vi.spyOn(flow, 'initialize').mockResolvedValue();
  const reports = vi.spyOn(flow, 'reportEquipment').mockResolvedValue();
  const camera = { start: vi.fn(async () => {}), stop: vi.fn(), capture: vi.fn() };
  const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const view = render(<BoothClient flow={flow} camera={camera} />);
  await act(async () => {});
  reports.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1999);
  });
  expect(reports).toHaveBeenCalledTimes(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(reports).toHaveBeenCalledTimes(1);
  visible.mockReturnValue('hidden');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(reports).toHaveBeenCalledTimes(1);
  visible.mockReturnValue('visible');
  fireEvent(window, new Event('focus'));
  expect(reports).toHaveBeenCalledTimes(2);
  fireEvent(document, new Event('visibilitychange'));
  expect(reports).toHaveBeenCalledTimes(3);
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(reports).toHaveBeenCalledTimes(3);
  visible.mockRestore();
  vi.useRealTimers();
});

it('shows a truthful pending status during a deliberate pause without local takeover', async () => {
  const flow = new BoothFlow({
    printer: new SimulatedPrinterV2('simulator'),
    journal: new BrowserBoothMetadataJournal(sessionStorage),
    transport: async () => ({}),
  });
  vi.spyOn(flow, 'initialize').mockResolvedValue();
  vi.spyOn(flow, 'getSnapshot').mockReturnValue({
    phase: 'paused',
    counts: {
      originalPackages: 1,
      additionalPackages: 0,
      totalBookedPrints: 10,
      printed: 0,
      unresolved: 1,
      printsRemaining: 10,
      printsAvailable: 9,
    },
    blockers: ['print_pending'],
    allowedActions: { enableCamera: false, connectPrinter: false },
  });
  vi.spyOn(flow, 'reportEquipment').mockResolvedValue();
  const camera = { start: vi.fn(async () => {}), stop: vi.fn(), capture: vi.fn() };
  render(<BoothClient flow={flow} camera={camera} />);
  expect(screen.getByRole('heading', { name: 'Booth paused' })).toBeTruthy();
  expect(screen.getByText(/A print outcome is pending/)).toBeTruthy();
  expect(screen.getByText('Please wait for the Admin to resume from the phone.')).toBeTruthy();
  expect(document.querySelector('video')?.closest('[hidden]')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
});

it('polls lifecycle independently of a held readiness report and preserves Finished after release', async () => {
  vi.useFakeTimers();
  const printer = new SimulatedPrinterV2('simulator');
  await printer.connect();
  let state = 'Active',
    reads = 0,
    posts = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const flow = new BoothFlow({
    printer,
    journal: new BrowserBoothMetadataJournal(sessionStorage),
    transport: async (path, body) => {
      if (body) {
        posts++;
        await gate;
        return {
          revision: 1,
          replayed: false,
          receipt: {
            operationId: body.operationId,
            kind: 'report_readiness',
            committedRevision: 1,
            result: {},
          },
        };
      }
      reads++;
      return {
        state,
        revision: reads,
        runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        printerId: 'simulator',
        connectionGeneration: 1,
        counts: {
          originalPackages: 1,
          additionalPackages: 0,
          totalBookedPrints: 10,
          printed: 0,
          unresolved: state === 'Finishing' ? 1 : 0,
          printsRemaining: 10,
          printsAvailable: 10,
        },
        blockers: [],
        readinessWindowId: crypto.randomUUID(),
        allowedActions: { startGuest: true, reportReadiness: true },
      };
    },
  });
  const camera = { start: vi.fn(async () => {}), stop: vi.fn(), capture: vi.fn() };
  const view = render(<BoothClient flow={flow} camera={camera} />);
  try {
    await act(async () => {});
    expect(posts).toBe(1);
    const before = reads;
    for (const phase of ['Paused', 'Finishing', 'Finished']) {
      state = phase;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(flow.getSnapshot().phase).toBe(phase.toLowerCase());
    }
    expect(reads).toBeGreaterThanOrEqual(before + 3);
    expect(posts).toBe(1);
    await act(async () => {
      release();
    });
    expect(flow.getSnapshot().phase).toBe('finished');
    expect(posts).toBe(1);
  } finally {
    release();
    view.unmount();
    vi.useRealTimers();
  }
});

it('healthy polling keeps Welcome and does not refocus the heading', async () => {
  const printer = new SimulatedPrinterV2('simulator');
  await printer.connect();
  const flow = new BoothFlow({
    printer,
    journal: new BrowserBoothMetadataJournal(sessionStorage),
    transport: async (path, body) =>
      path.endsWith('/readiness')
        ? {
            revision: 1,
            replayed: false,
            receipt: {
              operationId: body!.operationId,
              kind: 'report_readiness',
              committedRevision: 1,
              result: {},
            },
          }
        : {
            state: 'Active',
            printerId: 'simulator',
            connectionGeneration: 1,
            revision: 1,
            runId: crypto.randomUUID(),
            readinessWindowId: crypto.randomUUID(),
            blockers: [],
            counts: {
              originalPackages: 1,
              additionalPackages: 0,
              totalBookedPrints: 10,
              printed: 0,
              unresolved: 0,
              printsRemaining: 10,
              printsAvailable: 10,
            },
            allowedActions: { startGuest: true, reportReadiness: true },
          },
  });
  const camera = {
    start: async (video: HTMLVideoElement) => {
      Object.defineProperties(video, {
        srcObject: {
          value: { active: true, getVideoTracks: () => [{ readyState: 'live' }] },
          configurable: true,
        },
        videoWidth: { value: 640, configurable: true },
        videoHeight: { value: 480, configurable: true },
      });
    },
    stop: vi.fn(),
    capture: vi.fn(),
  };
  render(
    <>
      <button>Focus marker</button>
      <BoothClient flow={flow} camera={camera} />
    </>
  );
  const heading = await screen.findByRole('heading', { name: 'Make a memory' });
  const focus = vi.spyOn(heading, 'focus');
  screen.getByRole('button', { name: 'Focus marker' }).focus();
  await act(async () => {
    fireEvent(window, new Event('focus'));
    await flow.reportEquipment({
      cameraPermission: true,
      cameraLive: true,
      serverReachable: true,
      printerConnected: true,
      printerReady: true,
      oldJobCleared: true,
    });
  });
  expect(flow.getSnapshot().phase).toBe('welcome');
  expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Focus marker' }));
});
