import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  vi.unstubAllGlobals();
});
it('shows server package capacity and preserves the pending print at zero availability', () => {
  render(<OperationsPanel event={event} />);
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
    <OperationsPanel event={{ ...event, state: 'Draft', counts: packageCounts(5, 0, 0, 0) }} />
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
  render(<OperationsPanel event={{ ...event, state: 'Cancelled' }} />);
  expect(screen.queryByRole('button', { name: 'Cancel Event' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Redact Client' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete Draft' })).toBeNull();
});
it('preserves attempt pagination links', () => {
  render(<OperationsPanel event={{ ...event, attemptsPage: 1, hasOlderAttempts: true }} />);
  expect(screen.getByRole('link', { name: 'Older print attempts' }).getAttribute('href')).toContain(
    'attemptPage=2'
  );
  expect(screen.getByRole('link', { name: 'Newer print attempts' }).getAttribute('href')).toContain(
    'attemptPage=0'
  );
});
