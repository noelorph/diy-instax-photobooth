import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import {
  adminOperation,
  adminArgs,
  attemptResult,
  resolutionEntries,
} from '@/lib/operations/admin-route';
import { resolutionSchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId: id } = await context.params;
  return adminOperation(request, resolutionSchema, async (input, admin) => {
    const { data, error } = await createPrivilegedClient().rpc('resolve_uncertain_print', {
      ...adminArgs(admin, input.operationKey),
      attempt_id: operationId(id),
      outcome: input.outcome,
      inspection_reason: input.inspectionReason,
    });
    if (error) throw error;
    return { ...attemptResult(data), ...(await resolutionEntries(id, input.outcome)) };
  });
}
