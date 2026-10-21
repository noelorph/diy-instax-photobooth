import { z } from 'zod';
import { MAX_TOTAL_PACKAGES, PackageError } from './package-contract';
import { parseOperation } from './validation';

export const originalPackagesSchema = z.number().int().min(0).max(MAX_TOTAL_PACKAGES);
const revision = z.number().int().positive().max(2_147_483_647);
const generation = z.number().int().nonnegative().max(2_147_483_647);
const printerId = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => /\S/.test(value));
export const readinessObservationSchema = z
  .strictObject({
    cameraPermission: z.boolean(),
    cameraLive: z.boolean(),
    serverReachable: z.boolean(),
    printerConnected: z.boolean(),
    printerReady: z.boolean(),
    oldJobCleared: z.boolean(),
    mediaAvailable: z.boolean().optional(),
    loadFault: z.enum(['no_film', 'cover_open', 'load_change']).optional(),
    loadFaultId: z.uuid().optional(),
  })
  .refine((value) => (value.loadFault === undefined) === (value.loadFaultId === undefined));
const readinessReportSchema = z.strictObject({
  readinessWindowId: z.uuid(),
  observedAgeMs: z.number().int().min(0).max(5_000),
  printerId,
  connectionGeneration: generation,
  observation: readinessObservationSchema,
});
const reason = z.string().trim().min(1);
export const packageOperationSchema = z.strictObject({ operationId: z.uuid() });
const eventRevisionSchema = packageOperationSchema.extend({ expectedRevision: revision });
const runRevisionSchema = eventRevisionSchema.extend({ runId: z.uuid() });
export const addPackagesSchema = packageOperationSchema.extend({
  packages: z.number().int().positive().max(MAX_TOTAL_PACKAGES),
  clientRequestNote: reason,
});
export const packageActionSchemas = {
  reportReadiness: z.union([
    readinessReportSchema.extend({ operationId: z.uuid() }),
    z.strictObject({
      operationId: z.uuid(),
      kind: z.literal('connection_changed'),
      readinessWindowId: z.uuid(),
      printerId,
      connectionGeneration: generation,
      expectedRevision: revision,
    }),
  ]),
  reportSetupReadiness: readinessReportSchema.extend({
    operationId: z.uuid(),
    deviceHash: z.string().regex(/^[0-9a-f]{64}$/),
    filmLoadedConfirmed: z.boolean(),
    powerConfirmed: z.boolean(),
    guidedAccessConfirmed: z.boolean(),
  }),
  requestReload: runRevisionSchema.extend({ printerId, connectionGeneration: generation, reason }),
  addPackages: addPackagesSchema,
  confirmHandoff: packageOperationSchema.extend({ handoffId: z.uuid() }),
  recoverAccess: runRevisionSchema,
  pause: runRevisionSchema,
  resume: runRevisionSchema,
  finish: runRevisionSchema,
  complete: eventRevisionSchema,
  cancel: eventRevisionSchema,
  deleteDraft: eventRevisionSchema,
  confirmReload: eventRevisionSchema.extend({
    reloadRequestId: z.uuid(),
    printerId,
    connectionGeneration: generation,
  }),
  recoverAttempt: eventRevisionSchema.extend({ reason }),
  resolveAttempt: eventRevisionSchema.extend({
    outcome: z.enum(['printed', 'not_printed']),
    inspectionReason: reason,
    oldJobCleared: z.boolean(),
  }),
  startSession: eventRevisionSchema,
  recordCapture: packageOperationSchema.extend({
    sessionId: z.uuid(),
    captureId: z.uuid(),
    capturedAt: z.iso.datetime(),
  }),
  endSession: packageOperationSchema.extend({ reason }),
  reserve: eventRevisionSchema.extend({ sessionId: z.uuid(), captureId: z.uuid() }),
  dispatch: eventRevisionSchema.extend({
    printerId,
    connectionGeneration: generation,
  }),
  reconcile: packageOperationSchema.extend({ reason }),
} as const;
export async function parsePackageOperation<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  try {
    return await parseOperation(request, schema);
  } catch {
    throw new PackageError('invalid_input');
  }
}
