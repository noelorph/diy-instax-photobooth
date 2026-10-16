import { redactEvent } from '@/lib/operations/event-redaction';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  return redactEvent(request, eventId, 'redact_client');
}
