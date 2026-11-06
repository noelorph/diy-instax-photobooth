import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';

import { readPackageAdminState } from '@/lib/operations/package-state';
import type { PackageCounts } from '@/lib/operations/package-contract';
import type { ActivityItem } from '@/features/admin/dashboard/types';

export type HistoryFilter = 'all' | 'Completed' | 'Cancelled';
type Unavailable = { status: 'unavailable'; error: string };
export type HistoryEvent = {
  id: string;
  state: 'Completed' | 'Cancelled';
  revision: number;
  title: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  venue_address: string;
  time_zone: string;
  starts_at: string;
  ends_at: string;
  film_package_count: number;
  counts: PackageCounts;
};
export type PendingMediaRemoval = {
  eventId: string;
  revision: number;
  operationId: string;
};
async function read<T>(
  operation: (admin: Awaited<ReturnType<typeof requireAdmin>>) => Promise<T>
): Promise<T | Unavailable> {
  try {
    return await operation(await requireAdmin());
  } catch (error) {
    unstable_rethrow(error);
    return { status: 'unavailable', error: 'Unable to load Events. Try again.' };
  }
}
const bookingFields =
  'id,state,revision,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count';
export async function listHistory(filter: HistoryFilter = 'all') {
  return read(async (admin) => {
    const client = await createClient();
    const events: HistoryEvent[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from('events')
        .select(bookingFields)
        .eq('accounting_version', 2)
        .in(
          'state',
          filter === 'Completed' || filter === 'Cancelled' ? [filter] : ['Completed', 'Cancelled']
        )
        .is('deleted_at', null)
        .order('starts_at', { ascending: false })
        .order('id')
        .range(offset, offset + 499)
        .returns<Omit<HistoryEvent, 'counts'>[]>();
      if (error) throw error;
      events.push(
        ...(await Promise.all(
          data.map(async (event) => ({
            ...event,
            counts: (await readPackageAdminState(admin, event.id)).counts,
          }))
        ))
      );
      if (data.length < 500) break;
    }
    return { status: 'success' as const, events };
  });
}
export async function getHistoryEvent(
  id: string,
  activityPage = 0
): Promise<
  | {
      status: 'success';
      event: HistoryEvent;
      captures: number;
      activity: ActivityItem[];
      hasNextPage: boolean;
      mediaAssetCount: number;
    }
  | { status: 'not_found' }
  | Unavailable
> {
  return read(async (admin) => {
    if (!Number.isSafeInteger(activityPage) || activityPage < 0 || activityPage > 1000000)
      activityPage = 0;
    const client = await createClient();
    const booking = await client
      .from('events')
      .select(bookingFields)
      .eq('id', id)
      .eq('accounting_version', 2)
      .in('state', ['Completed', 'Cancelled'])
      .is('deleted_at', null)
      .returns<Omit<HistoryEvent, 'counts'>[]>()
      .maybeSingle();
    if (booking.error) throw booking.error;
    if (!booking.data) return { status: 'not_found' as const };
    const [state, captures, activity, media] = await Promise.all([
      readPackageAdminState(admin, id),
      client
        .from('captures')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('accounting_version', 2),
      client
        .from('activity_events')
        .select('id,event_id,operation_kind,created_at')
        .eq('event_id', id)
        .eq('accounting_version', 2)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(activityPage * 25, activityPage * 25 + 25),
      client
        .from('event_media_assets')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('state', 'attached'),
    ]);
    for (const result of [captures, activity, media]) if (result.error) throw result.error;
    return {
      status: 'success' as const,
      event: { ...booking.data, counts: state.counts },
      captures: captures.count!,
      activity: activity.data!.slice(0, 25).map((row) => ({
        id: row.id,
        eventId: id,
        operationKind: row.operation_kind,
        occurredAt: row.created_at,
      })),
      hasNextPage: activity.data!.length > 25,
      mediaAssetCount: media.count!,
    };
  });
}
export async function listPendingMediaRemovals() {
  return read(async (admin) => {
    // Tombstones are intentionally invisible to Event RLS. After active Admin
    // authorization, expose only opaque cleanup work, never deleted bookings.
    const { data, error } = await createPrivilegedClient()
      .from('events')
      .select('id,operation_receipts!inner(operation_key,committed_revision)')
      .eq('accounting_version', 2)
      .eq('state', 'Draft')
      .not('deleted_at', 'is', null)
      .eq('media_removal_state', 'pending')
      .eq('operation_receipts.operation_kind', 'begin_delete_draft')
      .eq('operation_receipts.actor_scope', `admin:${admin.userId}`)
      .order('id');
    if (error) throw error;
    const removals: PendingMediaRemoval[] = data.map((row) => ({
      eventId: row.id,
      revision: row.operation_receipts[0].committed_revision! - 1,
      operationId: row.operation_receipts[0].operation_key,
    }));
    return { status: 'success' as const, removals };
  });
}
