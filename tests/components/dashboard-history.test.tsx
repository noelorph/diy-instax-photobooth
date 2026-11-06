import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Dashboard } from '@/features/admin/dashboard/dashboard';
import type { DashboardReadResult } from '@/features/admin/dashboard/types';

afterEach(cleanup);
const now = '2026-11-06T12:00:00Z';
const result: Extract<DashboardReadResult, { status: 'success' }> = {
  status: 'success',
  summary: { monthEvents: 3, totalBookedEvents: 3, upcomingEvents: 1, nextEvent: null },
  liveEvent: {
    id: 'live',
    title: 'Live celebration',
    venueAddress: 'Hall',
    startsAtUtc: now,
    endsAtUtc: '2026-11-06T14:00:00Z',
    timeZone: 'Asia/Manila',
    runState: 'Paused',
    counts: {
      originalPackages: 5,
      additionalPackages: 1,
      totalBookedPrints: 60,
      printed: 37,
      unresolved: 1,
      printsRemaining: 23,
      printsAvailable: 22,
    },
  },
  activity: [],
  hasNextPage: false,
};
it('Live Event card uses authoritative counts and current run state', () => {
  render(<Dashboard result={result} now={now} activityDays={7} page={0} />);
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  expect(screen.getByText('60 total booked prints')).toBeTruthy();
  expect(screen.getByText('37 Confirmed Prints')).toBeTruthy();
  expect(screen.getByText('22 Prints available')).toBeTruthy();
  expect(screen.getByText('1 Pending print')).toBeTruthy();
  expect(screen.getByText('Booth Paused')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open Live Event' }).getAttribute('href')).toBe(
    '/events/live'
  );
});
it('missing Live Event is distinct from unavailable reporting', () => {
  const { rerender } = render(
    <Dashboard result={{ ...result, liveEvent: null }} now={now} activityDays={7} page={0} />
  );
  expect(screen.getByRole('heading', { name: 'No Live Event' })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  rerender(
    <Dashboard
      result={{ status: 'unavailable', error: 'Dashboard unavailable' }}
      now={now}
      activityDays={7}
      page={0}
    />
  );
  expect(screen.getByRole('alert').textContent).toContain('Dashboard unavailable');
  expect(screen.queryByText('No Live Event')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Monthly Events' })).toBeNull();
});
it('preserves the activity window across pages and resets pages when the window changes', () => {
  render(
    <Dashboard
      result={{
        ...result,
        hasNextPage: true,
        activity: [
          { id: 'audit', eventId: null, operationKind: 'unknown_future_action', occurredAt: now },
        ],
      }}
      now={now}
      activityDays={30}
      page={1}
    />
  );
  expect(screen.getByRole('link', { name: '7 days' }).getAttribute('href')).toBe(
    '/dashboard?activityDays=7'
  );
  expect(screen.getByRole('link', { name: '30 days' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Older activity' }).getAttribute('href')).toBe(
    '/dashboard?activityDays=30&page=2'
  );
  expect(screen.getByRole('link', { name: 'Newer activity' }).getAttribute('href')).toBe(
    '/dashboard?activityDays=30&page=0'
  );
  expect(screen.getByText('Event activity recorded')).toBeTruthy();
  expect(screen.getByText('Event no longer available')).toBeTruthy();
});

it.each([
  ['Active', 'Booth Active'],
  ['Finished', 'Booth Finished'],
  [null, 'Booth not started'],
] as const)(
  'shows the Live Event run state %s without manufacturing active status',
  (runState, label) => {
    render(
      <Dashboard
        result={{ ...result, liveEvent: { ...result.liveEvent!, runState } }}
        now={now}
        activityDays={7}
        page={0}
      />
    );
    expect(screen.getByText(label)).toBeTruthy();
    if (runState !== 'Active') expect(screen.queryByText('Booth Active')).toBeNull();
  }
);
it('labels existing package lifecycle activity kinds', () => {
  render(
    <Dashboard
      result={{
        ...result,
        activity: [
          { id: 'start', eventId: 'live', operationKind: 'start', occurredAt: now },
          { id: 'complete', eventId: 'live', operationKind: 'complete', occurredAt: now },
          { id: 'cancel', eventId: 'live', operationKind: 'cancel', occurredAt: now },
          { id: 'delete', eventId: null, operationKind: 'complete_delete_draft', occurredAt: now },
        ],
      }}
      now={now}
      activityDays={7}
      page={0}
    />
  );
  expect(screen.getByText('Booth Mode started')).toBeTruthy();
  expect(screen.getByText('Event completed')).toBeTruthy();
  expect(screen.getByText('Event cancelled')).toBeTruthy();
  expect(screen.getByText('Draft removed')).toBeTruthy();
});
it.each(['constructor', '__proto__'])(
  'uses a safe fallback for unknown audit kind %s',
  (operationKind) => {
    render(
      <Dashboard
        result={{
          ...result,
          activity: [{ id: 'unknown', eventId: null, operationKind, occurredAt: now }],
        }}
        now={now}
        activityDays={7}
        page={0}
      />
    );
    expect(screen.getByText('Event activity recorded')).toBeTruthy();
  }
);

it.each([
  ['Dashboard', () => import('@/app/(admin)/dashboard/loading')],
  ['History', () => import('@/app/(admin)/history/loading')],
  ['Event', () => import('@/app/(admin)/events/[eventId]/loading')],
] as const)(
  '%s loading exposes accessible progress without invented reporting',
  async (_, load) => {
    const { default: Loading } = await load();
    render(<Loading />);
    expect(screen.getByRole('status').textContent).toMatch(/loading/i);
    expect(screen.queryByRole('region', { name: 'Total booked prints' })).toBeNull();
  }
);
