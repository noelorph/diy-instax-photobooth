import { grantHash } from '@/lib/operations/booth-authority';
import { packageErrorResponse } from '@/lib/operations/package-route';
import { isRecognizedFinishedProof, readPackageBoothState } from '@/lib/operations/package-state';
import { operationResponse } from '@/lib/operations/responses';
export async function GET(request: Request) {
  try {
    const hash = grantHash(request);
    try {
      return operationResponse(await readPackageBoothState(hash));
    } catch (error) {
      if (await isRecognizedFinishedProof(hash)) return operationResponse({ state: 'Finished' });
      throw error;
    }
  } catch (error) {
    return packageErrorResponse(error);
  }
}
