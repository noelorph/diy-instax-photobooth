import { boothErrorResponse, captureGrantHash } from '@/lib/operations/booth-authority';
import { operationResponse } from '@/lib/operations/responses';
import { captureSchema } from '@/lib/operations/booth-validation';
import { operationId, parseOperation, requireSameOrigin } from '@/lib/operations/validation';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    requireSameOrigin(request);
    const hash = await captureGrantHash(request);
    const input = await parseOperation(request, captureSchema);
    const { sessionId } = await context.params;
    const { data, error } = await createPrivilegedClient().rpc('record_capture', {
      grant_hash: hash,
      session_id: operationId(sessionId),
      operation_key: input.operationKey,
      captured_at: input.capturedAt,
    });
    if (error) throw error;
    const value = data as {
      session_id: string;
      capture_id: string;
      capture_count: number;
      session_state?: 'Abandoned';
    };
    return operationResponse({
      sessionId: value.session_id,
      captureId: value.capture_id,
      captureCount: value.capture_count,
      ...(value.session_state ? { sessionState: value.session_state } : {}),
    });
  } catch (error) {
    return boothErrorResponse(error);
  }
}
