// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  draftFieldErrors,
  draftInputFromFormData,
  parseDraftEventInput,
  validateDraftFormData,
} from '@/features/admin/events/draft-event.schema';

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
  it('normalizes lowercase IANA zones to a name accepted by persistence', () => {
    expect(parseDraftEventInput({ ...validInput, timeZone: 'asia/manila' })).toMatchObject({
      timeZone: 'Asia/Manila',
      startsAtUtc: '2026-10-20T10:00:00Z',
    });
  });

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
  it.each(['startsAtLocal', 'endsAtLocal'])(
    'reports the DST gap on %s independently of malformed sibling input',
    (field) => {
      const sibling = field === 'startsAtLocal' ? 'endsAtLocal' : 'startsAtLocal';
      for (const value of ['', undefined, 'not a date', new File(['date'], 'date.txt')]) {
        let error: unknown;
        try {
          parseDraftEventInput({
            ...validInput,
            timeZone: 'America/New_York',
            [field]: '2026-03-08T02:30',
            [sibling]: value,
          });
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(ZodError);
        expect((error as ZodError).issues.map((issue) => issue.path[0])).toEqual([
          'startsAtLocal',
          'endsAtLocal',
        ]);
        const errors = draftFieldErrors(error as ZodError);
        expect(errors[field as 'startsAtLocal' | 'endsAtLocal']).toMatch(
          /does not exist|ambiguous/
        );
        expect(errors[sibling as 'startsAtLocal' | 'endsAtLocal']).toEqual(expect.any(String));
        expect(errors.endsAtLocal).not.toMatch(/after the scheduled start/);
      }
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

function validFormData() {
  const data = new FormData();
  for (const [field, value] of Object.entries(validInput)) data.set(field, String(value));
  return data;
}

describe('Draft FormData validation', () => {
  it.each([
    ['startsAtLocal', 'endsAtLocal'],
    ['endsAtLocal', 'startsAtLocal'],
  ])('retains %s DST feedback alongside blank %s', (field, sibling) => {
    const data = validFormData();
    data.set('timeZone', 'America/New_York');
    data.set(field, '2026-03-08T02:30');
    data.set(sibling, '');
    const errors = validateDraftFormData(data);
    expect(errors[field as 'startsAtLocal' | 'endsAtLocal']).toMatch(/does not exist|ambiguous/);
    expect(errors[sibling as 'startsAtLocal' | 'endsAtLocal']).toBe(
      'Enter a valid venue-local date and time without an offset.'
    );
    expect(Object.keys(errors)).toEqual(['startsAtLocal', 'endsAtLocal']);
  });
  it.each(['filmPackageCount', 'originalPrintAllowance'])(
    'reports missing, empty, whitespace, and file values on %s',
    (field) => {
      for (const value of [undefined, '', ' \t\n ', new File(['0'], 'count.txt')]) {
        const data = validFormData();
        if (value === undefined) data.delete(field);
        else data.set(field, value);
        expect(
          validateDraftFormData(data)[field as 'filmPackageCount' | 'originalPrintAllowance']
        ).toEqual(expect.any(String));
        expectFieldError(draftInputFromFormData(data), field);
      }
    }
  );

  it('accepts zero counts without changing their independent values', () => {
    const data = validFormData();
    data.set('filmPackageCount', '0');
    data.set('originalPrintAllowance', '0');
    expect(validateDraftFormData(data)).toEqual({});
    expect(parseDraftEventInput(draftInputFromFormData(data))).toMatchObject({
      filmPackageCount: 0,
      originalPrintAllowance: 0,
    });
  });

  it.each([
    ['Live', 'Draft'],
    ['Draft', 'Live'],
    [new File(['Draft'], 'state.txt'), 'Draft'],
  ])('preserves rejection of non-Draft duplicate state values (%s, %s)', (first, second) => {
    const data = validFormData();
    data.append('state', first);
    data.append('state', second);
    expect(draftInputFromFormData(data).state).toBeNull();
  });

  it('preserves absent and exclusively Draft state submissions', () => {
    const data = validFormData();
    expect(draftInputFromFormData(data)).not.toHaveProperty('state');
    data.append('state', 'Draft');
    data.append('state', 'Draft');
    expect(draftInputFromFormData(data).state).toBe('Draft');
  });

  it('retains the first issue per field and ignores issues without a field path', () => {
    const error = new ZodError([
      { code: 'custom', path: ['title'], message: 'Enter the Event name.' },
      { code: 'custom', path: ['title'], message: 'Another Event name error.' },
      { code: 'custom', path: [], message: 'Form-level error.' },
      { code: 'custom', path: ['clientEmail'], message: 'Enter a valid Client email.' },
    ]);
    expect(draftFieldErrors(error)).toEqual({
      title: 'Enter the Event name.',
      clientEmail: 'Enter a valid Client email.',
    });
  });
});
