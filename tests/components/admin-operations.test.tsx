import { operationErrorResponse } from '@/lib/operations/responses';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OperationsPanel } from '@/features/admin/operations/panel';
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const event = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Celebration',
  state: 'Live',
  revision: 3,
  originalAllowance: 10,
  additionalPrints: 2,
  confirmedPrints: 4,
  captures: 7,
  allowanceReserved: 1,
  stockReserved: 1,
  onHand: 20,
  runState: 'Paused',
  connectionId: null,
  attempts: [],
  eventUnresolved: 1,
  attemptsPage: 0,
  hasOlderAttempts: false,
  usableTestConnectionIds: [],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Admin operations', () => {
  it('cancels a Draft using the package operation contract', async () => {
    let body: object | undefined;
    vi.stubGlobal('fetch', async (_path: string, options: RequestInit) => {
      body = JSON.parse(String(options.body));
      return Response.json({ state: 'Cancelled' });
    });
    render(
      <OperationsPanel
        event={{ ...event, state: 'Draft', eventUnresolved: 0 }}
        simulatorEnabled={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Event' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel Event' }).at(-1)!);
    await screen.findByRole('status');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(body).toEqual({ operationId: expect.any(String), expectedRevision: 3 });
  });
  it('retains terminal records without redaction or deletion controls', () => {
    render(<OperationsPanel event={{ ...event, state: 'Cancelled' }} simulatorEnabled={false} />);
    expect(screen.queryByRole('button', { name: 'Redact Client' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Draft' })).toBeNull();
    expect(screen.queryByLabelText(/replacement title/i)).toBeNull();
  });
  it('labels available and reserved resources and gates physical operation', () => {
    render(<OperationsPanel event={event} simulatorEnabled={false} />);
    expect(screen.getByText('7 prints available')).toBeTruthy();
    expect(screen.getByText('1 prints reserved')).toBeTruthy();
    expect(screen.getByText('19 sheets available')).toBeTruthy();
    expect(screen.getByText('1 sheets reserved')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Resume Booth Mode' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText(/#17/)).toBeTruthy();
  });
  it('shows accepted commands separately from verified ejection and blocks finish on holds', () => {
    render(
      <OperationsPanel
        event={{
          ...event,
          attempts: [
            {
              id: 'a',
              kind: 'Guest',
              state: 'Accepted',
              connection_id: 'c',
              test_output_usable: null,
            },
          ],
        }}
        simulatorEnabled
      />
    );
    expect(screen.getByText(/Command accepted.*ejection unverified/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Finish Event' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Review unresolved prints' })).toBeTruthy();
  });
  it('requires an inspection reason and reviews unused resolution effects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ state: 'Unused' })));
    render(
      <OperationsPanel
        event={{
          ...event,
          attempts: [
            {
              id: 'a',
              kind: 'Guest',
              state: 'Uncertain',
              connection_id: 'c',
              test_output_usable: null,
            },
          ],
        }}
        simulatorEnabled
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resolve as unused' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Release the held sheet and guest print/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Record unused outcome' }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Inspection reason'), {
      target: { value: 'Inspected the slot; no sheet used' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record unused outcome' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Recorded/));
  });
  it('shows revision conflict without claiming success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: 'state_conflict', current: { revision: 4 } }, { status: 409 })
        )
    );
    render(<OperationsPanel event={{ ...event, runState: 'Active' }} simulatorEnabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause Booth Mode' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/changed.*Reload/));
  });
  it('reviews Wasted Film consequences and deletion retained history', () => {
    render(
      <OperationsPanel
        event={{
          ...event,
          state: 'Draft',
          allowanceReserved: 0,
          stockReserved: 0,
          attempts: [
            {
              id: 'a',
              kind: 'Guest',
              state: 'Confirmed',
              connection_id: 'c',
              test_output_usable: null,
            },
          ],
        }}
        simulatorEnabled
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark Wasted Film' }));
    expect(screen.getByRole('dialog').textContent).toMatch(
      /stock stays reduced.*new Guest Session/i
    );
  });
});
it('runs a simulated Test Print through generated calibration and offers inspection', async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return Response.json({
        attemptId: '00000000-0000-4000-8000-000000000002',
        state: requests.length === 1 ? 'Reserved' : 'Confirmed',
      });
    })
  );
  render(
    <OperationsPanel
      event={{
        ...event,
        state: 'Draft',
        stockReserved: 0,
        allowanceReserved: 0,
        eventUnresolved: 0,
      }}
      simulatorEnabled
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connect simulator' }));
  fireEvent.click(screen.getByRole('button', { name: 'Test Print' }));
  await waitFor(() =>
    expect(requests.some((r) => r.observationKind === 'physicalEjectionVerified')).toBe(true)
  );
  expect(requests.some((r) => r.observationKind === 'commandAccepted')).toBe(true);
  expect(screen.getByText(/Inspect the Test Print output/)).toBeTruthy();
});
it('retries a lost observation response with identical metadata and no second reservation', async () => {
  const bodies: Record<string, unknown>[] = [];
  let lose = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      bodies.push(body);
      if (String(url).endsWith('test-attempts'))
        return Response.json({
          attemptId: '00000000-0000-4000-8000-000000000002',
          state: 'Reserved',
        });
      if (lose) {
        lose = false;
        throw new TypeError('Lost response');
      }
      return Response.json({ state: 'Confirmed' });
    })
  );
  render(
    <OperationsPanel
      event={{
        ...event,
        state: 'Draft',
        stockReserved: 0,
        allowanceReserved: 0,
        eventUnresolved: 0,
      }}
      simulatorEnabled
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connect simulator' }));
  fireEvent.click(screen.getByRole('button', { name: 'Test Print' }));
  await screen.findByRole('alert');
  await new Promise((resolve) => setTimeout(resolve, 10));
  fireEvent.click(screen.getByRole('button', { name: 'Test Print' }));
  await screen.findByText(/Inspect the Test Print output/);
  expect(bodies.filter((body) => 'connectionId' in body)).toHaveLength(1);
  expect(bodies[2]).toEqual(bodies[1]);
});
it('keeps setup visible when readiness preparation conflicts, before sign-out', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ code: 'state_conflict' }, { status: 409 }))
  );
  render(
    <OperationsPanel
      event={{
        ...event,
        stockReserved: 0,
        allowanceReserved: 0,
        connectionId: 'c',
        usableTestConnectionIds: ['c'],
        attempts: [
          {
            id: 't',
            kind: 'Test',
            state: 'Confirmed',
            connection_id: 'c',
            test_output_usable: true,
          },
        ],
      }}
      simulatorEnabled
    />
  );
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Resume Booth Mode' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/changed.*Reload/));
});
it('submits stock and allowance effects only after explicit actions', async () => {
  const submitted: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path, options) => {
      submitted.push({ path: String(path), body: JSON.parse(options.body) });
      return Response.json({ entryId: 'entry' });
    })
  );
  render(
    <OperationsPanel
      event={{ ...event, stockReserved: 0, allowanceReserved: 0 }}
      simulatorEnabled
    />
  );
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add guest prints' }));
  await screen.findByRole('status');
  expect(submitted[0].body.quantity).toBe(5);
  fireEvent.change(screen.getByLabelText('Stock reason'), {
    target: { value: 'Counted new sheets' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add Film Stock' }));
  await waitFor(() => expect(submitted).toHaveLength(2));
  expect(submitted[1].body).toMatchObject({ sheets: 5, reason: 'Counted new sheets' });
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Reconcile Film Stock' }) as HTMLButtonElement).disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reconcile Film Stock' }));
  expect(submitted).toHaveLength(2);
  expect(screen.getByRole('dialog').textContent).toMatch(/observed 5 sheets/);
});
it.each(['Draft', 'Live'])(
  'allows Event-local cancellation for %s despite another Event hold',
  (state) => {
    render(
      <OperationsPanel
        event={{ ...event, state, eventUnresolved: 0, allowanceReserved: 0, stockReserved: 1 }}
        simulatorEnabled
      />
    );
    expect(
      (screen.getByRole('button', { name: 'Cancel Event' }) as HTMLButtonElement).disabled
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Reconcile Film Stock' }) as HTMLButtonElement).disabled
    ).toBe(true);
  }
);
it('offers older attempts and derives readiness independently of the displayed page', () => {
  render(
    <OperationsPanel
      event={{
        ...event,
        stockReserved: 0,
        allowanceReserved: 0,
        connectionId: 'c',
        usableTestConnectionIds: ['c'],
        attemptsPage: 0,
        hasOlderAttempts: true,
        attempts: [],
      }}
      simulatorEnabled
    />
  );
  expect(screen.getByRole('link', { name: 'Older print attempts' }).getAttribute('href')).toContain(
    'attemptPage=1'
  );
  fireEvent.click(screen.getByRole('checkbox'));
  expect(
    (screen.getByRole('button', { name: 'Resume Booth Mode' }) as HTMLButtonElement).disabled
  ).toBe(false);
});
it.each(['lost', 'server'])(
  'retains stock addition identity after %s response and an interleaved action',
  async (failure) => {
    const requests: { path: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path, options) => {
        requests.push({ path: String(path), body: JSON.parse(options.body) });
        if (requests.length === 1) {
          if (failure === 'lost') throw new TypeError('Lost response');
          return Response.json({ message: 'Unavailable' }, { status: 503 });
        }
        return Response.json({ entryId: 'entry' });
      })
    );
    render(
      <OperationsPanel
        event={{ ...event, stockReserved: 0, allowanceReserved: 0 }}
        simulatorEnabled
      />
    );
    fireEvent.change(screen.getByLabelText('Stock reason'), {
      target: { value: 'Counted sheets' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Film Stock' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Add guest prints' }));
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Add Film Stock' }));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]).toEqual(requests[0]);
  }
);
it.each(['stock', 'additional'])(
  'retains an explicit %s retry with its original payload after another action and edits',
  async (kind) => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return bodies.length === 1
          ? operationErrorResponse({ message: 'Upstream transport failed' })
          : Response.json({});
      })
    );
    render(<OperationsPanel event={event} simulatorEnabled />);
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Stock reason'), { target: { value: 'New pack' } });
    fireEvent.click(
      screen.getByRole('button', { name: kind === 'stock' ? 'Add Film Stock' : 'Add guest prints' })
    );
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '7' } });
    fireEvent.click(
      screen.getByRole('button', { name: kind === 'stock' ? 'Add guest prints' : 'Add Film Stock' })
    );
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Retry pending operation' }));
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[2]).toEqual(bodies[0]);
  }
);
it.each(['Guest', 'Test'])(
  'offers reasoned Admin recovery for an older %s pending attempt with the printer gate closed',
  (kind) => {
    render(
      <OperationsPanel
        event={{
          ...event,
          attempts: [
            { id: 'older', kind, state: 'Accepted', connection_id: 'c', test_output_usable: null },
          ],
        }}
        simulatorEnabled={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Recover interrupted print' }));
    expect(screen.getByRole('dialog').textContent).toMatch(/holds.*remain/i);
    expect(screen.getByLabelText('Recovery reason')).toBeTruthy();
  }
);

it('keeps Draft booking package-based and blocks zero packages even when inherited setup is ready', () => {
  const readyDraft = {
    ...event,
    state: 'Draft',
    stockReserved: 0,
    allowanceReserved: 0,
    eventUnresolved: 0,
    runState: null,
    connectionId: 'fixture-ready',
    usableTestConnectionIds: ['fixture-ready'],
  };
  const { rerender } = render(
    <OperationsPanel event={readyDraft} simulatorEnabled startDisabled />
  );
  fireEvent.click(
    screen.getByRole('checkbox', { name: /Camera, printer and Guided Access setup checked/ })
  );
  expect(screen.queryByText('Print Allowance · this Event')).toBeNull();
  expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
    true
  );
  expect(screen.getByRole('button', { name: 'Test Print' })).toBeTruthy();
  rerender(<OperationsPanel event={readyDraft} simulatorEnabled startDisabled={false} />);
  expect(screen.getByRole('button', { name: 'Start Booth Mode' }).hasAttribute('disabled')).toBe(
    false
  );
});
