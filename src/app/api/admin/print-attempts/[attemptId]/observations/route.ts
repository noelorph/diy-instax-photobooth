import { requireSimulator } from '@/lib/operations/printer-gate';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { operationId } from '@/lib/operations/validation';
import { OperationError } from '@/lib/operations/types';
import { adminOperation, adminArgs, attemptResult } from '@/lib/operations/admin-route';
import { testObservationSchema, observationEvidence } from '@/lib/operations/admin-validation';
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId: id } = await context.params;
  return adminOperation(request, testObservationSchema, async (input, admin) => {
    if (input.evidenceCode !== observationEvidence[input.observationKind])
      throw new OperationError('invalid_evidence');
    if (input.observationKind === 'physicalEjectionVerified') requireSimulator('invalid_evidence');
    const { data, error } = await createPrivilegedClient().rpc('report_test_observation', {
      ...adminArgs(admin, input.operationKey),
      attempt_id: operationId(id),
      observation_kind: input.observationKind,
      evidence_code: input.evidenceCode,
      observed_at: input.observedAt,
    });
    if (error) throw error;
    return attemptResult(data);
  });
}
