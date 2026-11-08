export type BoothPrinterMode = 'disabled' | 'simulated' | 'instax-development';
export type PrinterEvidenceDescriptor =
  | {
      adapterVersion: 'simulator-v2';
      evidenceVersion: 'simulator-v1';
      modelNumber: null;
      firmwareRevision: null;
    }
  | {
      adapterVersion: 'instax-mini-link3-v1';
      evidenceVersion: 'instax-fi033-0102-dev-v1';
      modelNumber: 'FI033';
      firmwareRevision: '0102';
    };
export const SIMULATOR_EVIDENCE: PrinterEvidenceDescriptor = {
  adapterVersion: 'simulator-v2',
  evidenceVersion: 'simulator-v1',
  modelNumber: null,
  firmwareRevision: null,
};
export const PRINTS_PER_PACKAGE = 10;
export const MAX_TOTAL_PACKAGES = 214_748_364;
export const READINESS_MAX_AGE_MS = 5_000;
export const STATE_POLL_MS = 2_000;
export const HANDOFF_TTL_MS = 5 * 60_000;
export const GRANT_IDLE_TTL_MS = 24 * 60 * 60_000;
export const LATE_CAPTURE_WINDOW_MS = 2 * 60_000;
export const runStates = ['Prepared', 'Active', 'Paused', 'Finishing', 'Finished'] as const;
export type RunState = (typeof runStates)[number];
export const readinessStages = ['setup', 'guest', 'reserve', 'dispatch', 'resume'] as const;
export type ReadinessStage = (typeof readinessStages)[number];
export type PackageReadiness = {
  ready: boolean;
  stage: ReadinessStage;
  blockers: string[];
  counts: PackageCounts;
};
export const attemptStates = [
  'Reserved',
  'Dispatching',
  'Accepted',
  'Pending',
  'Printed',
  'NotPrinted',
] as const;
export type AttemptState = (typeof attemptStates)[number];
export type PackageCounts = {
  originalPackages: number;
  additionalPackages: number;
  totalBookedPrints: number;
  printed: number;
  unresolved: number;
  printsRemaining: number;
  printsAvailable: number;
};
export type PackageOperationReceipt<T> = {
  operationId: string;
  kind: string;
  committedRevision: number;
  result: T;
};
export type PackageOperationResult<T> = {
  receipt: PackageOperationReceipt<T>;
  revision: number;
  replayed: boolean;
};
export type DispatchAuthorization = {
  attemptId: string;
  dispatchId: string;
  printerId: string;
  connectionGeneration: number;
};
export type DispatchResult = PackageOperationResult<{ attemptId: string; state: AttemptState }> &
  ({ sendAllowed: true; authorization: DispatchAuthorization } | { sendAllowed: false });
export const packageErrorStatus = {
  invalid_input: 400,
  access_required: 401,
  operation_forbidden: 403,
  qualification_required: 403,
  stale_revision: 409,
  operation_conflict: 409,
  not_ready: 409,
  print_pending: 409,
  booked_prints_exhausted: 409,
  invalid_transition: 409,
  operation_unavailable: 503,
} as const;
export type PackageErrorCode = keyof typeof packageErrorStatus;
export class PackageError extends Error {
  constructor(public readonly code: PackageErrorCode) {
    super(code);
  }
}
export function packageCounts(
  originalPackages: number,
  additionalPackages: number,
  printed: number,
  unresolved: number
): PackageCounts {
  const totalBookedPrints = PRINTS_PER_PACKAGE * (originalPackages + additionalPackages);
  if (
    ![originalPackages, additionalPackages, printed, unresolved].every(
      (value) => Number.isSafeInteger(value) && value >= 0
    ) ||
    originalPackages + additionalPackages > MAX_TOTAL_PACKAGES ||
    unresolved > 1 ||
    printed + unresolved > totalBookedPrints
  ) {
    throw new PackageError('invalid_input');
  }
  return {
    originalPackages,
    additionalPackages,
    totalBookedPrints,
    printed,
    unresolved,
    printsRemaining: totalBookedPrints - printed,
    printsAvailable: totalBookedPrints - printed - unresolved,
  };
}

export type ReloadRequestBinding = {
  reloadRequestId: string;
  reloadRequestRevision: number;
  printerId: string;
  connectionGeneration: number;
};
