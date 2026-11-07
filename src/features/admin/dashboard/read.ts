import 'server-only';
import { Temporal } from '@js-temporal/polyfill';
import { unstable_rethrow } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { readPackageAdminState } from '@/lib/operations/package-state';
import type { RunState } from '@/lib/operations/package-contract';
import type { DashboardReadResult } from './types';

export async function readDashboard(input: {
  now: string;
  activityDays: 7 | 30;
  page: number;
}): Promise<DashboardReadResult> {
  try {
    const admin = await requireAdmin();
    const client = await createClient();
    const now = Temporal.Instant.from(input.now);
    const days = input.activityDays === 30 ? 30 : 7;
    const page =
      Number.isSafeInteger(input.page) && input.page >= 0 && input.page <= 1000000 ? input.page : 0;
    const select =
      'id,title,state,venueAddress:venue_address,startsAtUtc:starts_at,endsAtUtc:ends_at,timeZone:time_zone' as const;
    const readEvents = (offset: number) =>
      client
        .from('events')
        .select(select)
        .eq('accounting_version', 2)
        .is('deleted_at', null)
        .neq('state', 'Cancelled')
        .order('id')
        .range(offset, offset + 499);
    const first = await readEvents(0);
    if (first.error) throw first.error;
    const events = first.data;
    // Explicit pages avoid the database's default row cap on all-time summaries.
    for (let offset = 500; events.length === offset; offset += 500) {
      const next = await readEvents(offset);
      if (next.error) throw next.error;
      events.push(...next.data);
    }
    const upcoming = events
      .filter(
        (event) =>
          ['Draft', 'Live'].includes(event.state) &&
          Temporal.Instant.compare(Temporal.Instant.from(event.startsAtUtc!), now) > 0
      )
      .sort(
        (a, b) =>
          Temporal.Instant.compare(
            Temporal.Instant.from(a.startsAtUtc!),
            Temporal.Instant.from(b.startsAtUtc!)
          ) || a.id.localeCompare(b.id)
      );
    const schedule = (event: (typeof events)[number]) => ({
      id: event.id,
      title: event.title!,
      venueAddress: event.venueAddress!,
      startsAtUtc: event.startsAtUtc!,
      endsAtUtc: event.endsAtUtc!,
      timeZone: event.timeZone!,
    });
    const live = events.find((event) => event.state === 'Live');
    const packageState = live ? await readPackageAdminState(admin, live.id) : null;
    const activity = await client
      .from('activity_events')
      .select('id,event_id,operation_kind,created_at')
      .eq('accounting_version', 2)
      .gte('created_at', now.subtract({ hours: days * 24 }).toString())
      .lte('created_at', now.toString())
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * 25, page * 25 + 25);
    if (activity.error) throw activity.error;
    const eventIds = [
      ...new Set(
        activity.data.map((row) => row.event_id).filter((id): id is string => id !== null)
      ),
    ];
    const references = eventIds.length
      ? await client
          .from('events')
          .select('id')
          .in('id', eventIds)
          .eq('accounting_version', 2)
          .is('deleted_at', null)
      : { data: [], error: null };
    if (references.error) throw references.error;
    const visibleIds = new Set(references.data!.map((event) => event.id));
    return {
      status: 'success',
      summary: {
        monthEvents: events.filter((event) => {
          const start = Temporal.Instant.from(event.startsAtUtc!).toZonedDateTimeISO(
            event.timeZone!
          );
          const current = now.toZonedDateTimeISO(event.timeZone!);
          return start.year === current.year && start.month === current.month;
        }).length,
        totalBookedEvents: events.length,
        upcomingEvents: upcoming.length,
        nextEvent: upcoming[0] ? schedule(upcoming[0]) : null,
      },
      liveEvent:
        live && packageState
          ? {
              ...schedule(live),
              counts: packageState.counts,
              runState: packageState.runState as RunState | null,
            }
          : null,
      activity: activity.data.slice(0, 25).map((row) => ({
        id: row.id,
        eventId: row.event_id && visibleIds.has(row.event_id) ? row.event_id : null,
        operationKind: row.operation_kind,
        occurredAt: row.created_at,
      })),
      hasNextPage: activity.data.length > 25,
    };
  } catch (error) {
    unstable_rethrow(error);
    return { status: 'unavailable', error: 'Unable to load Dashboard. Reload to try again.' };
  }
}
