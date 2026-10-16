import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import { adminOperation, adminArgs, attemptResult } from '@/lib/operations/admin-route';
import { wastedFilmSchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId: id } = await context.params;
  return adminOperation(request, wastedFilmSchema, async (input, admin) => {
    const { data, error } = await createPrivilegedClient().rpc('mark_wasted_film', {
      ...adminArgs(admin, input.operationKey),
      attempt_id: operationId(id),
      reason: input.reason,
    });
    if (error) throw error;
    return attemptResult(data);
  });
}
