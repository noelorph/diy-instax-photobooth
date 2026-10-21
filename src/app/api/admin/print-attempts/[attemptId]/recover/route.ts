import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import { adminOperation, adminArgs, attemptResult } from '@/lib/operations/admin-route';
import { recoverySchema } from '@/lib/operations/admin-validation';
import { isPackageAttempt } from '@/lib/operations/package-version';
import { packageErrorResponse, runPackageAdminOperation } from '@/lib/operations/package-route';
import { packageActionSchemas } from '@/lib/operations/package-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  try {
    if (await isPackageAttempt(request, attemptId))
      return runPackageAdminOperation(
        request,
        attemptId,
        'recover_attempt',
        packageActionSchemas.recoverAttempt,
        'attempt'
      );
    return adminOperation(request, recoverySchema, async (input, admin) => {
      const { data, error } = await createPrivilegedClient().rpc('recover_interrupted_print', {
        ...adminArgs(admin, input.operationKey),
        attempt_id: operationId(attemptId),
        reason: input.reason,
      });
      if (error) throw error;
      return attemptResult(data);
    });
  } catch (error) {
    return packageErrorResponse(error);
  }
}
