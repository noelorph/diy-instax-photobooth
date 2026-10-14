import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
