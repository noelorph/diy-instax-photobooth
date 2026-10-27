import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
