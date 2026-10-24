import { changeEventRun } from '@/lib/operations/admin-lifecycle';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  return changeEventRun(request, eventId, 'pause');
}
