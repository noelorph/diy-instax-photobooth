import { requireSimulator } from '@/lib/operations/printer-gate';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import { adminOperation, adminArgs, attemptResult } from '@/lib/operations/admin-route';
import { testReservationSchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId: id } = await context.params;
  return adminOperation(request, testReservationSchema, async (input, admin) => {
    requireSimulator();
    const { data, error } = await createPrivilegedClient().rpc('reserve_test_attempt', {
      ...adminArgs(admin, input.operationKey),
      event_id: operationId(id),
      connection_id: input.connectionId,
    });
    if (error) throw error;
    return attemptResult(data);
  });
}
