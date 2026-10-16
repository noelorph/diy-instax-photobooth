import { clearBoothCookie, requireBoothRequest } from '@/lib/operations/booth-authority';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationErrorResponse, operationResponse } from '@/lib/operations/responses';
import { OperationError } from '@/lib/operations/types';
async function additionalPrints(
  client: ReturnType<typeof createPrivilegedClient>,
  eventId: string
) {
  let total = 0,
    offset = 0;
  for (;;) {
    const { data, error } = await client
      .from('additional_print_entries')
      .select('quantity')
      .eq('event_id', eventId)
      .order('id')
      .range(offset, offset + 999);
    if (error) throw error;
    total += data.reduce((sum, row) => sum + row.quantity, 0);
    if (data.length < 1000) return total;
    offset += data.length;
  }
}
export async function GET(request: Request) {
  try {
    const authority = await requireBoothRequest(request),
      client = createPrivilegedClient();
    const [event, additions, attempts, stock, pending] = await Promise.all([
      client
        .from('events')
        .select('title,revision,original_print_allowance')
        .eq('id', authority.eventId)
        .single(),
      additionalPrints(client, authority.eventId),
      client
        .from('print_attempts')
        .select('id,waste:print_attempt_events()', { count: 'exact', head: true })
        .eq('waste.state', 'WastedFilm')
        .is('waste', null)
        .eq('event_id', authority.eventId)
        .eq('kind', 'Guest')
        .in('state', ['Reserved', 'Accepted', 'Uncertain', 'Confirmed', 'AdminResolvedEjected']),
      client.from('film_stock_balance').select('on_hand').single(),
      client
        .from('print_attempts')
        .select('id', { count: 'exact', head: true })
        .in('state', ['Reserved', 'Accepted', 'Uncertain']),
    ]);
    if (event.error || attempts.error || stock.error || pending.error)
      throw new OperationError('state_conflict');
    const guestPrints = event.data.original_print_allowance! + additions - (attempts.count ?? 0);
    // Recheck after data reads so a completed pause cannot leak display data.
    await requireBoothRequest(request);
    return operationResponse({
      eventId: authority.eventId,
      runId: authority.runId,
      state: 'Active',
      revision: event.data.revision,
      display: { title: event.data.title },
      availability: {
        guestPrints: Math.max(0, guestPrints),
        filmSheets: Math.max(0, stock.data.on_hand - (pending.count ?? 0)),
        printerBusy: (pending.count ?? 0) > 0,
      },
    });
  } catch (error) {
    return clearBoothCookie(operationErrorResponse(error));
  }
}
