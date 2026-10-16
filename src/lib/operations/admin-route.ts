import 'server-only';
import type { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { requireAdminRequest } from './admin-authority';
import { createPrivilegedClient } from './privileged-client';
import { operationErrorResponse, operationResponse } from './responses';
import type { AdminAuthority } from './types';
import { parseOperation, requireSameOrigin } from './validation';

export async function adminOperation<T>(
  request: Request,
  schema: z.ZodType<T>,
  run: (input: T, admin: AdminAuthority) => Promise<unknown>,
  eventId?: string
) {
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const input = await parseOperation(request, schema);
    return operationResponse(await run(input, admin));
  } catch (error) {
    if (
      eventId &&
      error &&
      typeof error === 'object' &&
      'message' in error &&
      error.message === 'state_conflict'
    ) {
      // A privileged mutation failure must never become a privileged read leak.
      const client = await createClient();
      const { data: current } = await client
        .from('events')
        .select('state,revision')
        .eq('id', eventId)
        .maybeSingle();
      if (current) return operationErrorResponse(error, current);
    }
    return operationErrorResponse(error);
  }
}
export function adminArgs(admin: AdminAuthority, operationKey: string) {
  return {
    admin_user_id: admin.userId,
    admin_session_id: admin.sessionId,
    operation_key: operationKey,
  };
}
type Availability = { remaining_allowance: number; available_stock: number; printer_busy: boolean };
export function availability(value: Availability) {
  return {
    guestPrints: value.remaining_allowance,
    filmSheets: value.available_stock,
    printerBusy: value.printer_busy,
  };
}
export function attemptResult(data: Json) {
  const value = data as {
    attempt_id: string;
    state: string;
    diagnostic?: boolean;
    allowance_hold: number;
    film_hold: number;
    availability: Availability;
    on_hand?: number;
    revision?: number;
    connection_id?: string;
  };
  return {
    attemptId: value.attempt_id,
    state: value.state,
    ...(value.connection_id ? { connectionId: value.connection_id } : {}),
    ...(value.diagnostic !== undefined ? { diagnostic: value.diagnostic } : {}),
    allowanceHold: value.allowance_hold,
    filmHold: value.film_hold,
    availability: availability(value.availability),
    ...(value.on_hand !== undefined ? { onHand: value.on_hand } : {}),
    ...(value.revision !== undefined ? { revision: value.revision } : {}),
  };
}
export async function resolutionEntries(attemptId: string, outcome: 'ejected' | 'unused') {
  const client = createPrivilegedClient();
  const journal = await client
    .from('print_attempt_events')
    .select('id')
    .eq('attempt_id', attemptId)
    .eq('state', outcome === 'ejected' ? 'AdminResolvedEjected' : 'AdminResolvedUnused')
    .single();
  if (journal.error) throw journal.error;
  if (outcome === 'unused') return { journalEntryId: journal.data.id, stockEntryId: null };
  const stock = await client
    .from('film_stock_entries')
    .select('id')
    .eq('attempt_id', attemptId)
    .eq('kind', 'Consumption')
    .single();
  if (stock.error) throw stock.error;
  return { journalEntryId: journal.data.id, stockEntryId: stock.data.id };
}

export function stockResult(data: Json) {
  const r = data as {
    entry_id: string;
    previous_on_hand: number;
    signed_sheets: number;
    on_hand: number;
    available_stock: number;
  };
  return {
    entryId: r.entry_id,
    previousOnHand: r.previous_on_hand,
    signedSheets: r.signed_sheets,
    onHand: r.on_hand,
    availability: { filmSheets: r.available_stock },
  };
}
