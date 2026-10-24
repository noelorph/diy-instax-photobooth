import { redactEvent } from '@/lib/operations/event-redaction';
import { isPackageEvent } from '@/lib/operations/package-version';
import { deletePackageDraft } from '@/lib/operations/package-draft-deletion';
import { packageVersionErrorResponse } from '@/lib/operations/package-route';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  try {
    if (await isPackageEvent(request, eventId)) return deletePackageDraft(request, eventId);
    return redactEvent(request, eventId, 'delete_draft');
  } catch (error) {
    return packageVersionErrorResponse(error, 'event', eventId);
  }
}
