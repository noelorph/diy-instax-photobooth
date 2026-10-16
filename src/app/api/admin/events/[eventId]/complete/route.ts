import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import { adminOperation, adminArgs } from '@/lib/operations/admin-route';
import { revisionSchema } from '@/lib/operations/admin-validation';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  return adminOperation(
    request,
    revisionSchema,
    async (input, admin) => {
      const { data, error } = await createPrivilegedClient().rpc('change_event_run', {
        ...adminArgs(admin, input.operationKey),
        event_id: operationId(eventId),
        expected_revision: input.expectedRevision,
        action: 'complete',
      });
      if (error) throw error;
      const result = data as {
        event_id: string;
        run_id: string | null;
        run_state: string | null;
        event_state: string;
        revision: number;
      };
      return {
        eventId: result.event_id,
        runId: result.run_id,
        state: result.event_state,
        revision: result.revision,
      };
    },
    eventId
  );
}
