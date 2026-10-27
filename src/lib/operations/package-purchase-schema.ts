import { z } from 'zod';
import { MAX_TOTAL_PACKAGES } from './package-contract';

export const addPackagesSchema = z.strictObject({
  operationId: z.uuid(),
  packages: z.number().int().positive().max(MAX_TOTAL_PACKAGES),
  clientRequestNote: z.string().trim().min(1),
});
