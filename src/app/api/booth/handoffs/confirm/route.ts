import { clearBoothCookie, grantHash } from '@/lib/operations/booth-authority';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationErrorResponse, operationResponse } from '@/lib/operations/responses';
import {
  confirmHandoffSchema,
  parseOperation,
  requireSameOrigin,
} from '@/lib/operations/validation';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const hash = grantHash(request),
      input = await parseOperation(request, confirmHandoffSchema);
    const { data, error } = await createPrivilegedClient().rpc('confirm_booth_handoff', {
      handoff_id: input.handoffId,
      grant_hash: hash,
      operation_key: input.operationKey,
    });
    if (error) throw error;
    const result = data as {
      run_state: string;
      revision: number;
      run_id: string;
      event_id: string;
      error?: string;
    };
    if (result.error) throw { message: result.error };
    return operationResponse({
      state: result.run_state,
      revision: result.revision,
      runId: result.run_id,
      eventId: result.event_id,
    });
  } catch (error) {
    return clearBoothCookie(operationErrorResponse(error));
  }
}
