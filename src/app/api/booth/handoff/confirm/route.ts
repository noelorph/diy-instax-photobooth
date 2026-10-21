import { runPackageBoothOperation } from '@/lib/operations/package-route';
import { packageActionSchemas } from '@/lib/operations/package-validation';
import { boothCookie, cookieOptions, readSecret } from '@/lib/operations/booth-authority';
import { GRANT_IDLE_TTL_MS } from '@/lib/operations/package-contract';
export async function POST(request: Request) {
  const response = await runPackageBoothOperation(
    request,
    null,
    'confirm_handoff',
    packageActionSchemas.confirmHandoff
  );
  const secret = readSecret(request, boothCookie);
  if (response.ok && secret)
    response.cookies.set(boothCookie, secret, {
      ...cookieOptions,
      maxAge: GRANT_IDLE_TTL_MS / 1000,
    });
  return response;
}
