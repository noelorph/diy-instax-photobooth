import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BoothClient } from '@/features/booth/booth-client';
import { BoothFlow, type BoothTransport } from '@/features/booth/flow';
import { SimulatedPrinter } from '@/features/booth/printer/simulator';
const available = { guestPrints: 4, filmSheets: 4, printerBusy: false };
function setup(outcome: 'accepted' | 'ejected' = 'ejected') {
  let network = true;
  const transport: BoothTransport = async (path, body) => {
    if (!network) throw new TypeError('Offline');
    if (path.endsWith('bootstrap'))
      return {
        runId: 'run',
        state: 'Active',
        display: { title: 'Evening celebration' },
        availability: available,
      };
    if (path.endsWith('/pauses')) return { runId: 'run', state: 'Paused' };
    if (path.endsWith('guest-sessions'))
      return { sessionId: 'session', state: 'Open', availability: available };
    if (path.endsWith('captures')) return { captureId: crypto.randomUUID() };
    if (path.endsWith('print-attempts'))
      return { attemptId: crypto.randomUUID(), state: 'Reserved' };
    if (path.endsWith('observations'))
      return {
        state:
          body?.observationKind === 'commandAccepted'
            ? 'Accepted'
            : body?.observationKind === 'uncertain'
              ? 'Uncertain'
              : 'Confirmed',
        availability: available,
      };
    return { state: 'Abandoned' };
  };
  const printer = new SimulatedPrinter(outcome);
  const flow = new BoothFlow({ transport, printer, storage: sessionStorage });
  const camera = {
    start: async () => {},
    stop: () => {},
    capture: async () => ({ bytes: new Uint8Array([1]), url: 'blob:ephemeral', discard: () => {} }),
  };
  render(<BoothClient flow={flow} camera={camera} />);
  return {
    flow,
    printer,
    network: (value: boolean) => {
      network = value;
    },
  };
}
const flush = async () => {
  await act(async () => {});
};
async function start() {
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await flush();
}
async function capture() {
  fireEvent.click(screen.getByRole('button', { name: 'Take Photo' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
}
beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('runs countdown, Retake, explicit Print and completion through real controller', async () => {
  const s = setup();
  await start();
  await capture();
  expect(screen.getByRole('img', { name: 'Your final photo' }).getAttribute('src')).toBe(
    'blob:ephemeral'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retake' }));
  await flush();
  await capture();
  fireEvent.click(screen.getByRole('button', { name: 'Print' }));
  await flush();
  expect(screen.getByText('Your print is ready')).toBeTruthy();
  expect(s.printer.commandCount).toBe(1);
  expect(screen.queryByRole('img')).toBeNull();
});
it('warns near 90 seconds, Continue resets it, and timeout abandons review', async () => {
  setup();
  await start();
  await capture();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(75000);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(74000);
  });
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(16000);
  });
  expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});
it('does not show inactivity warning during printing or connection hold', async () => {
  const s = setup('accepted');
  await start();
  await capture();
  s.network(false);
  act(() => s.flow.offline());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(95000);
  });
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(screen.getByText(/Your photo is still here/)).toBeTruthy();
  await act(async () => {
    s.network(true);
    await s.flow.online();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Print' }));
  await flush();
  expect(screen.getByText('Waiting for film to eject')).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(90000);
  });
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
});
it('shows only neutral protected sign-in after remote stop', async () => {
  const s = setup();
  await start();
  await act(async () => {
    await s.flow.connectionChanged();
  });
  expect(screen.queryByText('Evening celebration')).toBeNull();
  expect(screen.getByRole('link', { name: 'Admin sign in' }).getAttribute('href')).toBe(
    '/sign-in?from=booth'
  );
});
it('offers protected pause by long press and keyboard activation', async () => {
  const s = setup();
  await start();
  const button = screen.getByRole('button', { name: 'Admin pause' });
  fireEvent.pointerDown(button);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  fireEvent.pointerUp(button);
  expect(s.flow.getSnapshot().phase).toBe('preview');
  fireEvent.keyDown(button, { key: 'Enter' });
  await flush();
  expect(s.flow.getSnapshot().phase).toBe('paused');
});
it('a completed long press requests protected pause', async () => {
  const s = setup();
  await start();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Admin pause' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(s.flow.getSnapshot().phase).toBe('paused');
});
