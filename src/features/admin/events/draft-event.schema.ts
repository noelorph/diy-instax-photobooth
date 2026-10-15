import { Temporal } from '@js-temporal/polyfill';
import { z, ZodError } from 'zod';

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

const bookingSchema = z.object({
  title: z.string().trim().min(1, 'Enter the Event name.'),
  clientName: z.string().trim().min(1, 'Enter the Client name.'),
  clientEmail: z.string().trim().pipe(z.email('Enter a valid Client email.')),
  clientPhone: z.string().trim().min(1, 'Enter the Client phone.'),
  venueAddress: z.string().trim().min(1, 'Enter the venue address.'),
  // Match the PostgreSQL integer columns used by Draft persistence.
  filmPackageCount: z
    .int32('Enter a whole Film Package count up to 2147483647.')
    .nonnegative('Film Package count cannot be negative.'),
  originalPrintAllowance: z
    .int32('Enter a whole Print Allowance up to 2147483647.')
    .nonnegative('Print Allowance cannot be negative.'),
});

const scheduleInputSchema = z.object({
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
});

const scheduleSchema = z
  // Parse fields inside the transform so malformed input cannot suppress sibling errors.
  .object({ timeZone: z.unknown(), startsAtLocal: z.unknown(), endsAtLocal: z.unknown() })
  .transform((input, ctx) => {
    function parseField(field: keyof z.input<typeof scheduleInputSchema>) {
      const result = scheduleInputSchema.shape[field].safeParse(input[field]);
      if (result.success) return result.data;
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: [field, ...issue.path] });
      }
      return undefined;
    }
    const timeZone = parseField('timeZone');
    function instant(field: 'startsAtLocal' | 'endsAtLocal') {
      const value = parseField(field);
      if (value === undefined || timeZone === undefined) return undefined;
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
        return local.toZonedDateTime(timeZone, { disambiguation: 'reject' }).toInstant();
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: ambiguousLocalTimeError,
        });
        return undefined;
      }
    }
    const start = instant('startsAtLocal');
    const end = instant('endsAtLocal');
    if (timeZone === undefined || !start || !end) return z.NEVER;
    if (Temporal.Instant.compare(end, start) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAtLocal'],
        message: scheduleOrderError,
      });
      return z.NEVER;
    }
    return { timeZone, startsAtUtc: start.toString(), endsAtUtc: end.toString() };
  });

// Validate the schedule even when unrelated booking fields are invalid.
// Live feedback and submitted saves use these same rules and UTC conversion.
const draftEventSchema = z.intersection(bookingSchema, scheduleSchema);

export type DraftEventInput = z.input<typeof bookingSchema> & z.input<typeof scheduleInputSchema>;
export type ValidatedDraftEvent = z.output<typeof draftEventSchema>;

/** Throws a ZodError with input field paths; shared by form and server validation. */
export function parseDraftEventInput(input: unknown): ValidatedDraftEvent {
  return draftEventSchema.parse(input);
}

export type DraftFieldErrors = Partial<
  Record<keyof DraftEventInput | 'state' | 'expectedRevision', string>
>;

export function draftInputFromFormData(data: FormData): Record<string, unknown> {
  if (!(data instanceof FormData)) return {};
  function count(field: string) {
    const value = data.get(field);
    return typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  }
  return {
    ...Object.fromEntries(data),
    ...(data.has('state')
      ? { state: data.getAll('state').every((value) => value === 'Draft') ? 'Draft' : null }
      : {}),
    filmPackageCount: count('filmPackageCount'),
    originalPrintAllowance: count('originalPrintAllowance'),
  };
}

export function draftFieldErrors(error: ZodError): DraftFieldErrors {
  const fieldErrors: DraftFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof DraftFieldErrors | undefined;
    if (field) fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}

export function validateDraftFormData(data: FormData): DraftFieldErrors {
  try {
    parseDraftEventInput(draftInputFromFormData(data));
    return {};
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return draftFieldErrors(error);
  }
}
