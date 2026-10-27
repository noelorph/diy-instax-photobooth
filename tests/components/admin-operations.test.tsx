import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OperationsPanel } from '@/features/admin/operations/panel';
import { packageCounts } from '@/lib/operations/package-contract';
import type { OperationalEvent } from '@/features/admin/operations/types';
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const event: OperationalEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Celebration',
  state: 'Live',
  revision: 3,
  counts: packageCounts(5, 0, 49, 1),
  captures: 51,
  runId: 'run',
  runState: 'Paused',
  attempts: [{ id: 'pending', kind: 'Guest', state: 'Pending' }],
  attemptsPage: 0,
  hasOlderAttempts: false,
};
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
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
  expect(screen.getByText('Live · Paused')).toBeTruthy();
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
