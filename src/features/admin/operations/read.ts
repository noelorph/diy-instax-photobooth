import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import type { OperationalEvent } from './types';
const unresolved = ['Reserved', 'Accepted', 'Uncertain'];
export async function getOperationalEvent(
  id: string
): Promise<
  | { status: 'success'; event: OperationalEvent }
  | { status: 'not_found' }
  | { status: 'unavailable'; error: string }
> {
  try {
    await requireAdmin();
    const client = await createClient();
    const event = await client
      .from('events')
      .select('id,title,state,revision,original_print_allowance,redacted_at,media_removal_state')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (event.error) throw event.error;
    if (!event.data) return { status: 'not_found' };
    const [attempts, run, stock, holds, allowance, confirmed, captures] = await Promise.all([
      client
        .from('print_attempts')
        .select('id,kind,state,connection_id,test_output_usable')
        .eq('event_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
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
      client
        .from('print_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('kind', 'Guest')
        .in('state', ['Confirmed', 'AdminResolvedEjected']),
      client.from('captures').select('id', { count: 'exact', head: true }).eq('event_id', id),
    ]);
    for (const result of [attempts, run, stock, holds, allowance, confirmed, captures])
      if (result.error) throw result.error;
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
        confirmedPrints: confirmed.count!,
        captures: captures.count!,
        allowanceReserved: allowance.count!,
        stockReserved: holds.count!,
        onHand: stock.data!.on_hand,
        runState: run.data?.state ?? null,
        connectionId: run.data?.connection_id ?? null,
        attempts: attempts.data!,
        redacted: !!event.data.redacted_at,
        mediaRemovalState: event.data.media_removal_state,
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
    .select('id,title')
    .eq('state', 'Live')
    .is('deleted_at', null);
  return result.error
    ? { status: 'unavailable' as const }
    : { status: 'success' as const, events: result.data };
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
