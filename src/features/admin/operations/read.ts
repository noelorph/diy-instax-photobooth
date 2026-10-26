import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import type { OperationalEvent } from './types';
const unresolved = ['Reserved', 'Accepted', 'Uncertain'];
export async function getOperationalEvent(
  id: string,
  attemptsPage = 0
): Promise<
  | { status: 'success'; event: OperationalEvent }
  | { status: 'not_found' }
  | { status: 'unavailable'; error: string }
> {
  try {
    if (!Number.isSafeInteger(attemptsPage) || attemptsPage < 0 || attemptsPage > 1000000)
      attemptsPage = 0;
    await requireAdmin();
    const client = await createClient();
    const event = await client
      .from('events')
      .select('id,title,state,revision,original_print_allowance')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (event.error) throw event.error;
    if (!event.data) return { status: 'not_found' };
    const [attempts, run, stock, holds, allowance, captures, eventHolds] = await Promise.all([
      client
        .from('print_attempts')
        .select('id,kind,state,connection_id,test_output_usable', { count: 'exact' })
        .eq('event_id', id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(attemptsPage * 100, attemptsPage * 100 + 99),
      client
        .from('booth_runs')
        .select('state,connection_id')
        .eq('event_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client.from('film_stock_balance').select('on_hand').single(),
      client
        .from('print_attempts')
        .select('id', { count: 'exact', head: true })
        .in('state', unresolved),
      client
        .from('print_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('kind', 'Guest')
        .in('state', unresolved),
      client.from('captures').select('id', { count: 'exact', head: true }).eq('event_id', id),
      client
        .from('print_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .in('state', unresolved),
    ]);
    for (const result of [attempts, run, stock, holds, allowance, captures, eventHolds])
      if (result.error) throw result.error;
    const usableTestConnectionIds = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const evidence = await client
        .from('print_attempts')
        .select('connection_id,print_attempt_events(state)')
        .eq('print_attempt_events.state', 'WastedFilm')
        .eq('event_id', id)
        .eq('kind', 'Test')
        .eq('test_output_usable', true)
        .in('state', ['Confirmed', 'AdminResolvedEjected'])
        .order('id')
        .range(offset, offset + 999);
      if (evidence.error) throw evidence.error;
      for (const row of evidence.data)
        if (row.print_attempt_events.length === 0) usableTestConnectionIds.add(row.connection_id);
      if (evidence.data.length < 1000) break;
    }
    let confirmedPrints = 0;
    // Historical corrections can retain the ejected current state. The journal
    // remains authoritative for whether Guest allowance is still consumed.
    for (let offset = 0; ; offset += 1000) {
      const confirmed = await client
        .from('print_attempts')
        .select('id,print_attempt_events(state)')
        .eq('event_id', id)
        .eq('kind', 'Guest')
        .in('state', ['Confirmed', 'AdminResolvedEjected'])
        .eq('print_attempt_events.state', 'WastedFilm')
        .order('id')
        .range(offset, offset + 999);
      if (confirmed.error) throw confirmed.error;
      confirmedPrints += confirmed.data.filter(
        (row) => row.print_attempt_events.length === 0
      ).length;
      if (confirmed.data.length < 1000) break;
    }
    let additionalPrints = 0;
    for (let offset = 0; ; offset += 1000) {
      const entries = await client
        .from('additional_print_entries')
        .select('quantity')
        .eq('event_id', id)
        .order('id')
        .range(offset, offset + 999);
      if (entries.error) throw entries.error;
      additionalPrints += entries.data.reduce((sum, row) => sum + row.quantity, 0);
      if (entries.data.length < 1000) break;
    }
    return {
      status: 'success',
      event: {
        id,
        title: event.data.title!,
        state: event.data.state,
        revision: event.data.revision,
        originalAllowance: event.data.original_print_allowance,
        additionalPrints,
        confirmedPrints,
        captures: captures.count!,
        allowanceReserved: allowance.count!,
        stockReserved: holds.count!,
        eventUnresolved: eventHolds.count!,
        attemptsPage,
        hasOlderAttempts: (attemptsPage + 1) * 100 < attempts.count!,
        usableTestConnectionIds: [...usableTestConnectionIds],
        onHand: stock.data!.on_hand,
        runState: run.data?.state ?? null,
        connectionId: run.data?.connection_id ?? null,
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
export async function getHistorySummary() {
  try {
    await requireAdmin();
    const client = await createClient();
    const [events, captures] = await Promise.all([
      client
        .from('events')
        .select('id', { count: 'exact', head: true })
        .neq('state', 'Cancelled')
        .is('deleted_at', null),
      client
        .from('captures')
        .select('id,events!inner(id)', { count: 'exact', head: true })
        .is('events.deleted_at', null),
    ]);
    if (events.error || captures.error) throw events.error ?? captures.error;
    return { status: 'success' as const, events: events.count!, captures: captures.count! };
  } catch (error) {
    unstable_rethrow(error);
    return { status: 'unavailable' as const, error: 'Unable to load History totals.' };
  }
}
