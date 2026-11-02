import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OperationsPanel } from '@/features/admin/operations/panel';
import { packageCounts } from '@/lib/operations/package-contract';
import type { OperationalEvent } from '@/features/admin/operations/types';
const refresh = vi.fn();
const router = { refresh };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const event: OperationalEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Celebration',
  state: 'Live',
  revision: 3,
  counts: packageCounts(5, 0, 49, 1),
  captures: 51,
  runId: 'run',
  runState: 'Paused',
  resumeAllowed: false,
  possibleDelivery: true,
  blockers: ['print_pending'],
  equipment: null,
  attempts: [{ id: 'pending', kind: 'Guest', state: 'Pending' }],
  attemptsPage: 0,
  hasOlderAttempts: false,
};
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('recovers a stalled Pause by its original receipt after the request deadline', async () => {
  vi.useFakeTimers();
  let command!: { operationId: string };
  let posts = 0;
  vi.stubGlobal('fetch', (path: string, options?: RequestInit) => {
    if (path.endsWith('/booth/state'))
      return Promise.resolve(
        Response.json({
          revision: event.revision,
          allowedActions: { resume: false },
          blockers: event.blockers,
          equipment: null,
        })
      );
    if (path.includes('/operations/'))
      return Promise.resolve(
        Response.json({ receipt: { operationId: command.operationId, kind: 'pause' } })
      );
    posts++;
    command = JSON.parse(String(options?.body));
    return new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  });
  render(<OperationsPanel adminUserId="admin-a" event={{ ...event, runState: 'Active' }} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(32);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Pause Booth' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  const retry = screen.getByRole('button', { name: 'Retry Booth command' });
  expect(retry.hasAttribute('disabled')).toBe(false);
  expect(screen.getByRole('alert').textContent).toContain('outcome is unconfirmed');
  await act(async () => {
    fireEvent.click(retry);
  });
  expect(screen.getByText('Booth command recorded. Refreshing current state.')).toBeTruthy();
  expect(posts).toBe(1);
  expect(sessionStorage.getItem(`booth-command:${event.id}:admin-a`)).toBeNull();
});
it('shows durable Paused status and expires independently reported equipment readiness', async () => {
  vi.useFakeTimers();
  render(
    <OperationsPanel
      adminUserId="admin-a"
      event={{
        ...event,
        equipment: {
          expiresAt: new Date(Date.now() + 1000).toISOString(),
          cameraLive: true,
          printerConnected: false,
          serverReachable: true,
          filmLoaded: true,
        },
      }}
    />
  );
  const status = screen.getByRole('region', { name: 'Booth status' });
  expect(within(status).getByText('Booth paused')).toBeTruthy();
  expect(within(status).getByText('Only you can resume the booth from the phone.')).toBeTruthy();
  const equipment = screen.getByLabelText('Equipment status');
  expect(equipment.textContent).toContain('CameraReady');
  expect(equipment.textContent).toContain('InstaxDisconnected');
  expect(equipment.textContent).toContain('InternetOnline');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1001);
  });
  expect(equipment.textContent).toContain('CameraNeeds check');
  expect(equipment.textContent).toContain('InternetNeeds check');
  expect(within(status).getByText('Booth paused')).toBeTruthy();
});
it('disables Resume when readiness expires and restores it only after a fresh scoped poll', async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const equipment = {
    expiresAt: new Date(Date.now() + 5000).toISOString(),
    cameraLive: true,
    printerConnected: true,
    serverReachable: true,
    filmLoaded: true,
  };
  const fetcher = vi.fn<(path: string, options?: RequestInit) => Promise<Response>>(async () =>
    Response.json({
      revision: event.revision,
      allowedActions: { resume: true },
      blockers: [],
      equipment: { ...equipment, expiresAt: new Date(Date.now() + 5000).toISOString() },
    })
  );
  vi.stubGlobal('fetch', fetcher);
  render(
    <OperationsPanel
      adminUserId="admin-a"
      event={{
        ...event,
        counts: packageCounts(1, 0, 0, 0),
        resumeAllowed: true,
        blockers: [],
        equipment,
      }}
    />
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  const resume = screen.getByRole('button', { name: 'Resume Booth' });
  expect(resume.hasAttribute('disabled')).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByLabelText('Equipment status').textContent).toContain('CameraNeeds check');
  expect(resume.hasAttribute('disabled')).toBe(true);
  fireEvent.click(resume);
  expect(fetcher).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  await act(async () => {
    fireEvent(window, new Event('focus'));
  });
  expect(resume.hasAttribute('disabled')).toBe(false);
  expect(screen.getByLabelText('Equipment status').textContent).toContain('CameraReady');
  expect(screen.getByText('Booth paused')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(`/api/admin/events/${event.id}/booth/state`);
});
it('shows server package capacity and preserves the pending print at zero availability', () => {
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  expect(screen.getByText('50 total booked prints')).toBeTruthy();
  expect(screen.getByText('49 printed')).toBeTruthy();
  expect(screen.getByText('1 print pending')).toBeTruthy();
  expect(screen.getByText('1 prints remaining')).toBeTruthy();
  expect(screen.getByText('0 prints available')).toBeTruthy();
  expect(screen.getByText('Guest · Pending')).toBeTruthy();
  expect(screen.queryByText(/Film Stock/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add guest prints' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Test Print' })).toBeNull();
});

it.each(['finish', 'cancel', 'replacement', 'Draft cancellation'] as const)(
  '%s dialogs inherit the current Admin theme',
  async (action) => {
    const current = {
      ...event,
      counts: packageCounts(1, 0, 0, 0),
      possibleDelivery: false,
      runId: crypto.randomUUID(),
      runState: action === 'cancel' ? ('Finished' as const) : ('Paused' as const),
    };
    render(
      <div className="admin-shell" data-theme="dark">
        <OperationsPanel
          adminUserId="admin-a"
          event={
            action === 'Draft cancellation'
              ? { ...current, state: 'Draft', runId: null, runState: null }
              : current
          }
        />
      </div>
    );
    const name =
      action === 'finish'
        ? 'Finish Booth Mode'
        : action === 'replacement'
          ? 'Replace Booth access'
          : 'Cancel Event';
    const trigger = screen.getByRole('button', { name });
    await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog').closest('.admin-shell')?.getAttribute('data-theme')).toBe(
      'dark'
    );
  }
);
it('cancels a Draft using the package operation contract', async () => {
  let body: object | undefined;
  vi.stubGlobal('fetch', async (_path: string, options: RequestInit) => {
    body = JSON.parse(String(options.body));
    return Response.json({ state: 'Cancelled' });
  });
  render(
    <OperationsPanel
      adminUserId="admin-a"
      event={{ ...event, state: 'Draft', counts: packageCounts(5, 0, 0, 0), attempts: [] }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Event' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Cancel Event' }).at(-1)!);
  await screen.findByRole('status');
  expect(body).toEqual({ operationId: expect.any(String), expectedRevision: 3 });
});
it('keeps failed cancellation visible and retries with the same operation identity', async () => {
  const bodies: object[] = [];
  vi.stubGlobal('fetch', async (_path: string, options: RequestInit) => {
    bodies.push(JSON.parse(String(options.body)));
    return bodies.length === 1
      ? Response.json({}, { status: 503 })
      : Response.json({ state: 'Cancelled' });
  });
  render(
    <OperationsPanel
      adminUserId="admin-a"
      event={{ ...event, state: 'Draft', counts: packageCounts(5, 0, 0, 0) }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Event' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Cancel Event' }).at(-1)!);
  await screen.findByRole('alert');
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'Cancel Event' }).at(-1)!);
  await screen.findByRole('status');
  expect(bodies[1]).toEqual(bodies[0]);
});
it('retains terminal records without redaction or deletion controls', () => {
  render(<OperationsPanel adminUserId="admin-a" event={{ ...event, state: 'Cancelled' }} />);
  expect(screen.queryByRole('button', { name: 'Cancel Event' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Redact Client' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete Draft' })).toBeNull();
});
it('preserves attempt pagination links', () => {
  render(
    <OperationsPanel
      adminUserId="admin-a"
      event={{ ...event, attemptsPage: 1, hasOlderAttempts: true }}
    />
  );
  expect(screen.getByRole('link', { name: 'Older print attempts' }).getAttribute('href')).toContain(
    'attemptPage=2'
  );
  expect(screen.getByRole('link', { name: 'Newer print attempts' }).getAttribute('href')).toContain(
    'attemptPage=0'
  );
});

it('recovers a committed purchase after a lost response without issuing another purchase', async () => {
  let purchases = 0;
  let submitted: Record<string, unknown>;
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (path.endsWith('/film-packages')) {
      purchases++;
      submitted = JSON.parse(String(options?.body));
      throw new TypeError('Response lost');
    }
    if (path.includes('/operations/'))
      return Response.json({
        receipt: {
          operationId: submitted.operationId,
          kind: 'add_packages',
          committedRevision: 4,
          result: { ...packageCounts(5, 1, 49, 1), entryId: 'entry' },
        },
        revision: 4,
      });
    return Response.json({ counts: packageCounts(5, 1, 49, 1), revision: 4 });
  });
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Add Film Packages' }) as HTMLButtonElement).disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add Film Packages' }));
  fireEvent.change(screen.getByLabelText('Client request note'), {
    target: { value: 'One more package' },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Film Packages' }).at(-1)!);
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Additional Film Packages') as HTMLInputElement).disabled).toBe(
    true
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry request' }));
  await screen.findByText('Film Packages added.');
  expect(screen.getByText('60 total booked prints')).toBeTruthy();
  expect(screen.getByText('1 print pending')).toBeTruthy();
  expect(screen.getByText('Booth paused')).toBeTruthy();
  expect(purchases).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(sessionStorage.getItem(`film-package-purchase:${event.id}:admin-a`)).toBeNull();
});

it('replays only the frozen original payload when receipt lookup finds no commit', async () => {
  const bodies: object[] = [];
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (path.includes('/operations/')) return Response.json({ receipt: null, revision: 3 });
    if (path.endsWith('/booth/state')) return Response.json({ counts: packageCounts(5, 1, 49, 1) });
    const body = JSON.parse(String(options?.body));
    bodies.push(body);
    if (bodies.length === 1) throw new TypeError('Offline');
    return Response.json({
      receipt: {
        operationId: body.operationId,
        kind: 'add_packages',
        committedRevision: 4,
        result: { ...packageCounts(5, 1, 49, 1), entryId: 'entry' },
      },
      revision: 4,
      replayed: false,
    });
  });
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Add Film Packages' }) as HTMLButtonElement).disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add Film Packages' }));
  fireEvent.change(screen.getByLabelText('Client request note'), {
    target: { value: 'Client request' },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Film Packages' }).at(-1)!);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry request' }));
  await screen.findByText('Film Packages added.');
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
});

it('shows fresh server props after another device changes capacity', () => {
  const view = render(<OperationsPanel adminUserId="admin-a" event={event} />);
  view.rerender(
    <OperationsPanel
      adminUserId="admin-a"
      event={{ ...event, revision: 4, counts: packageCounts(5, 1, 49, 1) }}
    />
  );
  expect(screen.getByText('60 total booked prints')).toBeTruthy();
});

it('keeps receipt recovery available if the Event becomes terminal before acknowledgement', async () => {
  sessionStorage.setItem(
    `film-package-purchase:${event.id}:admin-a`,
    JSON.stringify({
      operationId: 'ab000000-0000-4000-8000-000000000002',
      packages: 1,
      clientRequestNote: 'Client request',
    })
  );
  render(<OperationsPanel adminUserId="admin-a" event={{ ...event, state: 'Completed' }} />);
  await screen.findByRole('button', { name: 'Retry request' });
  expect(screen.getByLabelText('Additional Film Packages').getAttribute('disabled')).not.toBeNull();
});

it('preserves A’s pending purchase across an Admin switch without letting B replay it', async () => {
  const adminA = '10000000-0000-4000-8000-000000000001';
  const adminB = '10000000-0000-4000-8000-000000000002';
  let actor = adminA;
  let purchases = 0;
  const expectedActors: (string | null)[] = [];
  let operationId: string;
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (path.endsWith('/film-packages') || path.includes('/operations/'))
      expectedActors.push(new Headers(options?.headers).get('x-package-admin-id'));
    if (path.endsWith('/film-packages')) {
      purchases++;
      operationId = JSON.parse(String(options?.body)).operationId;
      throw new TypeError('Committed response lost');
    }
    if (path.includes('/operations/'))
      return Response.json({
        receipt:
          actor === adminA
            ? {
                operationId,
                kind: 'add_packages',
                committedRevision: 4,
                result: { ...packageCounts(5, 1, 49, 1), entryId: 'entry' },
              }
            : null,
        revision: 4,
      });
    return Response.json({ counts: packageCounts(5, 1, 49, 1), revision: 4 });
  });
  const view = render(<OperationsPanel event={event} adminUserId={adminA} />);
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Add Film Packages' }) as HTMLButtonElement).disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add Film Packages' }));
  fireEvent.change(screen.getByLabelText('Client request note'), {
    target: { value: 'A requested one more package' },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Film Packages' }).at(-1)!);
  await screen.findByRole('alert');
  const saved = Object.entries(sessionStorage);
  actor = adminB;
  view.rerender(<OperationsPanel event={event} adminUserId={adminB} />);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.queryByRole('button', { name: 'Retry request' })).toBeNull();
  expect(Object.entries(sessionStorage)).toEqual(saved);
  expect(purchases).toBe(1);
  actor = adminA;
  view.rerender(<OperationsPanel event={event} adminUserId={adminA} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry request' }));
  await screen.findByText('Film Packages added.');
  expect(purchases).toBe(1);
  expect(screen.getByText('60 total booked prints')).toBeTruthy();
  expect(expectedActors).toEqual([adminA, adminA]);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(sessionStorage.length).toBe(0);
});

it('retries a blocked storage read without losing the original purchase or trapping Cancel', async () => {
  const purchase = {
    operationId: crypto.randomUUID(),
    packages: 2,
    clientRequestNote: 'Original request',
  };
  sessionStorage.setItem(`film-package-purchase:${event.id}:admin-a`, JSON.stringify(purchase));
  const originalRead = Storage.prototype.getItem;
  let failPurchaseRead = true;
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
    this: Storage,
    key
  ) {
    if (key.startsWith('film-package-purchase:') && failPurchaseRead) {
      failPurchaseRead = false;
      throw new DOMException('Blocked', 'SecurityError');
    }
    return originalRead.call(this, key);
  });
  const fetcher = vi.fn(async (path: string) =>
    path.includes('/operations/')
      ? Response.json({
          receipt: {
            operationId: purchase.operationId,
            kind: 'add_packages',
            result: { entryId: 'entry' },
          },
        })
      : Response.json({ counts: packageCounts(5, 2, 49, 1) })
  );
  vi.stubGlobal('fetch', fetcher);
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add Film Packages' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry saved request' }));
  await waitFor(() =>
    expect((screen.getByLabelText('Additional Film Packages') as HTMLInputElement).value).toBe('2')
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry request' }));
  await screen.findByText('Film Packages added.');
  expect(fetcher.mock.calls.some(([path]) => path.endsWith('/film-packages'))).toBe(false);
  expect(screen.getByText('70 total booked prints')).toBeTruthy();
  expect(read.mock.calls.filter(([key]) => key.startsWith('film-package-purchase:'))).toHaveLength(
    2
  );
});

it.each([
  ['', 'Enter the number of Film Packages to add.'],
  ['0', 'Enter at least one Film Package.'],
  ['-1', 'Enter at least one Film Package.'],
  ['1.5', 'Enter a whole number of Film Packages.'],
  ['214748364', 'You can add at most 214748359 Film Packages to this Event.'],
])('explains invalid package quantity %s beside its field', async (value, message) => {
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Add Film Packages' }) as HTMLButtonElement).disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add Film Packages' }));
  const field = screen.getByLabelText('Additional Film Packages') as HTMLInputElement;
  fireEvent.change(field, { target: { value } });
  expect(screen.getByText(message).id).toBe(field.getAttribute('aria-describedby'));
  expect(field.value).toBe(value);
  expect(field.getAttribute('aria-invalid')).toBe('true');
});

it.each([true, false])(
  'recovers only a receipt for damaged purchase payloads (receipt exists: %s)',
  async (committed) => {
    const operationId = crypto.randomUUID();
    const storageKey = `film-package-purchase:${event.id}:admin-a`;
    const damaged = JSON.stringify({ operationId, packages: 'damaged' });
    sessionStorage.setItem(storageKey, damaged);
    const fetcher = vi.fn(async (path: string) =>
      path.includes('/operations/')
        ? Response.json({
            receipt: committed
              ? { operationId, kind: 'add_packages', result: { entryId: 'original-entry' } }
              : null,
          })
        : Response.json({ counts: packageCounts(5, 1, 49, 1) })
    );
    vi.stubGlobal('fetch', fetcher);
    render(<OperationsPanel adminUserId="admin-a" event={event} />);
    await screen.findByText(/Saved purchase details are damaged/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry request' }));
    if (committed) {
      await screen.findByText('Film Packages added.');
      const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
        throw new DOMException('Blocked', 'SecurityError');
      });
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      await screen.findByText(/saved reference could not be cleared/);
      expect(sessionStorage.getItem(storageKey)).toBe(damaged);
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(remove).toHaveBeenCalledTimes(2);
      expect(sessionStorage.getItem(storageKey)).toBeNull();
    } else {
      await screen.findByText(/No receipt is available yet/);
      expect(sessionStorage.getItem(storageKey)).toBe(damaged);
    }
    expect(fetcher.mock.calls.some(([path]) => path.endsWith('/film-packages'))).toBe(false);
  }
);

it('keeps an unreadable purchase identity blocked until the original saved request is restored', async () => {
  const storageKey = `film-package-purchase:${event.id}:admin-a`;
  sessionStorage.setItem(storageKey, '{broken');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  await screen.findByText(/reference cannot be read/);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add Film Packages' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry saved request' }));
  expect(sessionStorage.getItem(storageKey)).toBe('{broken');
  expect(fetcher).not.toHaveBeenCalled();
  const purchase = {
    operationId: crypto.randomUUID(),
    packages: 2,
    clientRequestNote: 'Restored original',
  };
  sessionStorage.setItem(storageKey, JSON.stringify(purchase));
  fireEvent.click(screen.getByRole('button', { name: 'Retry saved request' }));
  expect((screen.getByLabelText('Client request note') as HTMLInputElement).value).toBe(
    purchase.clientRequestNote
  );
  expect(screen.getByRole('button', { name: 'Retry request' })).toBeTruthy();
});

it('does not send a purchase when storage cannot retain it and allows retry after access returns', async () => {
  const fetcher = vi.fn(async () => {
    throw new TypeError('Response lost');
  });
  vi.stubGlobal('fetch', fetcher);
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add Film Packages' }).hasAttribute('disabled')).toBe(
      false
    )
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add Film Packages' }));
  fireEvent.change(screen.getByLabelText('Client request note'), {
    target: { value: 'Keep this note' },
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Film Packages' }).at(-1)!);
  await screen.findByText(/purchase was not sent/);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Film Packages' }).at(-1)!);
  await screen.findByText(/Your request details have been kept/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('pauses with one frozen command and recovers a lost reply from its receipt', async () => {
  let command: Record<string, unknown>;
  let posts = 0;
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (path.endsWith('/booth/pause')) {
      posts++;
      command = JSON.parse(String(options?.body));
      throw new TypeError('lost');
    }
    if (path.includes('/operations/'))
      return Response.json({
        receipt: {
          operationId: command.operationId,
          kind: 'pause',
          committedRevision: 4,
          result: { state: 'Paused' },
        },
        revision: 4,
      });
    return Response.json({});
  });
  render(<OperationsPanel adminUserId="admin-a" event={{ ...event, runState: 'Active' }} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Pause Booth' }).hasAttribute('disabled')).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pause Booth' }));
  await screen.findByText(/Booth command outcome is unconfirmed/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry Booth command' }));
  await screen.findByText('Booth command recorded. Refreshing current state.');
  expect(posts).toBe(1);
  expect(command!).toEqual({ operationId: expect.any(String), expectedRevision: 3, runId: 'run' });
});

it('keeps Resume disabled for pending work and requires confirmation before Finish', async () => {
  const fetcher = vi.fn(async () => Response.json({}));
  vi.stubGlobal('fetch', fetcher);
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  expect(
    (await screen.findByRole('button', { name: 'Resume Booth' })).hasAttribute('disabled')
  ).toBe(true);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Finish Booth Mode' }).hasAttribute('disabled')).toBe(
      false
    )
  );
  fireEvent.click(screen.getByRole('button', { name: 'Finish Booth Mode' }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText(/A command already sent may still print/)).toBeTruthy();
});

it('replays only the original Booth payload after polling changes the revision', async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (path.includes('/operations/')) return Response.json({ receipt: null });
    bodies.push(JSON.parse(String(options?.body)));
    if (bodies.length === 1) throw new TypeError('lost');
    return Response.json({ receipt: { operationId: bodies[0].operationId, kind: 'pause' } });
  });
  const view = render(
    <OperationsPanel adminUserId="admin-a" event={{ ...event, runState: 'Active' }} />
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Pause Booth' }).hasAttribute('disabled')).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pause Booth' }));
  await screen.findByText(/Booth command outcome is unconfirmed/);
  view.rerender(
    <OperationsPanel adminUserId="admin-a" event={{ ...event, revision: 9, runState: 'Paused' }} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry Booth command' }));
  await screen.findByText('Booth command recorded. Refreshing current state.');
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

it('rejects a mismatched Booth receipt and does not send a new command', async () => {
  const key = `booth-command:${event.id}:admin-a`;
  sessionStorage.setItem(
    key,
    JSON.stringify({
      action: 'pause',
      body: { operationId: crypto.randomUUID(), expectedRevision: 3, runId: 'run' },
    })
  );
  const fetcher = vi.fn(async () =>
    Response.json({ receipt: { operationId: crypto.randomUUID(), kind: 'pause' } })
  );
  vi.stubGlobal('fetch', fetcher);
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry Booth command' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Booth command recorded. Refreshing current state.')).toBeNull();
  expect(sessionStorage.getItem(key)).not.toBeNull();
});

it('fences a saved Booth command when the signed-in Admin changes', async () => {
  const saved = {
    action: 'pause',
    body: { operationId: crypto.randomUUID(), expectedRevision: 3, runId: 'run' },
  };
  const key = `booth-command:${event.id}:admin-a`;
  sessionStorage.setItem(key, JSON.stringify(saved));
  const actors: (string | null)[] = [];
  vi.stubGlobal('fetch', async (_path: string, options?: RequestInit) => {
    actors.push(new Headers(options?.headers).get('x-package-admin-id'));
    return Response.json({ receipt: { operationId: saved.body.operationId, kind: 'pause' } });
  });
  const view = render(<OperationsPanel adminUserId="admin-a" event={event} />);
  await screen.findByRole('button', { name: 'Retry Booth command' });
  view.rerender(<OperationsPanel adminUserId="admin-b" event={event} />);
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry Booth command' })).toBeNull()
  );
  expect(sessionStorage.getItem(key)).toBe(JSON.stringify(saved));
  expect(actors).toEqual([]);
  view.rerender(<OperationsPanel adminUserId="admin-a" event={event} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry Booth command' }));
  await screen.findByText('Booth command recorded. Refreshing current state.');
  expect(actors).toEqual(['admin-a']);
});

it('keeps a stale command visibly rejected and does not report success', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ code: 'stale_revision' }, { status: 409 }));
  render(<OperationsPanel adminUserId="admin-a" event={{ ...event, runState: 'Active' }} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Pause Booth' }).hasAttribute('disabled')).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pause Booth' }));
  await screen.findByText('The Event changed. Review current state before trying again.');
  expect(screen.queryByText('Booth command recorded. Refreshing current state.')).toBeNull();
  expect(sessionStorage.getItem(`booth-command:${event.id}:admin-a`)).toBeNull();
});

it('polls scoped phone readiness without rerendering the route while its revision is unchanged', async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  let release!: () => void;
  const fetcher = vi.fn<(path: string, options?: RequestInit) => Promise<Response>>(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return Response.json({
      revision: event.revision,
      allowedActions: { resume: false },
      blockers: ['camera'],
      equipment: {
        expiresAt: new Date(Date.now() + 5000).toISOString(),
        cameraLive: false,
        printerConnected: true,
        serverReachable: true,
        filmLoaded: true,
      },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  const view = render(<OperationsPanel adminUserId="admin-a" event={event} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(32);
  });
  refresh.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1967);
  });
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(`/api/admin/events/${event.id}/booth/state`);
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-package-admin-id')).toBe('admin-a');
  fireEvent(window, new Event('focus'));
  fireEvent(window, new Event('online'));
  fireEvent(document, new Event('visibilitychange'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {
    release();
  });
  expect(screen.getByLabelText('Equipment status').textContent).toContain('CameraUnavailable');
  expect(screen.getByText('Camera is not ready.')).toBeTruthy();
  expect(refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue('hidden');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible');
  fireEvent(window, new Event('focus'));
  fireEvent(window, new Event('online'));
  fireEvent(document, new Event('visibilitychange'));
  expect(fetcher).toHaveBeenCalledTimes(2);
  const signal = (fetcher.mock.calls[1][1] as RequestInit).signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    release();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(refresh).not.toHaveBeenCalled();
  visibility.mockRestore();
  vi.useRealTimers();
});

it('refreshes the full Event only when scoped state reports a newer revision', async () => {
  vi.useFakeTimers();
  let revision = event.revision - 1;
  vi.stubGlobal('fetch', async () =>
    Response.json({
      revision,
      allowedActions: { resume: true },
      blockers: [],
      equipment: null,
    })
  );
  const view = render(<OperationsPanel adminUserId="admin-a" event={event} />);
  refresh.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(refresh).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Resume Booth' }).hasAttribute('disabled')).toBe(true);
  revision = event.revision + 1;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  view.rerender(
    <OperationsPanel
      adminUserId="admin-a"
      event={{ ...event, revision, state: 'Completed', runState: 'Finished' }}
    />
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Resume Booth' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start Booth Mode' })).toBeNull();
});

it.each(['malformed', 'server error', 'timeout'])(
  'keeps %s phone readiness visibly unavailable and recovers on the next scoped poll',
  async (failure) => {
    vi.useFakeTimers();
    let failed = true;
    vi.stubGlobal('fetch', async (_path: string, options?: RequestInit) => {
      if (!failed)
        return Response.json({
          revision: event.revision,
          allowedActions: { resume: true },
          blockers: [],
          equipment: {
            expiresAt: new Date(Date.now() + 5000).toISOString(),
            cameraLive: true,
            printerConnected: true,
            serverReachable: true,
            filmLoaded: true,
          },
        });
      if (failure === 'timeout')
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        });
      return failure === 'malformed'
        ? Response.json({ allowedActions: { resume: true } })
        : Response.json({ code: 'operation_unavailable' }, { status: 503 });
    });
    render(
      <OperationsPanel
        adminUserId="admin-a"
        event={{ ...event, resumeAllowed: true, counts: packageCounts(1, 0, 0, 0) }}
      />
    );
    refresh.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(failure === 'timeout' ? 7001 : 2000);
    });
    expect(screen.getByRole('alert').textContent).toContain('Booth status could not be refreshed');
    expect(screen.getByRole('button', { name: 'Resume Booth' }).hasAttribute('disabled')).toBe(
      true
    );
    expect(refresh).not.toHaveBeenCalled();
    failed = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resume Booth' }).hasAttribute('disabled')).toBe(
      false
    );
    expect(refresh).not.toHaveBeenCalled();
  }
);

it('guards Resume on authoritative readiness and explains independent blockers', async () => {
  const current = {
    ...event,
    counts: packageCounts(1, 0, 0, 0),
    resumeAllowed: false,
    blockers: ['camera', 'readiness_stale'],
  };
  const view = render(<OperationsPanel adminUserId="admin-a" event={current} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Finish Booth Mode' }).hasAttribute('disabled')).toBe(
      false
    )
  );
  expect(screen.getByRole('button', { name: 'Resume Booth' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('Camera is not ready.')).toBeTruthy();
  expect(screen.getByText('Equipment readiness is out of date.')).toBeTruthy();
  view.rerender(
    <OperationsPanel
      adminUserId="admin-a"
      event={{ ...current, resumeAllowed: true, blockers: [] }}
    />
  );
  expect(screen.getByRole('button', { name: 'Resume Booth' }).hasAttribute('disabled')).toBe(true);
  view.rerender(
    <OperationsPanel
      adminUserId="admin-a"
      event={{
        ...current,
        resumeAllowed: true,
        blockers: [],
        equipment: {
          expiresAt: new Date(Date.now() + 5000).toISOString(),
          cameraLive: true,
          printerConnected: true,
          serverReachable: true,
          filmLoaded: true,
        },
      }}
    />
  );
  expect(screen.getByRole('button', { name: 'Resume Booth' }).hasAttribute('disabled')).toBe(false);
});

it('returns focus to Finish after dismissing its confirmation', async () => {
  render(<OperationsPanel adminUserId="admin-a" event={event} />);
  const trigger = screen.getByRole('button', { name: 'Finish Booth Mode' });
  await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it('coalesces repeated phone Pause gestures while the command is in flight', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let submissions = 0;
  vi.stubGlobal('fetch', async (_path: string, options?: RequestInit) => {
    submissions++;
    const body = JSON.parse(String(options?.body));
    await gate;
    return Response.json({ receipt: { operationId: body.operationId, kind: 'pause' } });
  });
  render(<OperationsPanel adminUserId="admin-a" event={{ ...event, runState: 'Active' }} />);
  const button = screen.getByRole('button', { name: 'Pause Booth' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  fireEvent.click(button);
  fireEvent.click(button);
  expect(submissions).toBe(1);
  expect(screen.getByRole('status').textContent).toContain('Recording Booth command. Please wait.');
  await act(async () => {
    release();
  });
  await screen.findByText('Booth command recorded. Refreshing current state.');
});

it('keeps Finish confirmation bound to the reviewed run and revision', async () => {
  let submitted: Record<string, unknown>;
  vi.stubGlobal('fetch', async (_path: string, options?: RequestInit) => {
    submitted = JSON.parse(String(options?.body));
    return Response.json({ receipt: { operationId: submitted.operationId, kind: 'finish' } });
  });
  const view = render(<OperationsPanel adminUserId="admin-a" event={event} />);
  const trigger = screen.getByRole('button', { name: 'Finish Booth Mode' });
  await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
  fireEvent.click(trigger);
  view.rerender(
    <OperationsPanel
      adminUserId="admin-a"
      event={{ ...event, revision: 9, runId: 'replacement-run', runState: 'Active' }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Finish Booth Mode' }));
  await screen.findByText('Booth command recorded. Refreshing current state.');
  expect(submitted!).toMatchObject({ runId: 'run', expectedRevision: 3 });
});

it('offers a new local setup after Finished, separately from Event completion', async () => {
  render(
    <OperationsPanel
      adminUserId="admin-a"
      event={{ ...event, runState: 'Finished', counts: packageCounts(5, 0, 49, 0), attempts: [] }}
    />
  );
  expect(screen.getByRole('button', { name: 'Start Booth Mode' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Resume Booth' })).toBeNull();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Complete Event' }).hasAttribute('disabled')).toBe(
      false
    )
  );
  expect(screen.getByRole('button', { name: 'Cancel Event' })).toBeTruthy();
});

it.each(['Active', 'Paused', 'Finishing'] as const)(
  'blocks Event termination while run is %s',
  async (runState) => {
    render(
      <OperationsPanel
        adminUserId="admin-a"
        event={{ ...event, runState, counts: packageCounts(5, 0, 49, 0) }}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Complete Event' }).hasAttribute('disabled')).toBe(
        true
      )
    );
    expect(screen.getByRole('button', { name: 'Cancel Event' }).hasAttribute('disabled')).toBe(
      true
    );
  }
);

it.each(['complete', 'cancel'])(
  'confirms Live %s separately and recovers its frozen command after a lost response',
  async (action) => {
    let submitted: Record<string, unknown>;
    let posts = 0;
    const actors: (string | null)[] = [];
    vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
      actors.push(new Headers(options?.headers).get('x-package-admin-id'));
      if (path.includes('/operations/'))
        return Response.json({ receipt: { operationId: submitted.operationId, kind: action } });
      expect(path).toBe(`/api/admin/events/${event.id}/${action}`);
      submitted = JSON.parse(String(options?.body));
      posts++;
      throw new TypeError('lost response');
    });
    const finished = {
      ...event,
      runState: 'Finished' as const,
      counts: packageCounts(5, 0, 49, 0),
      attempts: [],
    };
    const view = render(<OperationsPanel adminUserId="admin-a" event={finished} />);
    const name = action === 'complete' ? 'Complete Event' : 'Cancel Event';
    const trigger = screen.getByRole('button', { name });
    await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
    fireEvent.click(trigger);
    expect(posts).toBe(0);
    expect(screen.getByRole('dialog').textContent).toMatch(/History/);
    if (action === 'cancel')
      expect(
        screen.getByRole('button', { name: 'Confirm Cancel Event' }).getAttribute('data-variant')
      ).toBe('destructive');
    view.rerender(<OperationsPanel adminUserId="admin-a" event={{ ...finished, revision: 8 }} />);
    fireEvent.click(screen.getByRole('button', { name: `Confirm ${name}` }));
    await screen.findByRole('alert');
    expect(submitted!).toEqual({ operationId: expect.any(String), expectedRevision: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Retry Booth command' }));
    await screen.findByText('Booth command recorded. Refreshing current state.');
    expect(posts).toBe(1);
    expect(actors).toEqual(['admin-a', 'admin-a']);
  }
);

it('keeps server-proven unsent recovery distinct from possible delivery and Finishing', () => {
  const view = render(
    <OperationsPanel adminUserId="admin-a" event={{ ...event, possibleDelivery: false }} />
  );
  expect(
    screen.getByRole('button', { name: 'Replace Booth access' }).hasAttribute('disabled')
  ).toBe(false);
  view.rerender(
    <OperationsPanel adminUserId="admin-a" event={{ ...event, possibleDelivery: true }} />
  );
  expect(screen.queryByRole('button', { name: 'Replace Booth access' })).toBeNull();
  view.rerender(
    <OperationsPanel
      adminUserId="admin-a"
      event={{ ...event, runState: 'Finishing', possibleDelivery: false }}
    />
  );
  expect(screen.queryByRole('button', { name: 'Replace Booth access' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start Booth Mode' })).toBeNull();
});
