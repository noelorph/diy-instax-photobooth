import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import EventPage from '@/app/(admin)/events/[eventId]/page';
vi.mock('@/lib/events/drafts', () => ({ getDraft: async () => ({ status: 'not_found' }) }));
vi.mock('@/features/admin/events/actions', () => ({
  createDraftAction: vi.fn(),
  updateDraftAction: vi.fn(),
}));
vi.mock('@/features/admin/operations/read', () => ({
  getHistorySummary: async () => ({ status: 'success', events: 3, captures: 7 }),
  getOperationalEvent: async () => ({
    status: 'success',
    event: {
      id: 'a',
      title: 'Live celebration',
      state: 'Live',
      revision: 1,
      originalAllowance: 10,
      additionalPrints: 0,
      confirmedPrints: 0,
      captures: 0,
      allowanceReserved: 0,
      stockReserved: 0,
      onHand: 0,
      runState: 'Paused',
      connectionId: null,
      attempts: [],
      redacted: false,
      mediaRemovalState: 'none',
    },
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
it('renders Live Event management instead of a missing Draft', async () => {
  render(await EventPage({ params: Promise.resolve({ eventId: 'a' }) }));
  expect(screen.getByRole('heading', { name: 'Live celebration' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Resume Booth Mode' })).toBeTruthy();
});
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/events/history', () => ({
  listHistory: async () => ({
    status: 'success',
    events: [
      {
        id: 'h',
        title: 'Past celebration',
        state: 'Completed',
        redacted_at: null,
        venue_address: 'Celebration Hall',
        client_name: 'Retained client',
        client_email: 'retained@example.test',
        film_package_count: 2,
        original_print_allowance: 10,
        media_removal_state: 'complete',
      },
    ],
  }),
  listPendingMediaRemovals: async () => ({
    status: 'success',
    removals: [{ eventId: 'opaque', revision: 2, action: 'delete_draft' }],
  }),
}));
it('shows History and opaque pending cleanup retries', async () => {
  const { default: HistoryPage } = await import('@/app/(admin)/history/page');
  render(await HistoryPage());
  expect(screen.getByRole('link', { name: 'Past celebration' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry media removal' })).toBeTruthy();
  expect(screen.getByText('Celebration Hall')).toBeTruthy();
  expect(screen.getByText('retained@example.test')).toBeTruthy();
  expect(screen.getByText('3 non-cancelled Events')).toBeTruthy();
  expect(screen.getByText('7 Captures')).toBeTruthy();
  expect(screen.getByText('2 Film Packages')).toBeTruthy();
  expect(screen.getByText('0 Additional Prints')).toBeTruthy();
});
