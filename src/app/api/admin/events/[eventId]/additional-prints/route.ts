import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import { adminOperation, adminArgs } from '@/lib/operations/admin-route';
import { additionalPrintsSchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId: id } = await context.params;
  return adminOperation(request, additionalPrintsSchema, async (input, admin) => {
    const { data, error } = await createPrivilegedClient().rpc('add_event_prints', {
      ...adminArgs(admin, input.operationKey),
      event_id: operationId(id),
      quantity: input.quantity,
    });
    if (error) throw error;
    const r = data as {
      entry_id: string;
      original_print_allowance: number;
      additional_prints: number;
      confirmed_prints: number;
      reserved_prints: number;
      remaining_allowance: number;
    };
    return {
      entryId: r.entry_id,
      originalPrintAllowance: r.original_print_allowance,
      additionalPrints: r.additional_prints,
      confirmedPrints: r.confirmed_prints,
      reservedPrints: r.reserved_prints,
      availability: { guestPrints: r.remaining_allowance },
    };
  });
}
