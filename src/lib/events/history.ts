import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';

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
  original_print_allowance: number;
  redacted_at: string | null;
  media_removal_state: 'none' | 'pending' | 'complete';
};
export type PendingMediaRemoval = {
  eventId: string;
  revision: number;
  action: 'delete_draft' | 'redact_client';
};
async function read<T>(operation: () => Promise<T>): Promise<T | Unavailable> {
  try {
    await requireAdmin();
    return await operation();
  } catch (error) {
    unstable_rethrow(error);
    return { status: 'unavailable', error: 'Unable to load Events. Try again.' };
  }
}
export async function listHistory() {
  return read(async () => {
    const client = await createClient();
    const { data, error } = await client
      .from('events')
      .select(
        'id,state,revision,title,client_name,client_email,client_phone,venue_address,time_zone,starts_at,ends_at,film_package_count,original_print_allowance,redacted_at,media_removal_state'
      )
      .in('state', ['Completed', 'Cancelled'])
      .is('deleted_at', null)
      .order('starts_at', { ascending: false })
      .order('id')
      .returns<HistoryEvent[]>();
    if (error) throw error;
    return { status: 'success' as const, events: data };
  });
}
export async function listPendingMediaRemovals() {
  return read(async () => {
    // Tombstones are intentionally invisible to Event RLS. After active Admin
    // authorization, expose only opaque cleanup work, never deleted bookings.
    const { data, error } = await createPrivilegedClient()
      .from('events')
      .select('id,revision,deleted_at')
      .eq('media_removal_state', 'pending')
      .order('id');
    if (error) throw error;
    const removals: PendingMediaRemoval[] = data.map((row) => ({
      eventId: row.id,
      revision: row.revision,
      action: row.deleted_at ? 'delete_draft' : 'redact_client',
    }));
    return { status: 'success' as const, removals };
  });
}
