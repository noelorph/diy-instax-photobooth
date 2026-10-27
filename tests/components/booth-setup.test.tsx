import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BoothSetup } from '@/features/admin/operations/booth-setup';
beforeEach(() => {
  const originalWindow = window;
  vi.stubGlobal(
    'window',
    new Proxy(originalWindow, {
      get: (target, key) => (key === 'location' ? { replace: vi.fn() } : Reflect.get(target, key)),
    })
  );
});
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
    fireEvent.click(screen.getByRole('button', { name: 'Connect to Instax' }));
  });
  expect(fetcher).toHaveBeenCalledOnce();
  surface.unmount();
  await act(async () => {
    release();
  });
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each(['receipt', 'exact replay'])(
  'recovers a committed lost Start through %s before issuing the handoff',
  async (mode) => {
    vi.useFakeTimers();
    let attempts = 0;
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
    const handoffId = crypto.randomUUID();
    let original: Record<string, unknown> | undefined;
    const receipt = (operationId: string, kind: string, result: object) => ({
      operationId,
      kind,
      committedRevision: 2,
      result,
    });
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        paths.push(path);
        if (path.endsWith('/start')) {
          attempts++;
          const body = JSON.parse(String(init?.body));
          if (attempts === 1) {
            original = body;
            throw new TypeError('committed response lost');
          }
          expect(body).toEqual(original);
          return Response.json({
            revision: 2,
            replayed: true,
            receipt: receipt(String(original?.operationId), 'start', { handoffId }),
          });
        }
        if (path.includes('/operations/')) {
          if (mode === 'exact replay') throw new TypeError('receipt unavailable');
          return Response.json({
            revision: 2,
            receipt: receipt(String(original?.operationId), 'start', { handoffId }),
          });
        }
        if (path.includes('/setup-readiness') && !init?.body)
          return Response.json({
            revision: 1,
            readinessWindowId: crypto.randomUUID(),
            readiness: { ready: true, counts: { printsAvailable: 10 } },
          });
        const kind = path.endsWith('/issue')
          ? 'issue_handoff'
          : path.endsWith('/confirm')
            ? 'confirm_handoff'
            : 'report_setup_readiness';
        return Response.json({
          revision: 2,
          replayed: false,
          receipt: receipt(
            crypto.randomUUID(),
            kind,
            kind === 'report_setup_readiness'
              ? { ready: true, counts: { printsAvailable: 10 } }
              : {}
          ),
        });
      })
    );
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
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start Booth Mode' }));
    });
    if (mode === 'exact replay') {
      const before = paths.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(paths).toHaveLength(before);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry Start Booth Mode' }));
      });
    }
    expect(paths.some((path) => path.endsWith(`/operations/${original?.operationId}`))).toBe(true);
    expect(paths.filter((path) => path.endsWith('/start'))).toHaveLength(
      mode === 'receipt' ? 1 : 2
    );
    expect(paths.some((path) => path.endsWith(`/${handoffId}/issue`))).toBe(true);
  }
);

it.each(['receipt', 'exact replay'])(
  'replaces access into the same run using %s without starting or resuming',
  async (mode) => {
    const eventId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const handoffId = crypto.randomUUID();
    let original: Record<string, unknown> | undefined;
    let attempts = 0;
    const paths: string[] = [];
    const receipt = (kind: string, result: object) => ({
      receipt: { operationId: String(original?.operationId), kind, committedRevision: 4, result },
      revision: 4,
      replayed: false,
    });
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      paths.push(path);
      if (path.includes('/setup-readiness'))
        return Response.json({
          revision: 3,
          readinessWindowId: crypto.randomUUID(),
          readiness: { ready: false, counts: { printsAvailable: 9 } },
        });
      if (path.endsWith('/recover-access')) {
        attempts++;
        const body = JSON.parse(String(init?.body));
        if (!original) {
          original = body;
          throw new TypeError('lost');
        }
        expect(body).toEqual(original);
        return Response.json(receipt('recover_access', { handoffId, runId }));
      }
      if (path.includes('/operations/')) {
        if (mode === 'exact replay' && attempts === 1) throw new TypeError('offline');
        return Response.json(receipt('recover_access', { handoffId, runId }));
      }
      return Response.json(
        receipt(path.endsWith('/issue') ? 'issue_handoff' : 'confirm_handoff', {})
      );
    });
    const view = render(
      <BoothSetup
        eventId={eventId}
        revision={3}
        runId={runId}
        runState="Active"
        adminUserId="admin-a"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replace Booth access' }));
    expect(paths).toHaveLength(0);
    expect(screen.getByRole('dialog').textContent).toMatch(/Paused/);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm replacement' }));
    if (mode === 'exact replay') {
      await screen.findByRole('alert');
      view.rerender(
        <BoothSetup
          eventId={eventId}
          revision={9}
          runId={runId}
          runState="Paused"
          adminUserId="admin-a"
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Retry access replacement' }));
    }
    await waitFor(() =>
      expect(paths.some((path) => path.endsWith(`/${handoffId}/issue`))).toBe(true)
    );
    expect(original).toEqual({ operationId: expect.any(String), expectedRevision: 3, runId });
    expect(paths.some((path) => path.endsWith('/start') || path.endsWith('/resume'))).toBe(false);
  }
);

it('does not issue setup windows from a passive phone view before a local equipment gesture', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(
    <BoothSetup
      eventId={crypto.randomUUID()}
      revision={5}
      runId={crypto.randomUUID()}
      runState="Finished"
    />
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(fetcher).not.toHaveBeenCalled();
});

it('disables reviewed replacement if Finish or possible delivery arrives before confirmation', () => {
  const props = {
    eventId: crypto.randomUUID(),
    revision: 3,
    runId: crypto.randomUUID(),
    runState: 'Paused' as const,
  };
  const view = render(<BoothSetup {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Replace Booth access' }));
  view.rerender(<BoothSetup {...props} runState="Finishing" />);
  expect(screen.getByRole('button', { name: 'Confirm replacement' }).hasAttribute('disabled')).toBe(
    true
  );
  view.rerender(<BoothSetup {...props} possibleDelivery />);
  expect(screen.getByRole('button', { name: 'Confirm replacement' }).hasAttribute('disabled')).toBe(
    true
  );
});
