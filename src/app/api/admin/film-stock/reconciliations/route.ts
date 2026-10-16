import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { adminOperation, adminArgs, stockResult } from '@/lib/operations/admin-route';
import { stockReconciliationSchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request) {
  return adminOperation(request, stockReconciliationSchema, async (input, admin) => {
    const { data, error } = await createPrivilegedClient().rpc('reconcile_film_stock', {
      ...adminArgs(admin, input.operationKey),
      observed_sheets: input.observedSheets,
      reason: input.reason,
    });
    if (error) throw error;
    return stockResult(data);
  });
}
