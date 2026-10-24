export const operationCodes = [
  'operation_unavailable',
  'unauthorized',
  'forbidden',
  'grant_expired',
  'state_conflict',
  'pending_attempt',
  'allowance_exhausted',
  'stock_exhausted',
  'printer_busy',
  'idempotency_conflict',
  'invalid_evidence',
  'validation_error',
] as const;
export type OperationCode = (typeof operationCodes)[number];
export class OperationError extends Error {
  constructor(public readonly code: OperationCode) {
    super(code);
  }
}
export type AdminAuthority = { userId: string; sessionId: string };
export type BoothAuthority = { grantHash: string; runId: string; eventId: string };
