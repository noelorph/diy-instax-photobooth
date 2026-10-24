import { runPackageBoothOperation } from '@/lib/operations/package-route';
import { packageActionSchemas } from '@/lib/operations/package-validation';
export async function POST(request: Request) {
  return runPackageBoothOperation(
    request,
    null,
    'start_session',
    packageActionSchemas.startSession
  );
}
