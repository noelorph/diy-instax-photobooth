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
  expect(screen.queryByRole('link', { name: 'Admin sign in' })).toBeNull();
});
