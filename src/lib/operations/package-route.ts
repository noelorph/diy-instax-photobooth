import 'server-only';
import type { NextResponse } from 'next/server';
import type { z } from 'zod';
import { requireAdminRequest } from './admin-authority';
import {
  boothCookie,
  cookieOptions,
  deviceCookie,
  grantHash,
  hashSecret,
  readSecret,
} from './booth-authority';
import { PackageError, packageErrorStatus, type PackageErrorCode } from './package-contract';
import { parsePackageOperation } from './package-validation';
import { packageRpc } from './package-rpc';
import { requireSameOrigin, operationId } from './validation';
import { operationResponse } from './responses';
import { getBoothPrinterMode, requireBoothPrinterMode } from './printer-gate';
import { createPrivilegedClient } from './privileged-client';
import { OperationError } from './types';

const messages: Record<PackageErrorCode, string> = {
  invalid_input: 'Check the request fields.',
  access_required: 'Booth access ended. Please inform the Admin.',
  operation_forbidden: 'This request is not permitted.',
  qualification_required: 'Printing is not qualified on this device.',
  stale_revision: 'The Event changed. Refresh and retry.',
  operation_conflict: 'This operation ID was used for another request.',
  not_ready: 'The booth is not ready.',
  print_pending: 'Resolve the pending print first.',
  booked_prints_exhausted: 'No booked prints remain.',
  invalid_transition: 'The current state does not allow this operation.',
  operation_unavailable: 'The result could not be confirmed. Retry the same operation ID.',
};
export function packageErrorResponse(error: unknown) {
  const code =
    error instanceof PackageError
      ? error.code
      : error instanceof OperationError
        ? error.code === 'validation_error'
          ? 'invalid_input'
          : error.code === 'unauthorized' || error.code === 'grant_expired'
            ? 'access_required'
            : error.code === 'forbidden'
              ? 'operation_forbidden'
              : 'operation_unavailable'
        : 'operation_unavailable';
  return operationResponse({ code, message: messages[code] }, packageErrorStatus[code]);
}
function developmentEvidenceOnly() {
  if (process.env.NODE_ENV === 'production') throw new PackageError('qualification_required');
}

/** Match the browser proof's expiry to the grant after an authorized database call. */
export async function refreshPackageBoothCookie(request: Request, response: NextResponse) {
  if (!response.ok) return response;
  const secret = readSecret(request, boothCookie);
  if (!secret) return response;
  try {
    const { data, error } = await createPrivilegedClient()
      .from('booth_grants')
      .select('state,revoked_at,expires_at')
      .eq('secret_hash', hashSecret(secret))
      .maybeSingle();
    if (error || data?.state !== 'Active' || data.revoked_at) return response;
    const expiry = Date.parse(data.expires_at);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return response;
    response.cookies.set(boothCookie, secret, { ...cookieOptions, expires: new Date(expiry) });
  } catch {
    // The committed operation response is still recoverable by its receipt.
  }
  return response;
}
export type AdminPackageAction =
  | 'start'
  | 'recover_access'
  | 'pause'
  | 'resume'
  | 'finish'
  | 'complete'
  | 'cancel'
  | 'add_packages'
  | 'request_reload'
  | 'confirm_reload'
  | 'recover_attempt'
  | 'resolve_attempt'
  | 'report_setup_readiness';
export type BoothPackageAction =
  | 'confirm_handoff'
  | 'start_session'
  | 'record_capture'
  | 'end_session'
  | 'reserve'
  | 'dispatch'
  | 'reconcile'
  | 'observe'
  | 'report_readiness';

export async function runPackageAdminOperation<T extends { operationId: string }>(
  request: Request,
  resourceId: string,
  action: AdminPackageAction,
  schema: z.ZodType<T>,
  resource: 'event' | 'attempt' = 'event'
) {
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request);
    // Keep saved commands bound to their actor when another tab changes cookies.
    const expectedAdmin = request.headers.get('x-package-admin-id');
    if (
      (action === 'add_packages' && expectedAdmin !== admin.userId) ||
      ([
        'start',
        'recover_access',
        'pause',
        'resume',
        'finish',
        'complete',
        'cancel',
        'report_setup_readiness',
      ].includes(action) &&
        expectedAdmin !== null &&
        expectedAdmin !== admin.userId)
    )
      throw new PackageError('operation_forbidden');
    const input = await parsePackageOperation(request, schema);
    const id = operationId(resourceId);
    let eventId = id;
    if (resource === 'attempt') {
      const { data, error } = await createPrivilegedClient()
        .from('print_attempts')
        .select('event_id,accounting_version')
        .eq('id', id)
        .maybeSingle();
      if (error || !data || data.accounting_version !== 2)
        throw new PackageError('operation_forbidden');
      eventId = data.event_id;
    }
    const { operationId: key, ...fields } = input;
    const payload: Record<string, unknown> = { eventId, ...fields };
    if (resource === 'attempt') payload.attemptId = id;
    if (action === 'start' || action === 'recover_access' || action === 'report_setup_readiness') {
      const device = readSecret(request, deviceCookie);
      if (!device) throw new PackageError('access_required');
      payload.deviceHash = hashSecret(device);
    }
    if (action === 'start' || action === 'report_setup_readiness')
      payload.printerMode = requireBoothPrinterMode();
    if (action === 'resolve_attempt') developmentEvidenceOnly();
    const result = await packageRpc('package_admin_operation', {
      p_admin_user_id: admin.userId,
      p_admin_session_id: admin.sessionId,
      p_operation: action,
      p_operation_id: key,
      p_payload: payload as never,
    });
    return operationResponse(result);
  } catch (error) {
    return packageErrorResponse(error);
  }
}

export async function runPackageBoothOperation<T extends { operationId: string }>(
  request: Request,
  resourceId: string | null,
  action: BoothPackageAction,
  schema: z.ZodType<T>,
  resource: 'attempt' | 'session' | null = null
) {
  try {
    requireSameOrigin(request);
    const hash = grantHash(request);
    const input = await parsePackageOperation(request, schema);
    const { operationId: key, ...fields } = input;
    const payload: Record<string, unknown> = { ...fields };
    if (resourceId && resource)
      payload[resource === 'attempt' ? 'attemptId' : 'sessionId'] = operationId(resourceId);
    if (action === 'confirm_handoff') {
      const device = readSecret(request, deviceCookie);
      if (!device) throw new PackageError('access_required');
      payload.deviceHash = hashSecret(device);
    }
    if (['start_session', 'reserve', 'dispatch'].includes(action))
      payload.printerMode = requireBoothPrinterMode();
    if (action === 'report_readiness') {
      developmentEvidenceOnly();
      payload.printerMode = getBoothPrinterMode();
    }
    if (action === 'observe') developmentEvidenceOnly();
    const result = await packageRpc('package_booth_operation', {
      p_grant_hash: hash,
      p_operation: action,
      p_operation_id: key,
      p_payload: payload as never,
    });
    return refreshPackageBoothCookie(request, operationResponse(result));
  } catch (error) {
    return packageErrorResponse(error);
  }
}

export { boothCookie };
