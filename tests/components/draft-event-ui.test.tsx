import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';
import { DraftForm } from '@/features/admin/events/draft-form';
import { DraftList } from '@/features/admin/events/draft-list';
import type { DraftEvent } from '@/lib/events/drafts';
import type { DraftActionState } from '@/features/admin/events/state';

afterEach(cleanup);
const draft: DraftEvent = {
  id: 'a99753d9-a704-45e1-afdc-2976b183b61a',
  state: 'Draft',
  revision: 1,
  title: 'Birthday',
  clientName: 'Alex',
  clientEmail: 'alex@example.test',
  clientPhone: '+639171234567',
  venueAddress: 'Manila hall',
  timeZone: 'Asia/Manila',
  startsAtUtc: '2025-01-10T10:00:00Z',
  endsAtUtc: '2025-01-10T12:00:00Z',
  filmPackageCount: 0,
  originalPrintAllowance: 0,
};
const saved: DraftActionState = {
  status: 'success',
  id: draft.id,
  revision: 2,
  confirmation: 'Draft saved.',
};
const ok = async () => saved;
function form(action: () => Promise<DraftActionState> = ok) {
  return render(<DraftForm initial={draft} createAction={ok} updateAction={action} />);
}
it('shows saved Draft values in server-rendered edit fields', () => {
  const html = renderToString(<DraftForm initial={draft} createAction={ok} updateAction={ok} />);
  const container = document.createElement('div');
  container.innerHTML = html;

  expect((container.querySelector('input[name="title"]') as HTMLInputElement).value).toBe(
    'Birthday'
  );
  expect((container.querySelector('input[name="startsAtLocal"]') as HTMLInputElement).value).toBe(
    '2025-01-10T18:00'
  );
});
it('keeps the Draft editor unavailable until hydration attaches its form state', () => {
  const html = renderToString(<DraftForm initial={draft} createAction={ok} updateAction={ok} />);
  const container = document.createElement('div');
  container.innerHTML = html;

  expect(
    (container.querySelector('input[name="title"]') as HTMLInputElement).matches(':disabled')
  ).toBe(true);
  expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(
    true
  );
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Preparing Draft editor…');

  form();
  expect((screen.getByLabelText('Event name') as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole('button', { name: 'Save Draft' }) as HTMLButtonElement).disabled).toBe(
    false
  );
});
it('offers creation in an empty list and labels venue-local overdue Draft schedules', () => {
  const { rerender } = render(<DraftList drafts={[]} now={Date.parse('2026-01-01Z')} />);
  expect(screen.getByText('No Draft Events yet.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Create Event' }).getAttribute('href')).toBe(
    '/events/new'
  );
  rerender(<DraftList drafts={[draft]} now={Date.parse('2026-01-01Z')} />);
  expect(screen.getByRole('link', { name: 'Birthday' }).getAttribute('href')).toBe(
    `/events/${draft.id}`
  );
  expect(screen.getByText(/18:00/)).toBeTruthy();
  expect(screen.getByText(/Asia\/Manila/)).toBeTruthy();
  expect(screen.getByText('Overdue Draft')).toBeTruthy();
  expect(screen.getByText('Draft', { exact: true })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Create Event' })).toBeNull();
});
it('submits an edited registered value after clearing its error while another server error remains', async () => {
  const submissions: FormData[] = [];
  render(
    <DraftForm
      initial={draft}
      createAction={ok}
      updateAction={async (_id, _revision, _state, data) => {
        submissions.push(data);
        return submissions.length === 1
          ? {
              status: 'invalid',
              fieldErrors: {
                title: 'Review this Event name.',
                venueAddress: 'Review this venue address.',
              },
            }
          : saved;
      }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('Review this Event name.');
  const title = screen.getByLabelText('Event name');
  expect(document.getElementById(title.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Review this Event name.'
  );
  fireEvent.change(title, { target: { value: 'Anniversary dinner' } });
  expect(screen.queryByText('Review this Event name.')).toBeNull();
  expect(title.getAttribute('aria-invalid')).toBe('false');
  expect(title.getAttribute('aria-describedby')).toBeNull();
  expect(screen.getByText('Review this venue address.')).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('Draft saved.');
  expect(submissions).toHaveLength(2);
  expect(submissions[1].get('title')).toBe('Anniversary dinner');
  expect(submissions[1].get('venueAddress')).toBe('Manila hall');
});
it('shows zero booking counts as Draft with venue-local editable times', () => {
  form();
  expect((screen.getByLabelText('Scheduled start') as HTMLInputElement).value).toBe(
    '2025-01-10T18:00'
  );
  expect((screen.getByLabelText('Booked Film Packages') as HTMLInputElement).value).toBe('0');
  expect((screen.getByLabelText('Original Print Allowance') as HTMLInputElement).value).toBe('0');
  expect(screen.getByText('Draft', { exact: true })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /delete|booth|test print|stock/i })).toBeNull();
});
it('validates fields locally and retains entered values', async () => {
  form();
  fireEvent.change(screen.getByLabelText('Client email'), { target: { value: 'invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Client email').getAttribute('aria-invalid')).toBe('true');
  expect((screen.getByLabelText('Client email') as HTMLInputElement).value).toBe('invalid');
  expect(screen.queryByText('Draft saved.')).toBeNull();
});
it('keeps validation quiet until the first save', () => {
  form();
  fireEvent.change(screen.getByLabelText('Client email'), { target: { value: 'invalid' } });
  fireEvent.change(screen.getByLabelText('Client phone'), { target: { value: '' } });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText('Enter a valid Client email.')).toBeNull();
  expect(screen.getByLabelText('Client email').getAttribute('aria-invalid')).toBe('false');
  expect(screen.getByLabelText('Client phone').getAttribute('aria-invalid')).toBe('false');
});
it('retains an email error across invalid edits and clears it after a valid edit', async () => {
  form();
  fireEvent.change(screen.getByLabelText('Client email'), { target: { value: 'invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('Enter a valid Client email.');

  fireEvent.change(screen.getByLabelText('Client email'), { target: { value: 'still-invalid' } });
  expect(screen.getByText('Enter a valid Client email.')).toBeTruthy();
  expect(screen.getByLabelText('Client email').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('alert')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Client email'), {
    target: { value: 'alex@example.test' },
  });
  expect(screen.queryByText('Enter a valid Client email.')).toBeNull();
  expect(screen.getByLabelText('Client email').getAttribute('aria-invalid')).toBe('false');
  expect(screen.queryByRole('alert')).toBeNull();
});
it('clears an edited field error while retaining other invalid field feedback', async () => {
  form();
  fireEvent.change(screen.getByLabelText('Client email'), { target: { value: 'invalid' } });
  fireEvent.change(screen.getByLabelText('Client phone'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('Enter a valid Client email.');
  expect(screen.getByText('Enter the Client phone.')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Client email'), {
    target: { value: 'alex@example.test' },
  });
  expect(screen.queryByText('Enter a valid Client email.')).toBeNull();
  expect(screen.getByLabelText('Client email').getAttribute('aria-invalid')).toBe('false');
  expect(screen.getByText('Enter the Client phone.')).toBeTruthy();
  expect(screen.getByLabelText('Client phone').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('alert').textContent).toBe(
    'Correct the highlighted fields and try again.'
  );

  fireEvent.change(screen.getByLabelText('Client phone'), {
    target: { value: '+639171234567' },
  });
  expect(screen.queryByText('Enter the Client phone.')).toBeNull();
  expect(screen.getByLabelText('Client phone').getAttribute('aria-invalid')).toBe('false');
  expect(screen.queryByRole('alert')).toBeNull();
});
it('retains an end-order error until the edited start is before the end', async () => {
  form();
  fireEvent.change(screen.getByLabelText('Scheduled end'), {
    target: { value: '2025-01-10T17:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('Scheduled end must be after the scheduled start.');

  fireEvent.change(screen.getByLabelText('Scheduled start'), {
    target: { value: '2025-01-10T19:00' },
  });
  expect(screen.getByText('Scheduled end must be after the scheduled start.')).toBeTruthy();
  expect(screen.getByLabelText('Scheduled end').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('alert')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Scheduled start'), {
    target: { value: '2025-01-10T16:00' },
  });
  expect(screen.queryByText('Scheduled end must be after the scheduled start.')).toBeNull();
  expect(screen.getByLabelText('Scheduled end').getAttribute('aria-invalid')).toBe('false');
  expect(screen.queryByRole('alert')).toBeNull();
});
it('keeps end-order feedback truthful while an unrelated email remains invalid', async () => {
  form();
  fireEvent.change(screen.getByLabelText('Scheduled end'), {
    target: { value: '2025-01-10T17:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('Scheduled end must be after the scheduled start.');
  fireEvent.change(screen.getByLabelText('Client email'), { target: { value: 'invalid' } });
  fireEvent.change(screen.getByLabelText('Scheduled start'), {
    target: { value: '2025-01-10T19:00' },
  });
  expect(screen.getByLabelText('Scheduled end').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Scheduled end must be after the scheduled start.')).toBeTruthy();
  expect(screen.getByText('Enter a valid Client email.')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Scheduled start'), {
    target: { value: '2025-01-10T16:00' },
  });
  expect(screen.getByLabelText('Scheduled end').getAttribute('aria-invalid')).toBe('false');
  expect(screen.queryByText('Scheduled end must be after the scheduled start.')).toBeNull();
  expect(screen.getByText('Enter a valid Client email.')).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
});
it.each(['Scheduled start', 'Scheduled end'])(
  'keeps a DST gap on %s visible across dependency edits with an invalid email',
  async (label) => {
    form();
    fireEvent.change(screen.getByLabelText('Venue time zone'), {
      target: { value: 'America/New_York' },
    });
    fireEvent.change(screen.getByLabelText('Scheduled start'), {
      target: { value: label === 'Scheduled start' ? '2026-03-08T02:30' : '2026-03-08T01:00' },
    });
    fireEvent.change(screen.getByLabelText('Scheduled end'), {
      target: { value: label === 'Scheduled end' ? '2026-03-08T02:30' : '2026-03-08T04:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText(
      'This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time.'
    );
    fireEvent.change(screen.getByLabelText('Client email'), { target: { value: 'invalid' } });
    fireEvent.change(screen.getByLabelText('Venue time zone'), {
      target: { value: 'America/Chicago' },
    });
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
    expect(
      screen.getByText(
        'This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time.'
      )
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText(label), { target: { value: '2026-03-08T02:45' } });
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(screen.getByLabelText('Venue time zone'), {
      target: { value: 'Asia/Manila' },
    });
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('false');
    expect(
      screen.queryByText(
        'This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time.'
      )
    ).toBeNull();
    expect(screen.getByText('Enter a valid Client email.')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  }
);
it.each(['Scheduled start', 'Scheduled end'])(
  'keeps DST feedback on %s when its sibling is cleared and the zone changes',
  async (label) => {
    form();
    const sibling = label === 'Scheduled start' ? 'Scheduled end' : 'Scheduled start';
    fireEvent.change(screen.getByLabelText('Venue time zone'), {
      target: { value: 'America/New_York' },
    });
    fireEvent.change(screen.getByLabelText('Scheduled start'), {
      target: { value: label === 'Scheduled start' ? '2026-03-08T02:30' : '2026-03-08T01:00' },
    });
    fireEvent.change(screen.getByLabelText('Scheduled end'), {
      target: { value: label === 'Scheduled end' ? '2026-03-08T02:30' : '2026-03-08T04:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText(
      'This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time.'
    );

    fireEvent.change(screen.getByLabelText(sibling), { target: { value: '' } });
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(sibling).getAttribute('aria-invalid')).toBe('true');
    expect(
      screen.getByText(
        'This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time.'
      )
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Venue time zone'), {
      target: { value: 'America/Chicago' },
    });
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(screen.getByLabelText('Venue time zone'), {
      target: { value: 'Asia/Manila' },
    });
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('false');
    expect(screen.getByLabelText(sibling).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(sibling), {
      target: { value: sibling === 'Scheduled start' ? '2026-03-08T01:00' : '2026-03-08T04:00' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  }
);
it('retains a DST gap error across affected zones until the time is unambiguous', async () => {
  form();
  fireEvent.change(screen.getByLabelText('Venue time zone'), {
    target: { value: 'America/New_York' },
  });
  fireEvent.change(screen.getByLabelText('Scheduled start'), {
    target: { value: '2026-03-08T02:30' },
  });
  fireEvent.change(screen.getByLabelText('Scheduled end'), {
    target: { value: '2026-03-08T04:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText(
    'This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time.'
  );

  fireEvent.change(screen.getByLabelText('Venue time zone'), {
    target: { value: 'America/Chicago' },
  });
  expect(
    screen.getByText(
      'This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time.'
    )
  ).toBeTruthy();
  expect(screen.getByLabelText('Scheduled start').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('alert')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Venue time zone'), {
    target: { value: 'Asia/Manila' },
  });
  expect(
    screen.queryByText(
      'This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time.'
    )
  ).toBeNull();
  expect(screen.getByLabelText('Scheduled start').getAttribute('aria-invalid')).toBe('false');
  expect(screen.queryByRole('alert')).toBeNull();
});
it('retains untouched server field errors while revalidating unrelated edits', async () => {
  form(async () => ({
    status: 'invalid',
    fieldErrors: { venueAddress: 'This venue address could not be accepted.' },
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('This venue address could not be accepted.');

  fireEvent.change(screen.getByLabelText('Client email'), { target: { value: 'invalid' } });
  expect(screen.getByText('This venue address could not be accepted.')).toBeTruthy();
  expect(screen.getByLabelText('Venue address').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Enter a valid Client email.')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Client email'), {
    target: { value: 'alex@example.test' },
  });
  expect(screen.getByText('This venue address could not be accepted.')).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Venue address'), { target: { value: 'Cebu hall' } });
  expect(screen.queryByText('This venue address could not be accepted.')).toBeNull();
  expect(screen.getByLabelText('Venue address').getAttribute('aria-invalid')).toBe('false');
  expect(screen.queryByRole('alert')).toBeNull();
});
it('retains state and revision guidance across edits until the next save', async () => {
  form(async () => ({
    status: 'invalid',
    fieldErrors: {
      state: 'Only Draft Events can be edited.',
      expectedRevision: 'Reload the latest Draft before saving.',
    },
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByRole('alert');
  fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'New booking' } });
  expect(screen.getByRole('alert').textContent).toBe('Reload the latest Draft before saving.');
  expect(screen.getByRole('link', { name: 'Reload latest Draft' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Client email'), { target: { value: 'invalid' } });
  expect(screen.getByText('Enter a valid Client email.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('Correct the highlighted fields and try again.');
  expect(screen.getByRole('alert').textContent).toBe(
    'Correct the highlighted fields and try again.'
  );
  expect(screen.queryByRole('link', { name: 'Reload latest Draft' })).toBeNull();
});
it('does not claim a pending save succeeded and updates the revision after persistence', async () => {
  let finish!: (result: DraftActionState) => void;
  form(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('Saving Draft…');
  expect((screen.getByRole('button', { name: 'Save Draft' }) as HTMLButtonElement).disabled).toBe(
    true
  );
  expect(screen.queryByText('Draft saved.')).toBeNull();
  finish(saved);
  await screen.findByText('Draft saved.');
  expect(screen.getByText('Revision 2')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Unsaved change' } });
  expect(screen.queryByText('Draft saved.')).toBeNull();
});
it('preserves edits on stale conflict and offers explicit reload', async () => {
  form(async () => ({
    status: 'conflict',
    error: 'This Draft changed. Reload the latest record before saving again.',
  }));
  fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'My unsaved edit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Event name') as HTMLInputElement).value).toBe('My unsaved edit');
  expect(screen.getByRole('link', { name: 'Reload latest Draft' }).getAttribute('href')).toBe(
    `/events/${draft.id}`
  );
  expect(screen.queryByText('Draft saved.')).toBeNull();
});
it('preserves values after transport failure and allows retry', async () => {
  let attempt = 0;
  form(async () => {
    if (++attempt === 1) throw new Error('offline');
    return saved;
  });
  fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Retained booking' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/connection.*try again/i);
  expect((screen.getByLabelText('Event name') as HTMLInputElement).value).toBe('Retained booking');
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await screen.findByText('Draft saved.');
});
it('preserves a saved schedule with seconds when opening the editor', () => {
  render(
    <DraftForm
      initial={{ ...draft, startsAtUtc: '2025-01-10T10:00:45Z' }}
      createAction={ok}
      updateAction={ok}
    />
  );
  expect((screen.getByLabelText('Scheduled start') as HTMLInputElement).value).toBe(
    '2025-01-10T18:00:45.000'
  );
});
