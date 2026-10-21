import { requireAdminRequest } from '@/lib/operations/admin-authority';
import { packageErrorResponse } from '@/lib/operations/package-route';
import { readPackageAdminState } from '@/lib/operations/package-state';
import { operationResponse } from '@/lib/operations/responses';
import { operationId } from '@/lib/operations/validation';
export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const admin = await requireAdminRequest(request);
    return operationResponse(
      await readPackageAdminState(admin, operationId((await context.params).eventId))
    );
  } catch (error) {
    return packageErrorResponse(error);
  }
}
