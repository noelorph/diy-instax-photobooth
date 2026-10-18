import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import { adminOperation, adminArgs, attemptResult } from '@/lib/operations/admin-route';
import { recoverySchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  return adminOperation(request, recoverySchema, async (input, admin) => {
    const { data, error } = await createPrivilegedClient().rpc('recover_interrupted_print', {
      ...adminArgs(admin, input.operationKey),
      attempt_id: operationId(attemptId),
      reason: input.reason,
    });
    if (error) throw error;
    return attemptResult(data);
  });
}
