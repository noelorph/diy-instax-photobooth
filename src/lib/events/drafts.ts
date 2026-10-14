import 'server-only';
import { z, ZodError } from 'zod';
import { unstable_rethrow } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import {
  parseDraftEventInput,
  type DraftEventInput,
  type ValidatedDraftEvent,
} from '@/features/admin/events/draft-event.schema';

export type DraftEvent = ValidatedDraftEvent & { id: string; state: 'Draft'; revision: number };
type Unavailable = { status: 'unavailable'; error: string };
export type DraftReadResult =
  { status: 'success'; draft: DraftEvent } | { status: 'not_found' } | Unavailable;
export type DraftFieldErrors = Partial<
  Record<keyof DraftEventInput | 'state' | 'expectedRevision', string>
>;
type InvalidDraft = { status: 'invalid'; fieldErrors: DraftFieldErrors };
export type DraftSaveResult =
  DraftReadResult | InvalidDraft | { status: 'conflict'; error: string };
export type DraftListResult = { status: 'success'; drafts: DraftEvent[] } | Unavailable;

async function recover<T>(operation: () => Promise<T>): Promise<T | Unavailable> {
  try {
    return await operation();
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: 'unavailable',
      error: 'Unable to complete the request. Check your connection and try again.',
    };
  }
}

function validate(input: unknown): { status: 'valid'; values: ValidatedDraftEvent } | InvalidDraft {
  // The shared booking parser intentionally strips unknown keys; reject a
  // submitted lifecycle transition before that parser can discard it.
  if (input && typeof input === 'object' && 'state' in input && input.state !== 'Draft') {
    return { status: 'invalid', fieldErrors: { state: 'Only Draft Events can be saved.' } };
  }
  try {
    return { status: 'valid', values: parseDraftEventInput(input) };
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const fieldErrors: DraftFieldErrors = {};
    for (const issue of error.issues) {
      const field = issue.path[0] as keyof DraftFieldErrors | undefined;
      if (field) fieldErrors[field] ??= issue.message;
    }
    return { status: 'invalid', fieldErrors };
  }
}

// Return only booking fields needed by the Admin list/detail/form.
const columns =
  'id,state,revision,title,clientName:client_name,clientEmail:client_email,clientPhone:client_phone,venueAddress:venue_address,timeZone:time_zone,startsAtUtc:starts_at,endsAtUtc:ends_at,filmPackageCount:film_package_count,originalPrintAllowance:original_print_allowance';

function bookingColumns(input: ValidatedDraftEvent) {
  return {
    title: input.title,
    client_name: input.clientName,
    client_email: input.clientEmail,
    client_phone: input.clientPhone,
    venue_address: input.venueAddress,
    time_zone: input.timeZone,
    starts_at: input.startsAtUtc,
    ends_at: input.endsAtUtc,
    film_package_count: input.filmPackageCount,
    original_print_allowance: input.originalPrintAllowance,
  };
}

export async function listDrafts(): Promise<DraftListResult> {
  return recover(async () => {
    await requireAdmin();
    const client = await createClient();
    const { data, error } = await client
      .from('events')
      .select(columns)
      .eq('state', 'Draft')
      .order('starts_at')
      .order('id')
      .returns<DraftEvent[]>();
    if (error) throw error;
    return { status: 'success' as const, drafts: data };
  });
}

export async function getDraft(id: string): Promise<DraftReadResult> {
  return recover<DraftReadResult>(async () => {
    await requireAdmin();
    if (!z.uuid().safeParse(id).success) return { status: 'not_found' };
    const client = await createClient();
    const { data, error } = await client
      .from('events')
      .select(columns)
      .eq('id', id)
      .eq('state', 'Draft')
      .returns<DraftEvent[]>()
      .maybeSingle();
    if (error) throw error;
    return data ? { status: 'success', draft: data } : { status: 'not_found' };
  });
}

export async function createDraft(input: unknown): Promise<DraftSaveResult> {
  return recover<DraftSaveResult>(async () => {
    await requireAdmin();
    const parsed = validate(input);
    if (parsed.status === 'invalid') return parsed;
    const client = await createClient();
    const { data, error } = await client
      .from('events')
      .insert(bookingColumns(parsed.values))
      .select(columns)
      .returns<DraftEvent[]>()
      .single();
    if (error) throw error;
    return { status: 'success' as const, draft: data };
  });
}

export async function updateDraft(
  id: string,
  expectedRevision: number,
  input: unknown
): Promise<DraftSaveResult> {
  return recover<DraftSaveResult>(async () => {
    await requireAdmin();
    if (!z.uuid().safeParse(id).success) return { status: 'not_found' as const };
    if (
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 1 ||
      expectedRevision >= 2147483647
    ) {
      return {
        status: 'invalid' as const,
        fieldErrors: { expectedRevision: 'Reload this Draft before saving again.' },
      };
    }
    const parsed = validate(input);
    if (parsed.status === 'invalid') return parsed;
    const client = await createClient();
    const { data, error } = await client
      .from('events')
      .update({ ...bookingColumns(parsed.values), revision: expectedRevision + 1 })
      .eq('id', id)
      .eq('state', 'Draft')
      .eq('revision', expectedRevision)
      .select(columns)
      .returns<DraftEvent[]>()
      .maybeSingle();
    if (error) throw error;
    if (data) return { status: 'success' as const, draft: data };
    // Check existence only after the atomic write attempt; never use a prior read
    // to decide that an update is safe. No Client fields are needed here.
    const current = await client.from('events').select('id').eq('id', id).maybeSingle();
    if (current.error) throw current.error;
    return current.data
      ? {
          status: 'conflict' as const,
          error:
            'This Draft changed since you opened it. Reload the latest record before saving again.',
        }
      : { status: 'not_found' as const };
  });
}
