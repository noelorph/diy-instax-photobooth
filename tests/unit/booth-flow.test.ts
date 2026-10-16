import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoothFlow, type BoothTransport } from '@/features/booth/flow';
import { SimulatedPrinter } from '@/features/booth/printer/simulator';
const available = { guestPrints: 3, filmSheets: 5, printerBusy: false };
function setup(outcome: 'accepted' | 'ejected' | 'rejected' | 'uncertain' = 'ejected') {
  const calls: { path: string; body?: Record<string, unknown> }[] = [];
  let active = true,
    busy = false;
  let reserveWait: Promise<void> | undefined;
  const transport: BoothTransport = async (path, body) => {
    calls.push({ path, body });
    if (path.endsWith('observations'))
      return {
        state:
          body?.observationKind === 'commandAccepted'
            ? 'Accepted'
            : body?.observationKind === 'uncertain'
              ? 'Uncertain'
              : body?.observationKind === 'physicalEjectionVerified'
                ? 'Confirmed'
                : 'RejectedUnused',
        availability: available,
      };
    if (!active) throw Object.assign(new Error('denied'), { status: 403 });
    if (path.endsWith('bootstrap'))
      return {
        runId: 'run',
        state: 'Active',
        display: { title: 'Celebration' },
        availability: { ...available, printerBusy: busy },
      };
    if (path.endsWith('/pauses'))
      return {
        runId: 'run',
        state: calls.some((call) => call.path.endsWith('print-attempts'))
          ? 'PauseRequested'
          : 'Paused',
      };
    if (path.endsWith('connection-changes')) {
      active = false;
      return { state: 'Paused' };
    }
    if (path.endsWith('print-attempts')) {
      await reserveWait;
      return {
        attemptId: 'attempt',
        state: 'Reserved',
        availability: { ...available, printerBusy: true },
      };
    }
    if (path.endsWith('captures')) return { captureId: 'capture', captureCount: 1 };
    if (path.endsWith('guest-sessions'))
      return { sessionId: 'session', state: 'Open', availability: available };
    return { state: 'Abandoned', availability: available };
  };
  const printer = new SimulatedPrinter(outcome);
  const flow = new BoothFlow({ transport, printer, storage: sessionStorage });
  return {
    flow,
    printer,
    calls,
    stop: () => {
      active = false;
    },
    busy: () => {
      busy = true;
    },
    waitReservation: (p: Promise<void>) => {
      reserveWait = p;
    },
    transport,
  };
}
async function review(s: ReturnType<typeof setup>) {
  await s.flow.initialize();
  await s.flow.start();
  s.flow.countdown();
  await s.flow.shutter(async () => ({
    bytes: new Uint8Array([91, 82, 73]),
    url: 'blob:private-photo',
    discard: () => {},
  }));
  expect(s.flow.getSnapshot().phase).toBe('review');
}
beforeEach(() => sessionStorage.clear());
describe('Guest controller privacy and recovery', () => {
  it('acknowledges Capture before reserving, sends once, and never exports photo data', async () => {
    const s = setup();
    await review(s);
    await Promise.all([s.flow.print(), s.flow.print()]);
    expect(s.printer.commandCount).toBe(1);
    expect(s.flow.getSnapshot().phase).toBe('confirmed');
    expect(s.calls.findIndex((c) => c.path.endsWith('captures'))).toBeLessThan(
      s.calls.findIndex((c) => c.path.endsWith('print-attempts'))
    );
    const exported = JSON.stringify(s.calls) + JSON.stringify(sessionStorage);
    expect(exported.includes('91,82,73')).toBe(false);
    expect(exported.includes('blob:')).toBe(false);
    expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  });
  it('keeps acceptance printing until a real outcome or uncertainty timeout', async () => {
    const s = setup('accepted');
    await review(s);
    await s.flow.print();
    expect(s.flow.getSnapshot().phase).toBe('printing');
    expect(s.flow.getSnapshot().message).toMatch(/eject/);
    await s.flow.printTimedOut();
    expect(s.flow.getSnapshot().phase).toBe('uncertain');
    expect(s.printer.commandCount).toBe(1);
  });
  it('returns a clear rejection to review and requires a new Print tap', async () => {
    const s = setup('rejected');
    await review(s);
    await s.flow.print();
    expect(s.flow.getSnapshot().phase).toBe('review');
    expect(s.printer.commandCount).toBe(1);
    expect(s.flow.getSnapshot().photoUrl).toBe('blob:private-photo');
    await s.flow.refresh();
    expect(s.printer.commandCount).toBe(1);
  });
  it('discards a rejected photo if Active readiness was lost', async () => {
    const s = setup('rejected');
    await review(s);
    s.stop();
    await s.flow.print();
    expect(s.printer.commandCount).toBe(0);
    expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  });
  it('reload after reservation reports uncertainty and never sends again', async () => {
    const s = setup('accepted');
    await review(s);
    await s.flow.print();
    const nextPrinter = new SimulatedPrinter();
    const next = new BoothFlow({
      transport: s.transport,
      printer: nextPrinter,
      storage: sessionStorage,
    });
    await next.initialize();
    expect(next.getSnapshot().phase).toBe('uncertain');
    expect(nextPrinter.commandCount).toBe(0);
    expect(s.calls.at(-1)?.body?.observationKind).toBe('uncertain');
  });
  it('missing metadata with a busy printer stops through connection-changes', async () => {
    const s = setup();
    s.busy();
    await s.flow.initialize();
    expect(s.calls.at(-1)?.path).toBe('/api/booth/connection-changes');
    expect(s.printer.commandCount).toBe(0);
  });
  it('reconnect while a reservation response is pending closes the send barrier synchronously', async () => {
    const s = setup();
    await review(s);
    let release!: () => void;
    s.waitReservation(
      new Promise<void>((r) => {
        release = r;
      })
    );
    const printing = s.flow.print();
    await vi.waitFor(() =>
      expect(s.calls.some((c) => c.path.endsWith('print-attempts'))).toBe(true)
    );
    await s.flow.connectionChanged();
    release();
    await printing;
    expect(s.printer.commandCount).toBe(0);
    expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
    expect(
      s.calls.some(
        (c) => c.path.endsWith('observations') && c.body?.observationKind === 'uncertain'
      )
    ).toBe(true);
  });
  it('reports uncertain on the known attempt when Admin pause wins reconnect', async () => {
    const s = setup('accepted');
    await review(s);
    await s.flow.print();
    s.stop();
    await s.flow.connectionChanged();
    expect(s.calls.at(-1)?.body?.observationKind).toBe('uncertain');
    expect(s.printer.commandCount).toBe(1);
  });
  it('remote stop before shutter records no Capture', async () => {
    const s = setup();
    await s.flow.initialize();
    await s.flow.start();
    s.flow.countdown();
    s.stop();
    await s.flow.refresh();
    const capture = vi.fn();
    await s.flow.shutter(capture);
    expect(capture).not.toHaveBeenCalled();
    expect(s.calls.some((c) => c.path.endsWith('captures'))).toBe(false);
  });
  it('stop after shutter preserves Capture metadata but discards the encoded photo', async () => {
    const s = setup();
    await s.flow.initialize();
    await s.flow.start();
    s.flow.countdown();
    let release!: (p: { bytes: Uint8Array; url: string; discard: () => void }) => void;
    const capture = s.flow.shutter(
      () =>
        new Promise((r) => {
          release = r;
        })
    );
    await vi.waitFor(() => expect(s.calls.some((c) => c.path.endsWith('captures'))).toBe(true));
    s.stop();
    await s.flow.refresh();
    const discard = vi.fn();
    release({ bytes: new Uint8Array([1]), url: 'blob:x', discard });
    await capture;
    expect(discard).toHaveBeenCalledOnce();
    expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  });
  it('invalid grants reveal no Event name', async () => {
    const s = setup();
    s.stop();
    await s.flow.initialize();
    expect(s.flow.getSnapshot().phase).toBe('paused');
    expect(s.flow.getSnapshot().title).toBeUndefined();
  });
  it('network loss before reservation holds the photo and recovery requires another Print tap', async () => {
    const s = setup();
    await review(s);
    s.flow.offline();
    expect(s.flow.getSnapshot().phase).toBe('connection-hold');
    await s.flow.online();
    expect(s.flow.getSnapshot().phase).toBe('review');
    expect(s.printer.commandCount).toBe(0);
  });
});
it('protected pause waits for a pending printer result without reporting uncertainty', async () => {
  const s = setup('accepted');
  await review(s);
  await s.flow.print();
  await s.flow.requestPause();
  expect(s.flow.getSnapshot().phase).toBe('printing');
  expect(s.calls.some((c) => c.body?.observationKind === 'uncertain')).toBe(false);
  expect(s.calls.some((c) => c.path.endsWith('/pauses'))).toBe(true);
});
it('reload replays a lost reservation response with its original key, then reports uncertainty', async () => {
  const s = setup();
  await review(s);
  const journal = JSON.parse(sessionStorage.getItem('booth-operation')!);
  const operationKey = crypto.randomUUID();
  journal.reservation = { operationKey, runId: 'run', captureId: 'capture' };
  sessionStorage.setItem('booth-operation', JSON.stringify(journal));
  const printer = new SimulatedPrinter();
  const reloaded = new BoothFlow({ transport: s.transport, printer, storage: sessionStorage });
  await reloaded.initialize();
  expect(s.calls.find((c) => c.path.endsWith('print-attempts'))?.body?.operationKey).toBe(
    operationKey
  );
  expect(s.calls.at(-1)?.body?.observationKind).toBe('uncertain');
  expect(printer.commandCount).toBe(0);
});
it('normal pause during a pending send lets final ejection settle without acceptance reporting', async () => {
  const s = setup();
  let finish!: (value: import('@/features/booth/printer/contract').PrinterObservation[]) => void;
  const printer = {
    sendOnce: () =>
      new Promise<import('@/features/booth/printer/contract').PrinterObservation[]>((r) => {
        finish = r;
      }),
  };
  const flow = new BoothFlow({ transport: s.transport, printer, storage: sessionStorage });
  await review({ ...s, flow });
  const printing = flow.print();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await flow.requestPause();
  expect(flow.getSnapshot().phase).toBe('printing');
  finish([
    { attemptId: 'attempt', monotonicMs: 1, kind: 'commandAccepted' },
    { attemptId: 'attempt', monotonicMs: 2, kind: 'physicalEjectionVerified' },
  ]);
  await printing;
  expect(flow.getSnapshot().phase).toBe('paused');
  expect(
    s.calls.filter((c) => c.path.endsWith('observations')).map((c) => c.body?.observationKind)
  ).toEqual(['physicalEjectionVerified']);
});
it('a temporary service failure before reservation recovers via checks without automatically printing', async () => {
  const s = setup();
  await review(s);
  s.flow.offline();
  await s.flow.refresh();
  expect(s.flow.getSnapshot().phase).toBe('review');
  expect(s.printer.commandCount).toBe(0);
});
it('a pause that races command acknowledgement still allows the pending final ejection report', async () => {
  const s = setup();
  const flow = new BoothFlow({
    storage: sessionStorage,
    printer: s.printer,
    transport: async (path, body) => {
      if (body?.observationKind === 'commandAccepted')
        throw Object.assign(new Error('pause won'), { status: 409 });
      return s.transport(path, body);
    },
  });
  await review({ ...s, flow });
  await flow.print();
  expect(s.calls.some((c) => c.body?.observationKind === 'physicalEjectionVerified')).toBe(true);
  expect(s.calls.some((c) => c.body?.observationKind === 'uncertain')).toBe(false);
  expect(flow.getSnapshot().phase).toBe('paused');
});
it('clear rejection with lost readiness requests protected pause and discards the photo', async () => {
  const s = setup('rejected');
  let rejected = false;
  const flow = new BoothFlow({
    storage: sessionStorage,
    printer: s.printer,
    transport: async (path, body) => {
      const result = await s.transport(path, body);
      if (body?.observationKind === 'preFilmRejected') rejected = true;
      if (rejected && path.endsWith('bootstrap'))
        return { ...result, availability: { guestPrints: 0, filmSheets: 5, printerBusy: false } };
      return result;
    },
  });
  await review({ ...s, flow });
  await flow.print();
  expect(s.calls.some((c) => c.path.endsWith('/pauses'))).toBe(true);
  expect(flow.getSnapshot().photoUrl).toBeUndefined();
  expect(s.printer.commandCount).toBe(1);
});
it('offline then online while reservation is pending never revives the interrupted Print tap', async () => {
  const s = setup();
  await review(s);
  let release!: () => void;
  s.waitReservation(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  const printing = s.flow.print();
  await vi.waitFor(() => expect(s.calls.some((c) => c.path.endsWith('print-attempts'))).toBe(true));
  s.flow.offline();
  const recovery = s.flow.online();
  release();
  await Promise.all([printing, recovery]);
  expect(s.printer.commandCount).toBe(0);
  expect(s.calls.some((c) => c.body?.observationKind === 'knownUnsent')).toBe(true);
});
it('an explicit new Admin handoff starts its new run without replaying the prior run journal', async () => {
  sessionStorage.setItem(
    'booth-operation',
    JSON.stringify({ runId: 'old-run', attemptId: 'old-attempt', sessionId: 'old-session' })
  );
  const s = setup();
  const flow = new BoothFlow({
    storage: sessionStorage,
    printer: s.printer,
    transport: async (path, body) => {
      if (path.endsWith('handoffs/confirm')) return { state: 'Active', runId: 'run' };
      return s.transport(path, body);
    },
  });
  await flow.initialize('new-handoff');
  expect(flow.getSnapshot().phase).toBe('welcome');
  expect(s.calls.some((c) => c.path.includes('old-attempt'))).toBe(false);
});

it.each(['welcome', 'preview', 'countdown'] as const)(
  'recovers %s after network interruption without firing a shutter',
  async (phase) => {
    const s = setup();
    await s.flow.initialize();
    if (phase !== 'welcome') await s.flow.start();
    if (phase === 'countdown') s.flow.countdown();
    s.flow.offline();
    await s.flow.online();
    expect(s.flow.getSnapshot().phase).toBe(phase === 'welcome' ? 'welcome' : 'preview');
    expect(s.calls.filter((c) => c.path.endsWith('/captures'))).toHaveLength(0);
    if (phase === 'countdown') {
      s.flow.countdown();
      expect(s.flow.getSnapshot().phase).toBe('countdown');
    }
  }
);

it('owns and discards the pending photo when Capture journal storage fails', async () => {
  const s = setup();
  let fail = false;
  const flow = new BoothFlow({
    transport: s.transport,
    printer: s.printer,
    storage: {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        if (fail) throw new Error('storage unavailable');
      },
    },
  });
  await flow.initialize();
  await flow.start();
  flow.countdown();
  fail = true;
  const discard = vi.fn();
  let finish!: (photo: { bytes: Uint8Array; url: string; discard: () => void }) => void;
  const photo = new Promise<{ bytes: Uint8Array; url: string; discard: () => void }>((resolve) => {
    finish = resolve;
  });
  const shutter = flow.shutter(() => photo);
  await vi.waitFor(() => expect(flow.getSnapshot().phase).toBe('paused'));
  finish({ bytes: new Uint8Array(), url: 'blob:ephemeral', discard });
  await shutter;
  await vi.waitFor(() => expect(discard).toHaveBeenCalledOnce());
  expect(s.calls.filter((c) => c.path.endsWith('/captures'))).toHaveLength(0);
  expect(flow.getSnapshot().photoUrl).toBeUndefined();
});

it.each(['before-draw', 'encoding'] as const)(
  'counts only a completed shutter when failure occurs during %s',
  async (failure) => {
    const s = setup();
    await s.flow.initialize();
    await s.flow.start();
    s.flow.countdown();
    await s.flow.shutter(() => {
      if (failure === 'before-draw') throw new Error('Camera unavailable or draw failed');
      return Promise.reject(new Error('Encoding failed after draw'));
    });
    expect(s.calls.filter((c) => c.path.endsWith('/captures'))).toHaveLength(
      failure === 'encoding' ? 1 : 0
    );
    expect(s.calls.filter((c) => c.path.endsWith('/print-attempts'))).toHaveLength(0);
    expect(s.flow.getSnapshot().photoUrl).toBeUndefined();
  }
);

it('does not resume pre-photo work until readiness is authoritative', async () => {
  const s = setup();
  await s.flow.initialize();
  await s.flow.start();
  s.flow.offline();
  s.busy();
  await s.flow.online();
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
  s.flow.countdown();
  expect(s.flow.getSnapshot().phase).toBe('unavailable');
});

it('settles an encoding rejection even when Capture journal storage throws', async () => {
  const s = setup();
  let fail = false;
  const flow = new BoothFlow({
    transport: s.transport,
    printer: s.printer,
    storage: {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        if (fail) throw new Error('storage unavailable');
      },
    },
  });
  await flow.initialize();
  await flow.start();
  flow.countdown();
  fail = true;
  await flow.shutter(() => Promise.reject(new Error('encoding failed')));
  expect(flow.getSnapshot().phase).toBe('paused');
  expect(s.calls.filter((c) => c.path.endsWith('/captures'))).toHaveLength(0);
});

it('keeps the proof available while a fired shutter awaits its late Capture acknowledgement', async () => {
  const s = setup();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captureStarted = false;
  let bootstrapAfterShutter = 0;
  const flow = new BoothFlow({
    printer: s.printer,
    storage: sessionStorage,
    transport: async (path, body) => {
      if (path.endsWith('/captures')) {
        captureStarted = true;
        await pending;
        return { captureId: 'capture', sessionState: 'Abandoned' };
      }
      if (path.endsWith('/bootstrap') && captureStarted) bootstrapAfterShutter++;
      return s.transport(path, body);
    },
  });
  await flow.initialize();
  await flow.start();
  flow.countdown();
  const discard = vi.fn();
  const shutter = flow.shutter(async () => ({
    bytes: new Uint8Array(),
    url: 'blob:temporary',
    discard,
  }));
  await vi.waitFor(() => expect(captureStarted).toBe(true));
  await flow.refresh();
  expect(bootstrapAfterShutter).toBe(0);
  release();
  await shutter;
  expect(discard).toHaveBeenCalledOnce();
  expect(flow.getSnapshot().phase).toBe('paused');
  expect(flow.getSnapshot().photoUrl).toBeUndefined();
  await flow.print();
  expect(s.printer.commandCount).toBe(0);
});

it.each(['pause', 'reconnect'] as const)(
  'settles shutter metadata before %s can clear its proof',
  async (action) => {
    const s = setup();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const flow = new BoothFlow({
      printer: s.printer,
      storage: sessionStorage,
      transport: async (path, body) => {
        calls.push(path);
        if (path.endsWith('/captures')) {
          await pending;
          return { captureId: 'capture' };
        }
        return s.transport(path, body);
      },
    });
    await flow.initialize();
    await flow.start();
    flow.countdown();
    const discard = vi.fn();
    const shutter = flow.shutter(async () => ({
      bytes: new Uint8Array(),
      url: 'blob:temporary',
      discard,
    }));
    await vi.waitFor(() => expect(calls.some((path) => path.endsWith('/captures'))).toBe(true));
    const stop = action === 'pause' ? flow.requestPause() : flow.connectionChanged();
    expect(flow.getSnapshot().phase).toBe(action === 'pause' ? 'pausing' : 'paused');
    expect(
      calls.filter((path) => path.endsWith('/pauses') || path.endsWith('/connection-changes'))
    ).toHaveLength(0);
    release();
    await Promise.all([shutter, stop]);
    expect(discard).toHaveBeenCalledOnce();
    expect(calls.filter((path) => path.endsWith('/captures'))).toHaveLength(1);
    expect(
      calls.filter((path) => path.endsWith(action === 'pause' ? '/pauses' : '/connection-changes'))
    ).toHaveLength(1);
  }
);

it('reload recovers a queued late Capture before any revoked bootstrap or abandonment', async () => {
  sessionStorage.setItem(
    'booth-operation',
    JSON.stringify({
      runId: 'run',
      sessionId: 'session',
      capture: { operationKey: 'stable', capturedAt: '2026-10-16T12:00:00Z' },
    })
  );
  const calls: { path: string; body?: Record<string, unknown> }[] = [];
  const flow = new BoothFlow({
    printer: new SimulatedPrinter(),
    storage: sessionStorage,
    transport: async (path, body) => {
      calls.push({ path, body });
      return { captureId: 'capture', sessionState: 'Abandoned' };
    },
  });
  await flow.initialize();
  expect(calls).toHaveLength(1);
  expect(calls[0].body?.operationKey).toBe('stable');
  expect(flow.getSnapshot().phase).toBe('paused');
  expect(sessionStorage.getItem('booth-operation')).not.toContain('capturedAt');
});

it('retries queued metadata after a lost late acknowledgement using its original key', async () => {
  const s = setup();
  let failures = 1;
  const inputs: Record<string, unknown>[] = [];
  const flow = new BoothFlow({
    printer: s.printer,
    storage: sessionStorage,
    transport: async (path, body) => {
      if (path.endsWith('/captures')) {
        inputs.push(body!);
        if (failures-- > 0) throw new Error('connection lost after commit');
        return { captureId: 'capture', sessionState: 'Abandoned' };
      }
      return s.transport(path, body);
    },
  });
  await flow.initialize();
  await flow.start();
  flow.countdown();
  const discard = vi.fn();
  await flow.shutter(async () => ({ bytes: new Uint8Array(), url: 'blob:temporary', discard }));
  await flow.online();
  expect(inputs).toHaveLength(2);
  expect(inputs[1]).toEqual(inputs[0]);
  expect(discard).toHaveBeenCalledOnce();
  expect(flow.getSnapshot().phase).toBe('paused');
  expect(s.printer.commandCount).toBe(0);
});

it('serializes concurrent readiness polls before allowing the shutter', async () => {
  const s = setup();
  let hold = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let polls = 0;
  const flow = new BoothFlow({
    printer: s.printer,
    storage: sessionStorage,
    transport: async (path, body) => {
      if (path.endsWith('/bootstrap') && hold) {
        polls++;
        await pending;
      }
      return s.transport(path, body);
    },
  });
  await flow.initialize();
  await flow.start();
  flow.countdown();
  hold = true;
  const poll = flow.refresh();
  const capture = vi.fn(async () => ({
    bytes: new Uint8Array(),
    url: 'blob:temporary',
    discard: () => {},
  }));
  const shutter = flow.shutter(capture);
  expect(polls).toBe(1);
  expect(capture).not.toHaveBeenCalled();
  release();
  await Promise.all([poll, shutter]);
  expect(capture).toHaveBeenCalledOnce();
});

it('poll recovery of a lost reservation response completes without a recursive readiness wait', async () => {
  const s = setup();
  let failures = 1;
  const flow = new BoothFlow({
    printer: s.printer,
    storage: sessionStorage,
    transport: async (path, body) => {
      if (path.endsWith('/print-attempts') && failures-- > 0) throw new Error('response lost');
      return s.transport(path, body);
    },
  });
  await flow.initialize();
  await flow.start();
  flow.countdown();
  await flow.shutter(async () => ({
    bytes: new Uint8Array(),
    url: 'blob:temporary',
    discard: () => {},
  }));
  await flow.print();
  expect(flow.getSnapshot().phase).toBe('connection-hold');
  let complete = false;
  void flow.refresh().then(() => {
    complete = true;
  });
  await vi.waitFor(() => expect(complete).toBe(true));
  expect(flow.getSnapshot().phase).toBe('review');
  expect(s.printer.commandCount).toBe(0);
});

it('retries failed Capture metadata through polling before any cookie-clearing bootstrap', async () => {
  const s = setup();
  let failures = 1;
  const inputs: Record<string, unknown>[] = [];
  const flow = new BoothFlow({
    printer: s.printer,
    storage: sessionStorage,
    transport: async (path, body) => {
      if (path.endsWith('/captures')) {
        inputs.push(body!);
        if (failures-- > 0) throw new Error('temporary service failure');
        return { captureId: 'capture', sessionState: 'Abandoned' };
      }
      return s.transport(path, body);
    },
  });
  await flow.initialize();
  await flow.start();
  flow.countdown();
  await flow.shutter(async () => ({
    bytes: new Uint8Array(),
    url: 'blob:temporary',
    discard: () => {},
  }));
  await flow.refresh();
  expect(inputs).toHaveLength(2);
  expect(inputs[1]).toEqual(inputs[0]);
  expect(flow.getSnapshot().phase).toBe('paused');
});
it('a failed pause while sending does not claim committed pause after ejection', async () => {
  const s = setup();
  let finish!: (value: import('@/features/booth/printer/contract').PrinterObservation[]) => void;
  const flow = new BoothFlow({
    storage: sessionStorage,
    printer: {
      sendOnce: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    transport: async (path, body) => {
      if (path.endsWith('/pauses')) throw new TypeError('Response lost');
      return s.transport(path, body);
    },
  });
  await review({ ...s, flow });
  const printing = flow.print();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await flow.requestPause();
  expect(flow.getSnapshot().phase).toBe('pause-retry');
  finish([{ attemptId: 'attempt', monotonicMs: 2, kind: 'physicalEjectionVerified' }]);
  await printing;
  expect(flow.getSnapshot().phase).toBe('pause-retry');
});
