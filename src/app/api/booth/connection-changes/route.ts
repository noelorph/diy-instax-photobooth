import { boothOperation } from '@/lib/operations/booth-route';
import { availability } from '@/lib/operations/admin-route';
import { clearBoothCookie } from '@/lib/operations/booth-authority';
import { operationSchema } from '@/lib/operations/validation';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
export async function POST(request: Request) {
  const response = await boothOperation(request, operationSchema, async (input, booth) => {
    const { data, error } = await createPrivilegedClient().rpc('pause_booth_for_reconnect', {
      grant_hash: booth.grantHash,
      run_id: booth.runId,
      operation_key: input.operationKey,
    });
    if (error) throw error;
    const value = data as {
      run_id: string;
      state: string;
      attempt_id: string | null;
      attempt_state: string | null;
      revision: number;
      availability: Parameters<typeof availability>[0];
    };
    return {
      runId: value.run_id,
      state: value.state,
      attemptId: value.attempt_id,
      attemptState: value.attempt_state,
      revision: value.revision,
      availability: availability(value.availability),
    };
  });
  return response.ok ? clearBoothCookie(response) : response;
}
