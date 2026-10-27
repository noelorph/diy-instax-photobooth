import { PackageError } from '@/lib/operations/package-contract';
import { requireAdminRequest } from '@/lib/operations/admin-authority';
import { packageErrorResponse } from '@/lib/operations/package-route';
import { readPackageAdminState } from '@/lib/operations/package-state';
import { operationResponse } from '@/lib/operations/responses';
import { operationId } from '@/lib/operations/validation';
export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; operationId: string }> }
) {
  try {
    const admin = await requireAdminRequest(request);
    const expectedAdmin = request.headers.get('x-package-admin-id');
    if (expectedAdmin !== null && expectedAdmin !== admin.userId)
      throw new PackageError('operation_forbidden');
    const { eventId, operationId: key } = await context.params;
    const state = await readPackageAdminState(admin, operationId(eventId), operationId(key));
    return operationResponse({ revision: state.revision, receipt: state.receipt });
  } catch (error) {
    return packageErrorResponse(error);
  }
}
