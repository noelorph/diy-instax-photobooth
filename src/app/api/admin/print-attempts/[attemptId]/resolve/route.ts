import { requireSimulator } from '@/lib/operations/printer-gate';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import {
  adminOperation,
  adminArgs,
  attemptResult,
  resolutionEntries,
} from '@/lib/operations/admin-route';
import { resolutionSchema } from '@/lib/operations/admin-validation';
import { isPackageAttempt } from '@/lib/operations/package-version';
import {
  packageVersionErrorResponse,
  runPackageAdminOperation,
} from '@/lib/operations/package-route';
import { packageActionSchemas } from '@/lib/operations/package-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId: id } = await context.params;
  try {
    if (await isPackageAttempt(request, id))
      return runPackageAdminOperation(
        request,
        id,
        'resolve_attempt',
        packageActionSchemas.resolveAttempt,
        'attempt'
      );
    return adminOperation(request, resolutionSchema, async (input, admin) => {
      if (input.outcome === 'ejected') requireSimulator('invalid_evidence');
      const { data, error } = await createPrivilegedClient().rpc('resolve_uncertain_print', {
        ...adminArgs(admin, input.operationKey),
        attempt_id: operationId(id),
        outcome: input.outcome,
        inspection_reason: input.inspectionReason,
      });
      if (error) throw error;
      return { ...attemptResult(data), ...(await resolutionEntries(id, input.outcome)) };
    });
  } catch (error) {
    return packageVersionErrorResponse(error, 'attempt', id);
  }
}
