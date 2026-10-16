import { createClient } from '@/lib/supabase/server';
import { requireAdminRequest } from '@/lib/operations/admin-authority';
import {
  cookieOptions,
  deviceCookie,
  hashSecret,
  newSecret,
  readSecret,
} from '@/lib/operations/booth-authority';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationErrorResponse, operationResponse } from '@/lib/operations/responses';
import { OperationError } from '@/lib/operations/types';
import {
  operationId,
  parseOperation,
  prepareHandoffSchema,
  requireSameOrigin,
} from '@/lib/operations/validation';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request),
      eventId = operationId((await context.params).eventId);
    const input = await parseOperation(request, prepareHandoffSchema);
    if (process.env.NODE_ENV === 'production' || process.env.BOOTH_SIMULATOR_ENABLED !== 'true')
      throw new OperationError('state_conflict');
    const device = readSecret(request, deviceCookie) ?? newSecret();
    const { data, error } = await createPrivilegedClient().rpc('prepare_booth_handoff', {
      admin_user_id: admin.userId,
      admin_session_id: admin.sessionId,
      event_id: eventId,
      expected_revision: input.expectedRevision,
      operation_key: input.operationKey,
      connection_id: input.connectionId,
      setup_evidence: {
        device_token_hash: hashSecret(device),
        camera_ready: input.setupEvidence.cameraReady,
        printer_ready: input.setupEvidence.printerReady,
        guided_access_ready: input.setupEvidence.guidedAccessReady,
        printer_mode: 'simulated',
      },
    });
    if (error) {
      if (error.message === 'state_conflict') {
        // Use the caller's live-session RLS again; never attach privileged data.
        const auth = await createClient();
        const { data: current } = await auth
          .from('events')
          .select('state,revision')
          .eq('id', eventId)
          .maybeSingle();
        if (current) return operationErrorResponse(error, current);
      }
      throw error;
    }
    const result = data as {
      event_id: string;
      run_id: string;
      run_state: string;
      revision: number;
      handoff_id: string;
    };
    const response = operationResponse({
      eventId: result.event_id,
      runId: result.run_id,
      state: result.run_state,
      revision: result.revision,
      handoffId: result.handoff_id,
    });
    response.cookies.set(deviceCookie, device, { ...cookieOptions, maxAge: 172800 });
    return response;
  } catch (error) {
    return operationErrorResponse(error);
  }
}
