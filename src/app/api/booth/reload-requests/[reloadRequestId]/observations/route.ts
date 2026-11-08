import { runPackageBoothOperation } from '@/lib/operations/package-route';
import { packageHttpReloadObserveSchema } from '@/lib/operations/package-validation';
export async function POST(
  request: Request,
  context: { params: Promise<{ reloadRequestId: string }> }
) {
  const { reloadRequestId } = await context.params;
  return runPackageBoothOperation(
    request,
    reloadRequestId,
    'observe_reload',
    packageHttpReloadObserveSchema,
    'reload'
  );
}
