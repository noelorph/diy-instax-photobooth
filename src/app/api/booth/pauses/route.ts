import { boothReturnCookie } from '@/features/admin/auth/booth-return';
import { cookieOptions } from '@/lib/operations/booth-authority';
import {
  boothErrorResponse,
  clearBoothCookie,
  requireBoothGrant,
} from '@/lib/operations/booth-authority';
import { requireSimulator } from '@/lib/operations/printer-gate';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationSchema, parseOperation, requireSameOrigin } from '@/lib/operations/validation';
import { operationResponse } from '@/lib/operations/responses';
import { OperationError } from '@/lib/operations/types';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const booth = await requireBoothGrant(request);
    requireSimulator();
    if (booth.state !== 'Active') throw new OperationError('forbidden');
    const input = await parseOperation(request, operationSchema);
    const { data, error } = await createPrivilegedClient().rpc('request_booth_pause', {
      grant_hash: booth.grantHash,
      run_id: booth.runId,
      operation_key: input.operationKey,
    });
    if (error) throw error;
    const value = data as { run_id: string; state: string; revision: number };
    const response = operationResponse({
      runId: value.run_id,
      state: value.state,
      revision: value.revision,
    });
    response.cookies.set(boothReturnCookie, booth.eventId, { ...cookieOptions, maxAge: 172800 });
    return value.state === 'Paused' ? clearBoothCookie(response) : response;
  } catch (error) {
    return boothErrorResponse(error);
  }
}
