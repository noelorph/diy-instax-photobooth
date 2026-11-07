import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import type { OperationalEvent } from './types';
import { readPackageAdminState } from '@/lib/operations/package-state';
import type { RunState } from '@/lib/operations/package-contract';
export async function getOperationalEvent(
  id: string,
  attemptsPage = 0
): Promise<
  | { status: 'success'; event: OperationalEvent; adminUserId: string }
  | { status: 'not_found' }
  | { status: 'unavailable'; error: string }
> {
  try {
    if (!Number.isSafeInteger(attemptsPage) || attemptsPage < 0 || attemptsPage > 1000000)
      attemptsPage = 0;
    const admin = await requireAdmin();
    const client = await createClient();
    const event = await client
      .from('events')
      .select('id,title,state')
      .eq('id', id)
      .eq('accounting_version', 2)
      .is('deleted_at', null)
      .maybeSingle();
    if (event.error) throw event.error;
    if (!event.data) return { status: 'not_found' };
    const [packageState, attempts, captures] = await Promise.all([
      readPackageAdminState(admin, id),
      client
        .from('print_attempts')
        .select('id,kind,state', { count: 'exact' })
        .eq('event_id', id)
        .eq('accounting_version', 2)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(attemptsPage * 100, attemptsPage * 100 + 99),
      client
        .from('captures')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('accounting_version', 2),
    ]);
    for (const result of [attempts, captures]) if (result.error) throw result.error;
    return {
      status: 'success',
      adminUserId: admin.userId,
      event: {
        id,
        title: event.data.title!,
        state: event.data.state,
        revision: packageState.revision,
        counts: packageState.counts,
        captures: captures.count!,
        attemptsPage,
        hasOlderAttempts: (attemptsPage + 1) * 100 < attempts.count!,
        runId: packageState.runId,
        runState: packageState.runState as RunState | null,
        resumeAllowed: packageState.allowedActions?.resume === true,
        possibleDelivery: packageState.possibleDelivery,
        blockers: packageState.blockers,
        equipment: packageState.equipment,
        attempts: attempts.data!,
      },
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: 'unavailable',
      error: 'Unable to load Event operations. Reload to try again.',
    };
  }
}
export async function listLiveEvents() {
  await requireAdmin();
  const client = await createClient();
  const result = await client
    .from('events')
    .select(
      'id,title,venueAddress:venue_address,timeZone:time_zone,startsAtUtc:starts_at,endsAtUtc:ends_at,filmPackageCount:film_package_count,additional_film_package_entries(packages)'
    )
    .eq('state', 'Live')
    .eq('accounting_version', 2)
    .is('deleted_at', null);
  return result.error
    ? { status: 'unavailable' as const }
    : {
        status: 'success' as const,
        events: result.data.map(({ additional_film_package_entries, ...event }) => ({
          ...event,
          title: event.title!,
          venueAddress: event.venueAddress!,
          timeZone: event.timeZone!,
          startsAtUtc: event.startsAtUtc!,
          endsAtUtc: event.endsAtUtc!,
          filmPackageCount:
            event.filmPackageCount! +
            additional_film_package_entries.reduce((total, entry) => total + entry.packages, 0),
          state: 'Live' as const,
        })),
      };
}
