import { boothOperation, sessionResult } from '@/lib/operations/booth-route';
import { operationSchema, operationId } from '@/lib/operations/validation';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  return boothOperation(request, operationSchema, async (input, booth) => {
    const { data, error } = await createPrivilegedClient().rpc('abandon_guest_session', {
      grant_hash: booth.grantHash,
      session_id: operationId(sessionId),
      operation_key: input.operationKey,
    });
    if (error) throw error;
    return sessionResult(data);
  });
}
