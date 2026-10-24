import 'server-only';
import { createPrivilegedClient } from './privileged-client';
import { operationId } from './validation';
import { adminOperation, adminArgs } from './admin-route';
import { revisionSchema } from './admin-validation';
export async function changeEventRun(
  request: Request,
  eventId: string,
  action: 'pause' | 'complete' | 'cancel'
) {
  return adminOperation(
    request,
    revisionSchema,
    async (input, admin) => {
      const { data, error } = await createPrivilegedClient().rpc('change_event_run', {
        ...adminArgs(admin, input.operationKey),
        event_id: operationId(eventId),
        expected_revision: input.expectedRevision,
        action,
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
        state: action === 'pause' ? result.run_state : result.event_state,
        revision: result.revision,
      };
    },
    eventId
  );
}
