import { runPackageBoothOperation } from '@/lib/operations/package-route';
import { packageActionSchemas } from '@/lib/operations/package-validation';
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  return runPackageBoothOperation(
    request,
    sessionId,
    'end_session',
    packageActionSchemas.endSession,
    'session'
  );
}
