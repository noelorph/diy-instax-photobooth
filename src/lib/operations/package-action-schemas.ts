import { z } from 'zod';
import { addPackagesSchema } from './package-purchase-schema';
export { addPackagesSchema } from './package-purchase-schema';

const revision = z.number().int().positive().max(2_147_483_647);
const generation = z.number().int().nonnegative().max(2_147_483_647);
const printerId = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => /\S/.test(value));
export const printerEvidenceSchema = z.union([
  z.strictObject({
    adapterVersion: z.literal('simulator-v2'),
    evidenceVersion: z.literal('simulator-v1'),
    modelNumber: z.null(),
    firmwareRevision: z.null(),
  }),
  z.strictObject({
    adapterVersion: z.literal('instax-mini-link3-v1'),
    evidenceVersion: z.literal('instax-fi033-0102-dev-v1'),
    modelNumber: z.literal('FI033'),
    firmwareRevision: z.literal('0102'),
  }),
]);
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
const readinessReportSchema = z
  .strictObject({
    readinessWindowId: z.uuid(),
    observedAgeMs: z.number().int().min(0).max(5_000),
    printerId,
    connectionGeneration: generation,
    printerEvidence: printerEvidenceSchema.nullable(),
    observation: readinessObservationSchema,
  })
  .refine((value) => !value.observation.printerConnected || value.printerEvidence !== null);
const reason = z.string().trim().min(1);
export const packageOperationSchema = z.strictObject({ operationId: z.uuid() });
const eventRevisionSchema = packageOperationSchema.extend({ expectedRevision: revision });
const runRevisionSchema = eventRevisionSchema.extend({ runId: z.uuid() });
export const packageActionSchemas = {
  start: eventRevisionSchema.extend({
    readinessWindowId: z.uuid(),
    printerId,
    connectionGeneration: generation,
  }),
  setupReadiness: readinessReportSchema.safeExtend({
    operationId: z.uuid(),
    filmLoadedConfirmed: z.boolean(),
    powerConfirmed: z.boolean(),
    guidedAccessConfirmed: z.boolean(),
  }),
  reportReadiness: z.union([
    readinessReportSchema.safeExtend({ operationId: z.uuid() }),
    z.strictObject({
      operationId: z.uuid(),
      kind: z.literal('connection_changed'),
      printerEvidence: printerEvidenceSchema,
      readinessWindowId: z.uuid(),
      printerId,
      connectionGeneration: generation,
      expectedRevision: revision,
    }),
  ]),
  reportSetupReadiness: readinessReportSchema.safeExtend({
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
  observe: packageOperationSchema
    .extend({
      attemptId: z.uuid(),
      observationId: z.uuid(),
      kind: z.enum([
        'definitely_not_sent',
        'command_accepted',
        'full_ejection_confirmed',
        'no_film_rejected',
        'outcome_unknown',
        'connection_changed',
        'ready_for_new_job',
      ]),
      printerId,
      dispatchId: z.uuid().nullable(),
      adapterVersion: z.enum(['simulator-v2', 'instax-mini-link3-v1']),
      evidenceVersion: z.enum(['simulator-v1', 'instax-fi033-0102-dev-v1']),
      connectionGeneration: generation,
      metadata: z.strictObject({}),
    })
    .refine((value) => value.observationId === value.operationId),
} as const;
const { attemptId: _attemptId, ...httpObservationFields } = packageActionSchemas.observe.shape;
void _attemptId;
export const packageHttpObserveSchema = z
  .strictObject(httpObservationFields)
  .refine((value) => value.observationId === value.operationId);
