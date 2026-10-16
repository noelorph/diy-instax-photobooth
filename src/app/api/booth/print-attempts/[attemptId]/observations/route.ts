import { boothErrorResponse, requireBoothGrant } from '@/lib/operations/booth-authority';
import { requireSimulator } from '@/lib/operations/printer-gate';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId, parseOperation, requireSameOrigin } from '@/lib/operations/validation';
import { operationResponse } from '@/lib/operations/responses';
import { OperationError } from '@/lib/operations/types';
import { attemptResult } from '@/lib/operations/admin-route';
import { testObservationSchema, observationEvidence } from '@/lib/operations/admin-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    requireSameOrigin(request);
    const booth = await requireBoothGrant(request);
    requireSimulator();
    if (booth.state !== 'Active') throw new OperationError('forbidden');
    const input = await parseOperation(request, testObservationSchema);
    const attemptId = operationId((await context.params).attemptId);
    if (input.evidenceCode !== observationEvidence[input.observationKind])
      throw new OperationError('invalid_evidence');
    if (input.observationKind === 'physicalEjectionVerified') requireSimulator('invalid_evidence');
    const client = createPrivilegedClient();
    const { data: run, error } = await client
      .from('booth_runs')
      .select('state')
      .eq('id', booth.runId)
      .eq('event_id', booth.eventId)
      .maybeSingle();
    if (error) throw error;
    if (!run || !['Active', 'PauseRequested'].includes(run.state))
      throw new OperationError('forbidden');
    if (run.state === 'PauseRequested' && input.observationKind === 'commandAccepted')
      throw new OperationError('state_conflict');
    // The RPC rechecks grant, Event/run, Guest attempt scope and pending state
    // under the Event lock, including when a pause races this preliminary read.
    const { data, error: rpcError } = await client.rpc('report_booth_observation', {
      grant_hash: booth.grantHash,
      attempt_id: attemptId,
      operation_key: input.operationKey,
      observation_kind: input.observationKind,
      evidence_code: input.evidenceCode,
      observed_at: input.observedAt,
    });
    if (rpcError) throw rpcError;
    return operationResponse(attemptResult(data));
  } catch (error) {
    return boothErrorResponse(error);
  }
}
