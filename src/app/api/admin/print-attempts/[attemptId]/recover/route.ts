import { runPackageAdminOperation } from '@/lib/operations/package-route';
import { packageActionSchemas } from '@/lib/operations/package-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  return runPackageAdminOperation(
    request,
    attemptId,
    'recover_attempt',
    packageActionSchemas.recoverAttempt,
    'attempt'
  );
}
