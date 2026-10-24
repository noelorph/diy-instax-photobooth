import { changeEventRun } from '@/lib/operations/admin-lifecycle';
import { isPackageEvent } from '@/lib/operations/package-version';
import {
  packageVersionErrorResponse,
  runPackageAdminOperation,
} from '@/lib/operations/package-route';
import { packageActionSchemas } from '@/lib/operations/package-validation';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  try {
    if (await isPackageEvent(request, eventId))
      return runPackageAdminOperation(request, eventId, 'complete', packageActionSchemas.complete);
    return changeEventRun(request, eventId, 'complete');
  } catch (error) {
    return packageVersionErrorResponse(error, 'event', eventId);
  }
}
