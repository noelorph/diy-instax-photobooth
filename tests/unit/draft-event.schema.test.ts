// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseDraftEventInput } from '@/features/admin/events/draft-event.schema';

const validInput = {
  title: '  Birthday party  ',
  clientName: '  Alex Reyes  ',
  clientEmail: '  alex@example.com  ',
  clientPhone: '  +63 917 123 4567  ',
  venueAddress: '  123 Main Street  ',
  timeZone: 'Asia/Manila',
  startsAtLocal: '2026-10-20T18:00',
  endsAtLocal: '2026-10-20T21:00',
  filmPackageCount: 2,
  originalPrintAllowance: 37,
};

describe('Draft Event input', () => {
  it.each(['startsAtLocal', 'endsAtLocal'])(
    'requires a valid venue-local date and time on %s',
    (field) => {
      for (const value of [
        'not a date',
        '2026-10-20',
        '2026-02-30T18:00',
        '2026-10-20T18:00+08:00',
        '2026-10-20T18:00Z',
        '2026-10-20T18:00:60',
      ]) {
        expectFieldError({ ...validInput, [field]: value }, field, /valid.*local.*date.*time/i);
      }
    }
  );
  it.each(['2026-10-20T17:59', '2026-10-20T18:00'])(
    'requires the scheduled end to be after start (%s)',
    (endsAtLocal) => {
      expectFieldError({ ...validInput, endsAtLocal }, 'endsAtLocal', /after.*start/i);
    }
  );

  it('compares UTC instants when the schedule crosses a DST offset change', () => {
    expect(
      parseDraftEventInput({
        ...validInput,
        timeZone: 'America/New_York',
        startsAtLocal: '2026-03-08T01:30',
        endsAtLocal: '2026-03-08T03:00',
      })
    ).toMatchObject({ startsAtUtc: '2026-03-08T06:30:00Z', endsAtUtc: '2026-03-08T07:00:00Z' });
    expectFieldError(
      {
        ...validInput,
        timeZone: 'America/New_York',
        startsAtLocal: '2026-03-08T03:00',
        endsAtLocal: '2026-03-08T01:30',
      },
      'endsAtLocal',
      /after.*start/i
    );
  });
  it.each(['startsAtLocal', 'endsAtLocal'])(
    'rejects the New York DST gap on %s with a field explanation',
    (field) => {
      expectFieldError(
        { ...validInput, timeZone: 'America/New_York', [field]: '2026-03-08T02:30' },
        field,
        /does not exist|nonexistent/i
      );
    }
  );

  it.each(['startsAtLocal', 'endsAtLocal'])(
    'rejects the New York DST overlap on %s with a field explanation',
    (field) => {
      expectFieldError(
        { ...validInput, timeZone: 'America/New_York', [field]: '2026-11-01T01:30' },
        field,
        /ambiguous/i
      );
    }
  );
  it.each([
    [0, 0],
    [0, 37],
    [2, 0],
    [2147483647, 2147483647],
  ])('preserves independent Draft counts %i and %i', (filmPackageCount, originalPrintAllowance) => {
    expect(
      parseDraftEventInput({ ...validInput, filmPackageCount, originalPrintAllowance })
    ).toMatchObject({
      filmPackageCount,
      originalPrintAllowance,
    });
  });

  it.each(['Mars/Olympus', '+08:00', 'Manila'])(
    'rejects %s as an invalid venue IANA zone',
    (timeZone) => {
      expectFieldError({ ...validInput, timeZone }, 'timeZone', /IANA.*time zone/i);
    }
  );
  it.each(['filmPackageCount', 'originalPrintAllowance'])(
    'rejects negative, fractional, or unrepresentable %s',
    (field) => {
      for (const count of [-1, 0.5, 2147483648, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
        expectFieldError({ ...validInput, [field]: count }, field);
      }
    }
  );
  it('rejects an invalid Client email with an actionable field error', () => {
    expectFieldError({ ...validInput, clientEmail: 'alex@' }, 'clientEmail', /valid.*email/i);
  });
  it.each(Object.keys(validInput))('requires %s with an error on the field', (field) => {
    const input: Record<string, unknown> = { ...validInput };
    delete input[field];
    expectFieldError(input, field);
  });

  it.each([
    'title',
    'clientName',
    'clientEmail',
    'clientPhone',
    'venueAddress',
    'timeZone',
    'startsAtLocal',
    'endsAtLocal',
    'filmPackageCount',
    'originalPrintAllowance',
  ])('rejects whitespace-only %s', (field) => {
    expectFieldError({ ...validInput, [field]: ' \t\n ' }, field);
  });
  it('trims booking details and preserves independent counts and the venue zone', () => {
    expect(parseDraftEventInput(validInput)).toEqual({
      title: 'Birthday party',
      clientName: 'Alex Reyes',
      clientEmail: 'alex@example.com',
      clientPhone: '+63 917 123 4567',
      venueAddress: '123 Main Street',
      timeZone: 'Asia/Manila',
      filmPackageCount: 2,
      originalPrintAllowance: 37,
      startsAtUtc: '2026-10-20T10:00:00Z',
      endsAtUtc: '2026-10-20T13:00:00Z',
    });
  });
});

function expectFieldError(input: unknown, field: string, message?: RegExp) {
  let error: unknown;
  try {
    parseDraftEventInput(input);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ZodError);
  const issue = (error as ZodError).issues.find((issue) => issue.path[0] === field);
  expect(issue).toBeDefined();
  if (message) expect(issue?.message).toMatch(message);
}
