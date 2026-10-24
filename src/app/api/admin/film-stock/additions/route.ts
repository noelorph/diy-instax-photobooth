import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { adminOperation, adminArgs, stockResult } from '@/lib/operations/admin-route';
import { stockAdditionSchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request) {
  return adminOperation(request, stockAdditionSchema, async (input, admin) => {
    const { data, error } = await createPrivilegedClient().rpc('add_film_stock', {
      ...adminArgs(admin, input.operationKey),
      sheets: input.sheets,
      reason: input.reason,
    });
    if (error) throw error;
    return stockResult(data);
  });
}
