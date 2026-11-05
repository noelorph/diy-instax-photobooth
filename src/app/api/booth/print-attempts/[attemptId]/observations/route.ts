import { runPackageBoothOperation } from '@/lib/operations/package-route';
import { packageHttpObserveSchema } from '@/lib/operations/package-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  return runPackageBoothOperation(
    request,
    attemptId,
    'observe',
    packageHttpObserveSchema,
    'attempt'
  );
}
