import { changeEventRun } from '@/lib/operations/admin-lifecycle';
import { isPackageEvent } from '@/lib/operations/package-version';
import { packageErrorResponse, runPackageAdminOperation } from '@/lib/operations/package-route';
import { packageActionSchemas } from '@/lib/operations/package-validation';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  try {
    if (await isPackageEvent(request, eventId))
      return runPackageAdminOperation(request, eventId, 'cancel', packageActionSchemas.cancel);
    return changeEventRun(request, eventId, 'cancel');
  } catch (error) {
    return packageErrorResponse(error);
  }
}
