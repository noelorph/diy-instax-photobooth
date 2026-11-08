import { renderToString } from 'react-dom/server';
import { BoothClient } from '@/features/booth/booth-client';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BoothSetup } from '@/features/admin/operations/booth-setup';
import { getBoothPrinter } from '@/features/booth/equipment';
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
beforeEach(() => {
  router.replace.mockClear();
  const originalWindow = window;
  const location = { replace: vi.fn() };
  vi.stubGlobal(
    'window',
    new Proxy(originalWindow, {
      get: (target, key) => (key === 'location' ? location : Reflect.get(target, key)),
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
  render(<BoothSetup printerMode="simulated" eventId={crypto.randomUUID()} revision={1} />);
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Setup camera preview').hasAttribute('hidden')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
    true
  );
  expect(await screen.findByText(/Camera unavailable/)).toBeTruthy();
});

it.each([
  ['GET', 403, 'qualification_required'],
  ['POST', 403, 'qualification_required'],
  ['GET', 401, 'access_required'],
  ['GET', 403, 'operation_forbidden'],
  ['POST', 403, 'operation_forbidden'],
] as const)(
  'stops automatic setup retries after %s %s %s and permits an explicit recheck',
  async (method, status, code) => {
    vi.useFakeTimers();
    const track = { readyState: 'live', stop: vi.fn(), onended: null };
    const getUserMedia = vi.fn(async () => ({
      active: true,
      getTracks: () => [track],
      getVideoTracks: () => [track],
    }));
    vi.stubGlobal('navigator', { onLine: true, mediaDevices: { getUserMedia } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(600);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(800);
    let denied = true;
    const calls: string[] = [];
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) => {
      const verb = init?.method ?? 'GET';
      calls.push(verb);
      if (denied && verb === method) return Response.json({ code }, { status });
      const readiness = {
        ready: false,
        blockers: ['printer_connection'],
        counts: { printsAvailable: 10 },
      };
      return Response.json(
        verb === 'GET'
          ? { revision: 1, readinessWindowId: crypto.randomUUID(), readiness }
          : {
              revision: 1,
              replayed: false,
              receipt: {
                operationId: crypto.randomUUID(),
                kind: 'report_setup_readiness',
                committedRevision: 1,
                result: readiness,
              },
            }
      );
    });
    vi.stubGlobal('fetch', fetcher);
    render(<BoothSetup printerMode="simulated" eventId={crypto.randomUUID()} revision={1} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));
    });
    expect(getUserMedia).toHaveBeenCalledOnce();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(
      code === 'qualification_required' ? /development simulator/ : /Sign in.*Admin/
    );
    expect(alert.textContent).not.toMatch(/Check the internet/);
    if (code !== 'qualification_required')
      expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in');
    const deniedCalls = [...calls];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
      fireEvent(document, new Event('visibilitychange'));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Film is physically loaded' }));
    });
    expect(calls).toEqual(deniedCalls);
    expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
      true
    );
    denied = false;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry setup checks' }));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('10 prints available')).toBeTruthy();
    const afterRetry = calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(calls.length).toBeGreaterThan(afterRetry);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
      true
    );
  }
);

it.each([
  'fresh',
  'printer lost during window request',
  'expiry',
  'stale final sample',
  'camera lost during report',
  'camera lost while Start waits',
] as const)('coordinates Start and fresh setup evidence: %s', async (mode) => {
  vi.useFakeTimers();
  let delay = false,
    release!: () => void;
  const cameraRace = mode.startsWith('camera lost');
  const track = { readyState: 'live', stop: vi.fn(), onended: null as (() => void) | null };
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
  const latestWindow = crypto.randomUUID();
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/start'))
      return Response.json({
        revision: 2,
        replayed: false,
        receipt: {
          operationId: crypto.randomUUID(),
          kind: 'start',
          committedRevision: 2,
          result: { handoffId: crypto.randomUUID() },
        },
      });
    if (!init?.body) {
      if (delay && !cameraRace)
        await new Promise<void>((r) => {
          release = r;
        });
      return Response.json({
        revision: 1,
        readinessWindowId: delay ? latestWindow : crypto.randomUUID(),
        readiness: { ready: true, counts: { printsAvailable: 10 } },
      });
    }
    const observation = JSON.parse(String(init.body)).observation;
    if (delay && cameraRace && observation?.cameraLive)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return Response.json({
      revision: 1,
      replayed: false,
      receipt: {
        operationId: crypto.randomUUID(),
        kind: 'report_setup_readiness',
        committedRevision: 1,
        result: { ready: observation?.cameraLive ?? true, counts: { printsAvailable: 10 } },
      },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  render(
    <BoothSetup
      printerMode="simulated"
      eventId={crypto.randomUUID()}
      revision={1}
      adminUserId="admin-a"
    />
  );
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
  expect(screen.getByLabelText('Setup camera preview').hasAttribute('hidden')).toBe(false);
  expect(
    fetcher.mock.calls.every(
      ([, init]) => new Headers(init?.headers).get('x-package-admin-id') === 'admin-a'
    )
  ).toBe(true);
  expect(screen.getByLabelText('Measured equipment readiness').textContent).toBe(
    'InternetReadyLive cameraReadyInstax connectionReadyPrinter readyReady'
  );
  expect(screen.getByText('10 prints available')).toBeTruthy();
  expect(screen.getByText('Always test the printer before starting Booth Mode.')).toBeTruthy();
  if (mode === 'stale final sample') {
    const printer = getBoothPrinter('simulated');
    const sample = await printer.readReadiness();
    vi.spyOn(printer, 'readReadiness').mockResolvedValue({ ...sample, observedAgeMs: 5001 });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start Booth Mode' }));
    });
    expect(fetcher.mock.calls.every(([path]) => !path.endsWith('/start'))).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/Recheck setup/);
    return;
  }
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
    false
  );
  if (cameraRace) {
    if (mode === 'camera lost while Start waits')
      fireEvent.click(screen.getByRole('button', { name: 'Start Booth Mode' }));
    await act(async () => {
      track.readyState = 'ended';
      track.onended!();
      release();
    });
    expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
      true
    );
    expect(screen.getByLabelText('Measured equipment readiness').textContent).toContain(
      'Live cameraUnavailable'
    );
    const reports = fetcher.mock.calls.filter(
      ([path, init]) => path.includes('/setup-readiness') && init?.body
    );
    expect(JSON.parse(String(reports.at(-1)?.[1]?.body)).observation.cameraLive).toBe(false);
    expect(fetcher.mock.calls.every(([path]) => !path.endsWith('/start'))).toBe(true);
    return;
  }
  if (mode === 'printer lost during window request') {
    getBoothPrinter('simulated').emit('connection_changed');
    await act(async () => {
      release();
    });
    expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
      true
    );
    const reports = fetcher.mock.calls.filter(
      ([path, init]) => path.includes('/setup-readiness') && init?.body
    );
    expect(JSON.parse(String(reports.at(-1)?.[1]?.body)).observation.printerConnected).toBe(false);
    return;
  }
  if (mode === 'expiry') {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3001);
    });
    expect(screen.getByLabelText('Measured equipment readiness').textContent).toBe(
      'InternetNot checkedLive cameraNot checkedInstax connectionNot checkedPrinter readyNot checked'
    );
    expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
      true
    );
    await act(async () => {
      release();
    });
    expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
      false
    );
    return;
  }
  fireEvent.click(screen.getByRole('button', { name: 'Start Booth Mode' }));
  expect(fetcher.mock.calls.every(([path]) => !path.endsWith('/start'))).toBe(true);
  await act(async () => {
    release();
  });
  const starts = fetcher.mock.calls.filter(([path]) => path.endsWith('/start'));
  expect(starts).toHaveLength(1);
  expect(JSON.parse(String(starts[0][1]?.body))).toMatchObject({
    readinessWindowId: latestWindow,
  });
  expect(router.replace).toHaveBeenCalledWith(
    expect.stringMatching(/^\/booth\?entry=[0-9a-f-]{36}$/)
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
  const surface = render(
    <BoothSetup printerMode="simulated" eventId={crypto.randomUUID()} revision={1} />
  );
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
it.each(['receipt', 'exact replay', 'issue loss', 'confirmation loss'])(
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
        if (mode === 'issue loss' && path.endsWith('/issue')) throw new TypeError('issue lost');
        if (
          mode === 'confirmation loss' &&
          (path.endsWith('/confirm') || path === '/api/booth/state')
        )
          throw new TypeError('confirmation lost');
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
    const props = {
      eventId: crypto.randomUUID(),
      revision: 1,
      runId: crypto.randomUUID(),
      runState: 'Finished' as const,
    };
    const surface = render(
      <>
        <p>Private booking contact</p>
        <BoothSetup printerMode="simulated" {...props} />
      </>
    );
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
      surface.rerender(
        <>
          <p>Private booking contact</p>
          <BoothSetup
            printerMode="simulated"
            {...props}
            revision={2}
            runId={crypto.randomUUID()}
            runState="Prepared"
          />
        </>
      );
      const before = paths.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(paths).toHaveLength(before);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry Start Booth Mode' }));
      });
    }
    if (mode === 'issue loss' || mode === 'confirmation loss') {
      expect(screen.getByRole('dialog', { name: 'Booth access needs recovery' })).toBeTruthy();
      expect(
        screen.getByText('Private booking contact').closest('[aria-hidden="true"]')
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Retry|Start|Resume/ })).toBeNull();
      expect(paths.filter((path) => path.endsWith('/issue'))).toHaveLength(1);
      expect(router.replace).not.toHaveBeenCalled();
    } else {
      expect(router.replace).toHaveBeenCalledWith(
        expect.stringMatching(/^\/booth\?entry=[0-9a-f-]{36}$/)
      );
      expect(screen.getByRole('dialog', { name: 'Preparing Booth Mode' })).toBeTruthy();
      expect(
        screen.getByText('Private booking contact').closest('[aria-hidden="true"]')
      ).toBeTruthy();
    }
    expect(paths.some((path) => path.endsWith(`/operations/${original?.operationId}`))).toBe(true);
    expect(paths.filter((path) => path.endsWith('/start'))).toHaveLength(
      mode === 'exact replay' ? 2 : 1
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
        printerMode="simulated"
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
          printerMode="simulated"
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
      printerMode="simulated"
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
  const view = render(<BoothSetup printerMode="simulated" {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Replace Booth access' }));
  view.rerender(<BoothSetup printerMode="simulated" {...props} runState="Finishing" />);
  expect(screen.getByRole('button', { name: 'Confirm replacement' }).hasAttribute('disabled')).toBe(
    true
  );
  view.rerender(<BoothSetup printerMode="simulated" {...props} possibleDelivery />);
  expect(screen.getByRole('button', { name: 'Confirm replacement' }).hasAttribute('disabled')).toBe(
    true
  );
});

it.each(['cancel while waiting', 'cancel after Start', 'readiness expires'] as const)(
  'does not continue a handoff when %s',
  async (mode) => {
    vi.useFakeTimers();
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
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const paths: string[] = [];
    const navigate = vi.fn(),
      releaseHandoff = vi.fn();
    const originalWindow = window;
    vi.stubGlobal(
      'window',
      new Proxy(originalWindow, {
        get: (target, key) =>
          key === 'location' ? { replace: navigate } : Reflect.get(target, key),
      })
    );
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      paths.push(path);
      if (!init?.body)
        return Response.json({
          revision: 1,
          readinessWindowId: crypto.randomUUID(),
          readiness: { ready: true, counts: { printsAvailable: 10 } },
        });
      if (path.endsWith('/start') && mode === 'cancel after Start') await gate;
      const kind = path.endsWith('/start')
        ? 'start'
        : path.endsWith('/issue')
          ? 'issue_handoff'
          : path.endsWith('/confirm')
            ? 'confirm_handoff'
            : 'report_setup_readiness';
      return Response.json({
        revision: 2,
        replayed: false,
        receipt: {
          operationId: crypto.randomUUID(),
          kind,
          committedRevision: 2,
          result:
            kind === 'start'
              ? { handoffId: crypto.randomUUID() }
              : { ready: true, counts: { printsAvailable: 10 } },
        },
      });
    });
    const view = render(
      <BoothSetup
        printerMode="simulated"
        eventId={crypto.randomUUID()}
        revision={1}
        prepareHandoff={() => (mode === 'cancel after Start' ? Promise.resolve() : gate)}
        releaseHandoff={releaseHandoff}
      />
    );
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
    if (mode !== 'cancel after Start') {
      expect(screen.getByRole('dialog', { name: 'Preparing Booth Mode' })).toBeTruthy();
      const dialog = screen.getByRole('dialog');
      expect(dialog.textContent).toMatch(/Your phone stays signed in/);
      expect(dialog.contains(document.activeElement)).toBe(true);
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBe(dialog);
      expect(track.stop).not.toHaveBeenCalled();
    }
    if (mode === 'readiness expires')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5001);
      });
    else view.unmount();
    await act(async () => {
      release();
    });
    expect(paths.filter((path) => path.endsWith('/start'))).toHaveLength(
      mode === 'cancel after Start' ? 1 : 0
    );
    expect(paths.some((path) => path.endsWith('/issue'))).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(releaseHandoff).toHaveBeenCalledOnce();
    if (mode === 'readiness expires')
      expect(screen.getByRole('alert').textContent).toMatch(/Recheck setup/);
  }
);

it.each(['network', 503, 409] as const)(
  'keeps %s checks actionable and shows authoritative capacity blockers after recovery',
  async (failure) => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { onLine: true });
    let unavailable = true;
    vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) => {
      if (unavailable) {
        if (failure === 'network') throw new TypeError('offline');
        return Response.json(
          { code: failure === 409 ? 'not_ready' : 'operation_unavailable' },
          { status: failure }
        );
      }
      const readiness = {
        ready: false,
        blockers: ['camera', 'booked_prints_exhausted'],
        counts: { printsAvailable: 0 },
      };
      return Response.json(
        init?.body
          ? {
              revision: 1,
              replayed: false,
              receipt: {
                operationId: crypto.randomUUID(),
                kind: 'report_setup_readiness',
                committedRevision: 1,
                result: readiness,
              },
            }
          : { revision: 1, readinessWindowId: crypto.randomUUID(), readiness }
      );
    });
    render(<BoothSetup printerMode="simulated" eventId={crypto.randomUUID()} revision={1} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect to Instax' }));
    });
    expect(screen.getByRole('alert').textContent).toMatch(
      /Check the internet and reconnect equipment/
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('alert').textContent).toMatch(/Readiness could not be verified/);
    unavailable = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('0 prints available')).toBeTruthy();
    expect(screen.getByLabelText('Readiness actions').textContent).toMatch(
      /Enable Camera.*Review the Event Film Packages/
    );
    expect(screen.getByLabelText('Measured equipment readiness').textContent).toBe(
      'InternetReadyLive cameraUnavailableInstax connectionReadyPrinter readyReady'
    );
    expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
      true
    );
  }
);

it('disabled setup offers no equipment gesture or printer owner', () => {
  render(<BoothSetup printerMode="disabled" eventId={crypto.randomUUID()} revision={1} />);
  expect(screen.getByText('Printer qualification is required before Booth setup.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Connect to Instax' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start Booth Mode' })).toBeNull();
});

it('retains the physical setup owner after unmount and never simulates a failed connection', async () => {
  const { releaseBoothPrinter } = await import('@/features/booth/equipment');
  await releaseBoothPrinter();
  const requestDevice = vi.fn().mockRejectedValue(Error('denied'));
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  try {
    const view = render(
      <BoothSetup printerMode="instax-development" eventId={crypto.randomUUID()} revision={1} />
    );
    const owner = getBoothPrinter('instax-development');
    const disconnect = vi.spyOn(owner, 'disconnect');
    fireEvent.click(screen.getByRole('button', { name: 'Connect to Instax' }));
    expect(await screen.findByText('Printer unavailable. Try connecting again.')).toBeTruthy();
    view.unmount();
    expect(disconnect).not.toHaveBeenCalled();
    expect(getBoothPrinter('instax-development')).toBe(owner);
    expect(() => getBoothPrinter('simulated')).toThrow();
    expect(requestDevice).toHaveBeenCalledOnce();
  } finally {
    await releaseBoothPrinter();
  }
});

it.each(['simulated', 'instax-development'] as const)(
  'server renders Admin current %s then the other pinned Booth without retaining an owner',
  (current) => {
    const requestDevice = vi.fn();
    const fetcher = vi.fn();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
    vi.stubGlobal('fetch', fetcher);
    expect(() =>
      renderToString(
        <BoothSetup printerMode={current} eventId={crypto.randomUUID()} revision={1} />
      )
    ).not.toThrow();
    expect(() =>
      renderToString(
        <BoothClient
          printerMode={current === 'simulated' ? 'instax-development' : 'simulated'}
          reconciliationOnly
        />
      )
    ).not.toThrow();
    expect(requestDevice).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  }
);
