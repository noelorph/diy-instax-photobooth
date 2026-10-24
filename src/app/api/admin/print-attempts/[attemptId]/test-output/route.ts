import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import { adminOperation, adminArgs } from '@/lib/operations/admin-route';
import { testOutputSchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId: id } = await context.params;
  return adminOperation(request, testOutputSchema, async (input, admin) => {
    const { data, error } = await createPrivilegedClient().rpc('confirm_test_output', {
      ...adminArgs(admin, input.operationKey),
      attempt_id: operationId(id),
      usable: input.usable,
    });
    if (error) throw error;
    const r = data as { attempt_id: string; state: string; connection_id: string; usable: boolean };
    return {
      attemptId: r.attempt_id,
      state: r.state,
      connectionId: r.connection_id,
      usable: r.usable,
    };
  });
}
