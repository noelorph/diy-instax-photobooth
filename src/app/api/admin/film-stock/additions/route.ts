import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { adminOperation, adminArgs } from '@/lib/operations/admin-route';
import { stockAdditionSchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request) {
  return adminOperation(request, stockAdditionSchema, async (input, admin) => {
    const { data, error } = await createPrivilegedClient().rpc('add_film_stock', {
      ...adminArgs(admin, input.operationKey),
      sheets: input.sheets,
      reason: input.reason,
    });
    if (error) throw error;
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
  });
}
