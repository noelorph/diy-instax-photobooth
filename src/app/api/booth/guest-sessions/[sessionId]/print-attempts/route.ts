import { boothOperation } from '@/lib/operations/booth-route';
import { attemptResult } from '@/lib/operations/admin-route';
import { guestReservationSchema } from '@/lib/operations/booth-validation';
import { operationId } from '@/lib/operations/validation';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { OperationError } from '@/lib/operations/types';
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  return boothOperation(request, guestReservationSchema, async (input, booth) => {
    if (input.runId !== booth.runId) throw new OperationError('forbidden');
    const { data, error } = await createPrivilegedClient().rpc('reserve_guest_attempt', {
      grant_hash: booth.grantHash,
      run_id: booth.runId,
      session_id: operationId(sessionId),
      capture_id: input.captureId,
      operation_key: input.operationKey,
    });
    if (error) throw error;
    return attemptResult(data);
  });
}
