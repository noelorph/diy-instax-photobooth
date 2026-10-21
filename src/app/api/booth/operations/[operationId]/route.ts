import { grantHash } from '@/lib/operations/booth-authority';
import { packageErrorResponse } from '@/lib/operations/package-route';
import { readPackageBoothState } from '@/lib/operations/package-state';
import { operationResponse } from '@/lib/operations/responses';
import { operationId } from '@/lib/operations/validation';
export async function GET(request: Request, context: { params: Promise<{ operationId: string }> }) {
  try {
    const id = operationId((await context.params).operationId);
    const state = await readPackageBoothState(grantHash(request), id);
    return operationResponse({ revision: state.revision, receipt: state.receipt });
  } catch (error) {
    return packageErrorResponse(error);
  }
}
