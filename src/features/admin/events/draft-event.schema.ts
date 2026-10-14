import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

export const scheduleOrderError = 'Scheduled end must be after the scheduled start.';
export const ambiguousLocalTimeError =
  'This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time.';

const localDateTime = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::[0-5]\d(?:\.\d{1,9})?)?$/,
    'Enter a valid venue-local date and time without an offset.'
  );

const draftEventSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter the Event name.'),
    clientName: z.string().trim().min(1, 'Enter the Client name.'),
    clientEmail: z.string().trim().pipe(z.email('Enter a valid Client email.')),
    clientPhone: z.string().trim().min(1, 'Enter the Client phone.'),
    venueAddress: z.string().trim().min(1, 'Enter the venue address.'),
    timeZone: z
      .string()
      .trim()
      .min(1, 'Enter the venue time zone.')
      .transform((zone, ctx) => {
        if (!/^[+-]/.test(zone)) {
          try {
            // Intl accepts case-insensitive input; persist its IANA spelling so
            // PostgreSQL's case-sensitive zone lookup receives the same name.
            const normalized = new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions()
              .timeZone;
            Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(normalized);
            return normalized;
          } catch {
            // Report invalid zones on their field before converting local times.
          }
        }
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a valid IANA venue time zone, such as Asia/Manila.',
        });
        return z.NEVER;
      }),
    startsAtLocal: localDateTime,
    endsAtLocal: localDateTime,
    // Match the PostgreSQL integer columns used by Draft persistence.
    filmPackageCount: z
      .int32('Enter a whole Film Package count up to 2147483647.')
      .nonnegative('Film Package count cannot be negative.'),
    originalPrintAllowance: z
      .int32('Enter a whole Print Allowance up to 2147483647.')
      .nonnegative('Print Allowance cannot be negative.'),
  })
  .transform(({ startsAtLocal, endsAtLocal, ...booking }, ctx) => {
    function instant(value: string, field: 'startsAtLocal' | 'endsAtLocal') {
      let local: Temporal.PlainDateTime;
      try {
        local = Temporal.PlainDateTime.from(value);
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'Enter a valid venue-local date and time.',
        });
        return undefined;
      }
      try {
        return local.toZonedDateTime(booking.timeZone, { disambiguation: 'reject' }).toInstant();
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: ambiguousLocalTimeError,
        });
        return undefined;
      }
    }
    const start = instant(startsAtLocal, 'startsAtLocal');
    const end = instant(endsAtLocal, 'endsAtLocal');
    if (!start || !end) return z.NEVER;
    if (Temporal.Instant.compare(end, start) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAtLocal'],
        message: scheduleOrderError,
      });
      return z.NEVER;
    }
    return { ...booking, startsAtUtc: start.toString(), endsAtUtc: end.toString() };
  });

export type DraftEventInput = z.input<typeof draftEventSchema>;
export type ValidatedDraftEvent = z.output<typeof draftEventSchema>;

/** Throws a ZodError with input field paths; shared by form and server validation. */
export function parseDraftEventInput(input: unknown): ValidatedDraftEvent {
  return draftEventSchema.parse(input);
}
