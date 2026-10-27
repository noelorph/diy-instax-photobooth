import { z } from 'zod';
import { boothReturnCookie } from '@/features/admin/auth/booth-return';
import { requireAdminRequest } from '@/lib/operations/admin-authority';
import {
  cookieOptions,
  deviceCookie,
  hashSecret,
  newSecret,
  readSecret,
} from '@/lib/operations/booth-authority';
import { PackageError } from '@/lib/operations/package-contract';
import { packageErrorResponse, runPackageAdminOperation } from '@/lib/operations/package-route';
import { packageRpc } from '@/lib/operations/package-rpc';
import { packageActionSchemas } from '@/lib/operations/package-validation';
import { operationResponse } from '@/lib/operations/responses';
import { operationId } from '@/lib/operations/validation';
import { requireSimulator } from '@/lib/operations/printer-gate';

const query = z.strictObject({
  printerId: z
    .string()
    .min(1)
    .max(128)
    .refine((value) => /\S/.test(value)),
  connectionGeneration: z
    .string()
    .regex(/^(0|[1-9]\d*)$/)
    .transform(Number)
    .pipe(z.number().int().max(2147483647)),
});

export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    try {
      requireSimulator();
    } catch {
      throw new PackageError('qualification_required');
    }
    const admin = await requireAdminRequest(request);
    const eventId = operationId((await context.params).eventId);
    const url = new URL(request.url);
    const parsed = query.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw new PackageError('invalid_input');
    const device = readSecret(request, deviceCookie) ?? newSecret();
    const result = await packageRpc('package_setup_read', {
      p_admin_user_id: admin.userId,
      p_admin_session_id: admin.sessionId,
      p_event_id: eventId,
      p_device_hash: hashSecret(device),
      p_printer_id: parsed.data.printerId,
      p_connection_generation: parsed.data.connectionGeneration,
    });
    const response = operationResponse(result);
    response.cookies.set(deviceCookie, device, { ...cookieOptions, maxAge: 172800 });
    response.cookies.set(boothReturnCookie, eventId, { ...cookieOptions, maxAge: 172800 });
    return response;
  } catch (error) {
    return packageErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return runPackageAdminOperation(
    request,
    (await context.params).eventId,
    'report_setup_readiness',
    packageActionSchemas.setupReadiness
  );
}
