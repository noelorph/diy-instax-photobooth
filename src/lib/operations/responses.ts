import { NextResponse } from 'next/server';
import { OperationError, operationCodes, type OperationCode } from './types';
const messages: Record<OperationCode, string> = {
  operation_unavailable: 'The result could not be confirmed. Retry the same operation.',
  unauthorized: 'Sign in to continue.',
  forbidden: 'This request is not permitted.',
  grant_expired: 'Booth access has expired. Sign in to resume.',
  state_conflict: 'The current state does not allow this operation.',
  pending_attempt: 'Resolve the pending print first.',
  allowance_exhausted: 'No guest prints remain.',
  stock_exhausted: 'No film is available.',
  printer_busy: 'The printer is busy.',
  idempotency_conflict: 'This operation key was already used for another request.',
  invalid_evidence: 'The supplied evidence is not accepted.',
  validation_error: 'Check the request fields.',
};
export function operationResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      Vary: 'Cookie',
    },
  });
}
export function operationErrorResponse(
  error: unknown,
  current?: { state: string; revision: number }
) {
  const raw =
    error instanceof OperationError
      ? error.code
      : error && typeof error === 'object' && 'message' in error
        ? error.message
        : null;
  const code: OperationCode = operationCodes.includes(raw as OperationCode)
    ? (raw as OperationCode)
    : raw === 'handoff_expired'
      ? 'grant_expired'
      : 'operation_unavailable';
  const status =
    code === 'operation_unavailable'
      ? 503
      : code === 'unauthorized' || code === 'grant_expired'
        ? 401
        : code === 'forbidden'
          ? 403
          : code === 'validation_error' || code === 'invalid_evidence'
            ? 400
            : 409;
  return operationResponse(
    {
      code,
      message: messages[code],
      ...(current ? { current: { state: current.state, revision: current.revision } } : {}),
    },
    status
  );
}
