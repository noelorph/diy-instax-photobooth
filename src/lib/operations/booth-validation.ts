import { z } from 'zod';
import { operationSchema } from './validation';
export const openSessionSchema = operationSchema.extend({ runId: z.uuid() });
export const captureSchema = operationSchema.extend({
  capturedAt: z.iso.datetime({ offset: true }),
});
export const guestReservationSchema = openSessionSchema.extend({ captureId: z.uuid() });
