import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BoothSetup } from '@/features/admin/operations/booth-setup';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('setup explicit camera gesture requests permission; background refresh never does', async () => {
  const getUserMedia = vi.fn().mockRejectedValue(new Error('denied'));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  render(<BoothSetup eventId={crypto.randomUUID()} revision={1} />);
  expect(getUserMedia).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
    true
  );
  expect(await screen.findByText(/Camera unavailable/)).toBeTruthy();
});
it('an in-flight setup readiness window disables Start until the current report is acknowledged', async () => {
  vi.useFakeTimers();
  let delay = false,
    release!: () => void;
  const track = { readyState: 'live', stop: vi.fn(), onended: null };
  vi.stubGlobal('navigator', {
    onLine: true,
    mediaDevices: {
      getUserMedia: async () => ({
        active: true,
        getTracks: () => [track],
        getVideoTracks: () => [track],
      }),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(800);
  const fetcher = vi.fn(async (_path: string, init?: RequestInit) => {
    if (!init?.body) {
      if (delay)
        await new Promise<void>((r) => {
          release = r;
        });
      return Response.json({
        revision: 1,
        readinessWindowId: crypto.randomUUID(),
        readiness: { ready: true, counts: { printsAvailable: 10 } },
      });
    }
    return Response.json({
      revision: 1,
      replayed: false,
      receipt: {
        operationId: crypto.randomUUID(),
        kind: 'report_setup_readiness',
        committedRevision: 1,
        result: { ready: true, counts: { printsAvailable: 10 } },
      },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<BoothSetup eventId={crypto.randomUUID()} revision={1} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Connect to Instax' }));
  });
  for (const label of [
    'Film is physically loaded',
    'Continuous printer power is connected',
    'Guided Access is ready',
  ])
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: label }));
    });
  expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
    false
  );
  delay = true;
  const beforePoll = fetcher.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(fetcher.mock.calls.length).toBe(beforePoll);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
    true
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start Booth Mode' }));
  expect(fetcher.mock.calls.every(([path]) => !path.endsWith('/start'))).toBe(true);
  await act(async () => {
    release();
  });
  expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
    false
  );
});
it('a delayed setup readiness reply after unmount cannot report or touch a new camera owner', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const fetcher = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return Response.json({
      revision: 1,
      readinessWindowId: crypto.randomUUID(),
      readiness: { ready: false, counts: { printsAvailable: 10 } },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  const surface = render(<BoothSetup eventId={crypto.randomUUID()} revision={1} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(fetcher).toHaveBeenCalledOnce();
  surface.unmount();
  await act(async () => {
    release();
  });
  expect(fetcher).toHaveBeenCalledOnce();
});
