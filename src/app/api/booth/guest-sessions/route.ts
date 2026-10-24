import { boothOperation, sessionResult } from '@/lib/operations/booth-route';
import { openSessionSchema } from '@/lib/operations/booth-validation';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { OperationError } from '@/lib/operations/types';
export async function POST(request: Request) {
  return boothOperation(request, openSessionSchema, async (input, booth) => {
    if (input.runId !== booth.runId) throw new OperationError('forbidden');
    const { data, error } = await createPrivilegedClient().rpc('open_guest_session', {
      grant_hash: booth.grantHash,
      run_id: booth.runId,
      operation_key: input.operationKey,
    });
    if (error) throw error;
    return sessionResult(data);
  });
}
