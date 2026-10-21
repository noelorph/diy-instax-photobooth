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
import { packageOperationSchema, parsePackageOperation } from '@/lib/operations/package-validation';
import { packageRpc } from '@/lib/operations/package-rpc';
import { packageErrorResponse } from '@/lib/operations/package-route';
import { PackageError, HANDOFF_TTL_MS } from '@/lib/operations/package-contract';
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
    const device = readSecret(request, deviceCookie);
    if (!device) throw new OperationError('forbidden');
    const client = createPrivilegedClient();
    const { data: handoff, error: lookupError } = await client
      .from('booth_handoffs')
      .select('admin_user_id,admin_session_id,device_token_hash,state,accounting_version')
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
    if (handoff.accounting_version === 2) {
      try {
        const input = await parsePackageOperation(request, packageOperationSchema);
        const auth = await createClient();
        let signOutFailed = false;
        try {
          signOutFailed = !!(await auth.auth.signOut({ scope: 'local' })).error;
        } catch {
          signOutFailed = true;
        }
        if (signOutFailed) {
          await packageRpc('package_fail_handoff', {
            p_handoff_id: handoffId,
            p_device_hash: hashSecret(device),
          });
          throw new PackageError('access_required');
        }
        const secret = newSecret();
        // SQL verifies the initiating session is gone and the device is bound to this handoff.
        let result: Record<string, unknown>;
        try {
          result = await packageRpc('package_issue_handoff', {
            p_handoff_id: handoffId,
            p_device_hash: hashSecret(device),
            p_operation_id: input.operationId,
            p_grant_hash: hashSecret(secret),
          });
        } catch (error) {
          // No cookie has left this response; revoke any grant the lost reply may have issued.
          await packageRpc('package_fail_handoff', {
            p_handoff_id: handoffId,
            p_device_hash: hashSecret(device),
          });
          throw error;
        }
        if (result.error) throw new PackageError('access_required');
        const response = operationResponse(result);
        response.cookies.set(boothCookie, secret, {
          ...cookieOptions,
          maxAge: HANDOFF_TTL_MS / 1000,
        });
        return response;
      } catch (error) {
        return packageErrorResponse(error);
      }
    }
    const input = await parseOperation(request, operationSchema);
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
