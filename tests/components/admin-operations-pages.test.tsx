import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { getOperationalEvent } from '@/features/admin/operations/read';
import { getHistoryEvent } from '@/lib/events/history';
import EventPage from '@/app/(admin)/events/[eventId]/page';
vi.mock('@/lib/events/drafts', () => ({ getDraft: async () => ({ status: 'not_found' }) }));
vi.mock('@/features/admin/events/actions', () => ({
  createDraftAction: vi.fn(),
  recoverDraftCreationAction: vi.fn(),
  updateDraftAction: vi.fn(),
}));
vi.mock('@/features/admin/operations/read', () => ({
  getOperationalEvent: vi.fn(async () => ({
    status: 'success',
    adminUserId: 'admin-a',
    event: {
      id: 'a',
      title: 'Live celebration',
      state: 'Live',
      revision: 1,
      counts: {
        originalPackages: 2,
        additionalPackages: 0,
        totalBookedPrints: 20,
        printed: 0,
        unresolved: 1,
        printsRemaining: 20,
        printsAvailable: 19,
      },
      captures: 0,
      runId: 'run',
      runState: 'Paused',
      resumeAllowed: false,
      possibleDelivery: true,
      blockers: ['print_pending'],
      equipment: null,
      attempts: [],
      attemptsPage: 0,
      hasOlderAttempts: false,
    },
  })),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
it('renders Live Event management instead of a missing Draft', async () => {
  render(await EventPage({ params: Promise.resolve({ eventId: 'a' }) }));
  expect(screen.getByRole('heading', { name: 'Live celebration' })).toBeTruthy();
  expect(screen.getByText('20 total booked prints')).toBeTruthy();
});
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: vi.fn() }));
const { retained } = vi.hoisted(() => ({
  retained: {
    id: 'h',
    title: 'Past celebration',
    state: 'Completed' as const,
    revision: 3,
    venue_address: 'Celebration Hall',
    starts_at: '2026-11-01T02:00:00Z',
    ends_at: '2026-11-01T03:00:00Z',
    time_zone: 'Asia/Manila',
    client_name: 'Retained client',
    client_email: 'retained@example.test',
    client_phone: '123',
    film_package_count: 3,
    counts: {
      originalPackages: 3,
      additionalPackages: 2,
      totalBookedPrints: 50,
      printed: 13,
      unresolved: 0,
      printsRemaining: 37,
      printsAvailable: 37,
    },
  },
}));
vi.mock('@/lib/events/history', () => ({
  getHistoryEvent: vi.fn(async () => ({ status: 'not_found' })),
  listHistory: async (filter: string = 'all') => ({
    status: 'success',
    events: filter === 'Cancelled' ? [] : [retained],
  }),
  listPendingMediaRemovals: async () => ({
    status: 'success',
    removals: [{ eventId: 'opaque', revision: 2, operationId: 'deletion-operation' }],
  }),
}));
it('shows History and opaque pending cleanup retries', async () => {
  const { default: HistoryPage } = await import('@/app/(admin)/history/page');
  render(await HistoryPage());
  expect(screen.getByRole('link', { name: 'Past celebration' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry media removal' })).toBeTruthy();
  expect(screen.getByText(/Celebration Hall/)).toBeTruthy();
  expect(screen.getByText(/11:00 AM/)).toBeTruthy();
  expect(screen.getByText(/retained@example.test/)).toBeTruthy();
  expect(screen.getByText('3 original Film Packages · 2 additional')).toBeTruthy();
  expect(screen.getByText('13 of 50 prints confirmed')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'All History' }).getAttribute('aria-current')).toBe(
    'page'
  );
});

it('keeps unavailable operations visible with retry and no invented totals', async () => {
  vi.mocked(getOperationalEvent).mockResolvedValueOnce({
    status: 'unavailable',
    error: 'Unable to load Event operations. Reload to try again.',
  });
  render(await EventPage({ params: Promise.resolve({ eventId: 'a' }) }));
  expect(screen.getByRole('alert').textContent).toContain('Unable to load Event operations');
  expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/events/a');
  expect(screen.queryByText(/total booked prints/)).toBeNull();
});

it('History validates filters and distinguishes successful empty results', async () => {
  const { default: HistoryPage } = await import('@/app/(admin)/history/page');
  const { unmount } = render(
    await HistoryPage({ searchParams: Promise.resolve({ state: 'Cancelled' }) })
  );
  expect(screen.getByRole('link', { name: 'Cancelled' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByText('No cancelled Events yet.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Past celebration' })).toBeNull();
  unmount();
  render(await HistoryPage({ searchParams: Promise.resolve({ state: 'Live' }) }));
  expect(screen.getByRole('link', { name: 'All History' }).getAttribute('aria-current')).toBe(
    'page'
  );
  expect(screen.getByRole('link', { name: 'Past celebration' })).toBeTruthy();
});
it.each(['Completed', 'Cancelled'] as const)(
  'renders immutable %s detail with retained contact and separate Capture totals',
  async (state) => {
    vi.mocked(getHistoryEvent).mockResolvedValueOnce({
      status: 'success',
      event: { ...retained, state },
      captures: 14,
      activity: [
        { id: 'old', eventId: 'h', operationKind: 'complete', occurredAt: '2026-01-01T10:00:00Z' },
      ],
      hasNextPage: true,
      mediaAssetCount: 1,
    });
    render(
      await EventPage({
        params: Promise.resolve({ eventId: 'h' }),
        searchParams: Promise.resolve({ activityPage: '1' }),
      })
    );
    expect(screen.getByRole('heading', { name: 'Past celebration' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Total booked prints' }).textContent).toContain('50');
    expect(screen.getByRole('region', { name: 'Confirmed Prints' }).textContent).toContain('13');
    expect(screen.getByRole('region', { name: 'Captures' }).textContent).toContain('14');
    expect(screen.getByText('Includes Retakes')).toBeTruthy();
    expect(screen.getByText(/retained@example.test/)).toBeTruthy();
    expect(screen.getByText('Asia/Manila')).toBeTruthy();
    expect(screen.getByText('No pending attempts')).toBeTruthy();
    expect(
      screen.getByText('1 retained Event Media attachment. Preview unavailable.')
    ).toBeTruthy();
    expect(screen.getByText('Media uploads are temporarily unavailable.')).toBeTruthy();
    expect(
      screen.getByText(
        'Before re-enabling uploads, verify cleanup of interrupted or late uploads and leftover files.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Older activity' }).getAttribute('href')).toBe(
      '/events/h?activityPage=2'
    );
    expect(
      screen.queryByRole('button', {
        name: /redact|delete event|add film packages|reopen|edit event|upload|remove|pause|complete/i,
      })
    ).toBeNull();
    expect(screen.queryByText(/No Event Media attached/)).toBeNull();
  }
);
it('failed terminal reads never render no attachment or invented totals', async () => {
  vi.mocked(getHistoryEvent).mockResolvedValueOnce({
    status: 'unavailable',
    error: 'Unable to load Events. Try again.',
  });
  render(await EventPage({ params: Promise.resolve({ eventId: 'h' }) }));
  expect(screen.getByRole('alert').textContent).toContain('Unable to load Events');
  expect(screen.queryByText(/No Event Media attached/)).toBeNull();
  expect(screen.queryByRole('region', { name: 'Total booked prints' })).toBeNull();
});

it('successful empty terminal media is explicit and invalid activity queries default to the first page', async () => {
  vi.mocked(getHistoryEvent).mockResolvedValueOnce({
    status: 'success',
    event: retained,
    captures: 14,
    activity: [],
    hasNextPage: false,
    mediaAssetCount: 0,
  });
  render(
    await EventPage({
      params: Promise.resolve({ eventId: 'h' }),
      searchParams: Promise.resolve({ activityPage: '1e3', attemptPage: '2' }),
    })
  );
  expect(
    screen.getByText('No Event Media attached. The default Booth presentation was used.')
  ).toBeTruthy();
  expect(screen.getByText('Page 1')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Newer activity' })).toBeNull();
  expect(
    screen.getByText(
      'Before re-enabling uploads, verify cleanup of interrupted or late uploads and leftover files.'
    )
  ).toBeTruthy();
});
