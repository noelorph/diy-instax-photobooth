import { deletePackageDraft } from '@/lib/operations/package-draft-deletion';

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return deletePackageDraft(request, (await context.params).eventId);
}
