import { boothOperation } from '@/lib/operations/booth-route';
import { captureSchema } from '@/lib/operations/booth-validation';
import { operationId } from '@/lib/operations/validation';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  return boothOperation(request, captureSchema, async (input, booth) => {
    const { data, error } = await createPrivilegedClient().rpc('record_capture', {
      grant_hash: booth.grantHash,
      session_id: operationId(sessionId),
      operation_key: input.operationKey,
      captured_at: input.capturedAt,
    });
    if (error) throw error;
    const value = data as { session_id: string; capture_id: string; capture_count: number };
    return {
      sessionId: value.session_id,
      captureId: value.capture_id,
      captureCount: value.capture_count,
    };
  });
}
