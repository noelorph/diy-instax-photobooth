import { createClient } from '@/lib/supabase/server';
import { requireAdminRequest } from '@/lib/operations/admin-authority';
import {
  boothCookie,
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
  operationSchema,
  parseOperation,
  requireSameOrigin,
} from '@/lib/operations/validation';
export async function POST(request: Request, context: { params: Promise<{ handoffId: string }> }) {
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request),
      handoffId = operationId((await context.params).handoffId);
    const input = await parseOperation(request, operationSchema),
      device = readSecret(request, deviceCookie);
    if (!device) throw new OperationError('forbidden');
    const client = createPrivilegedClient();
    const { data: handoff, error: lookupError } = await client
      .from('booth_handoffs')
      .select('admin_user_id,admin_session_id,device_token_hash,state')
      .eq('id', handoffId)
      .maybeSingle();
    if (
      lookupError ||
      !handoff ||
      handoff.admin_user_id !== admin.userId ||
      handoff.admin_session_id !== admin.sessionId ||
      handoff.device_token_hash !== hashSecret(device) ||
      handoff.state !== 'Prepared'
    )
      throw new OperationError('forbidden');
    const auth = await createClient();
    const signedOut = await auth.auth.signOut({ scope: 'local' });
    const secret = newSecret(),
      expiresAt = new Date(Date.now() + 8 * 3600000);
    // This transaction independently checks that the initiating Auth session is gone.
    // A failed local sign-out with a live session durably pauses the handoff.
    const { data, error } = await client.rpc('finish_booth_handoff', {
      handoff_id: handoffId,
      device_token_hash: hashSecret(device),
      operation_key: input.operationKey,
      grant_hash: hashSecret(secret),
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw error;
    const result = data as { run_state: string; revision: number; error?: string };
    if (signedOut.error || result.error)
      return operationErrorResponse(
        { message: result.error ?? 'state_conflict' },
        { state: result.run_state, revision: result.revision }
      );
    const response = operationResponse({
      state: result.run_state,
      revision: result.revision,
      handoffId,
    });
    response.cookies.set(boothCookie, secret, { ...cookieOptions, expires: expiresAt });
    return response;
  } catch (error) {
    return operationErrorResponse(error);
  }
}
