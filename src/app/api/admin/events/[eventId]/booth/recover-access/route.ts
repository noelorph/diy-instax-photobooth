import { runPackageAdminOperation } from '@/lib/operations/package-route';
import { packageActionSchemas } from '@/lib/operations/package-validation';
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  return runPackageAdminOperation(
    request,
    eventId,
    'recover_access',
    packageActionSchemas.recoverAccess
  );
}
