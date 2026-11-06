import type { PackageCounts, RunState } from '@/lib/operations/package-contract';
export type ActivityItem = {
  id: string;
  eventId: string | null;
  operationKind: string;
  occurredAt: string;
};
type ScheduledEvent = {
  id: string;
  title: string;
  venueAddress: string;
  startsAtUtc: string;
  endsAtUtc: string;
  timeZone: string;
};
export type DashboardLiveEvent = ScheduledEvent & {
  runState: RunState | null;
  counts: PackageCounts;
};
export type DashboardReadResult =
  | {
      status: 'success';
      summary: {
        monthEvents: number;
        upcomingEvents: number;
        totalBookedEvents: number;
        nextEvent: ScheduledEvent | null;
      };
      liveEvent: DashboardLiveEvent | null;
      activity: ActivityItem[];
      hasNextPage: boolean;
    }
  | { status: 'unavailable'; error: string };
