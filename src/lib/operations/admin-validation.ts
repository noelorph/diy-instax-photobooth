import { z } from 'zod';
import { operationSchema } from './validation';
const integer = z.number().int().max(2147483647);
const reason = z.string().trim().min(1).max(1000);
export const revisionSchema = operationSchema.extend({ expectedRevision: integer.positive() });
export const resolutionSchema = operationSchema.extend({
  outcome: z.enum(['ejected', 'unused']),
  inspectionReason: reason,
});
export const recoverySchema = operationSchema.extend({ reason });
export const wastedFilmSchema = operationSchema.extend({ reason });
export const testObservationSchema = operationSchema.extend({
  observationKind: z.enum([
    'commandAccepted',
    'physicalEjectionVerified',
    'preFilmRejected',
    'knownUnsent',
    'uncertain',
  ]),
  evidenceCode: z.string().min(1).max(64),
  observedAt: z.iso.datetime({ offset: true }),
});
export const observationEvidence = {
  commandAccepted: 'command_acknowledged',
  physicalEjectionVerified: 'simulator_ejection',
  preFilmRejected: 'pre_film_rejection',
  knownUnsent: 'command_not_started',
  uncertain: 'ambiguous_outcome',
} as const;
