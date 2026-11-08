import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  connectMiniLink3,
  type PrinterConnection,
} from '@/features/qualification/instax/bluetooth';
import { MiniLink3PrinterV2 } from '@/features/booth/printer/mini-link3-v2';
import type { PrinterObservationV2 } from '@/features/booth/printer/contract-v2';
import { activePrint, instaxStatus, knownEmptyError } from '../fixtures/instax-responses';
vi.mock('@/features/qualification/instax/bluetooth', () => ({ connectMiniLink3: vi.fn() }));
const jpeg = () =>
  new Uint8Array(readFileSync('src/features/qualification/fixtures/baseline-600x800.jpg'));
const grant = {
  attemptId: 'attempt',
  dispatchId: 'dispatch',
  printerId: 'device',
  connectionGeneration: 1,
};
const owned: MiniLink3PrinterV2[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  for (const p of owned.splice(0)) await p.disconnect();
  vi.useRealTimers();
  vi.resetAllMocks();
});
function setup() {
  let status = instaxStatus();
  let fail: number | undefined;
  const calls: number[] = [];
  const connection: PrinterConnection = {
    deviceId: 'device',
    modelNumber: 'FI033',
    firmwareRevision: '0102',
    disconnect: vi.fn(async () => {}),
    exchange: vi.fn(async (opcode, payload) => {
      calls.push(opcode);
      if (opcode === fail) throw Error('transport retired');
      if (opcode === 2 && payload?.[0] === 0)
        return { opcode, payload: new Uint8Array([0, 0, 2, 88, 3, 32]) };
      if (opcode === 2 && payload?.[0] === 2) return status;
      if (opcode === 2 && payload?.[0] === 3)
        return { opcode, payload: new Uint8Array([0, 3, 0, 0, 1, 2, 0, 0, 0, 3]) };
      return { opcode, payload: new Uint8Array([0]) };
    }),
  };
  vi.mocked(connectMiniLink3).mockResolvedValue(connection);
  const printer = new MiniLink3PrinterV2({ requestDevice: vi.fn() });
  owned.push(printer);
  const events: PrinterObservationV2[] = [];
  printer.observe((e) => events.push(e));
  return {
    printer,
    connection,
    calls,
    events,
    setStatus: (s: ReturnType<typeof instaxStatus>) => {
      status = s;
    },
    failAt: (opcode: number) => {
      fail = opcode;
    },
  };
}
async function send(f: ReturnType<typeof setup>, image = jpeg()) {
  const pending = f.printer.sendOnce(grant, image);
  await vi.advanceTimersByTimeAsync(10_000);
  await pending;
}
it.each([
  ['deviceId', null],
  ['deviceId', 'other'],
  ['modelNumber', 'OTHER'],
  ['firmwareRevision', '0103'],
])('rejects unsupported identity %s=%s', async (key, value) => {
  const f = setup();
  Object.assign(f.connection, { [key!]: value });
  await expect(f.printer.connect('device')).rejects.toThrow();
  expect(f.events).toEqual([]);
});
it('coalesces connect and returns cached status with actual age', async () => {
  const f = setup();
  await Promise.all([f.printer.connect(), f.printer.connect()]);
  expect(connectMiniLink3).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  const count = f.calls.length;
  expect((await f.printer.readReadiness()).observedAgeMs).toBe(100);
  expect(f.calls).toHaveLength(count);
});
it.each(['00022900000b00000000', '00023000000b00000000'])(
  'requires active then idle independently of count (%s)',
  async (terminal) => {
    const f = setup();
    await f.printer.connect();
    await send(f);
    expect(f.events.filter((e) => e.kind === 'command_accepted')).toHaveLength(1);
    expect(f.events.some((e) => e.kind === 'full_ejection_confirmed')).toBe(false);
    f.setStatus(activePrint());
    await vi.advanceTimersByTimeAsync(900);
    f.setStatus(instaxStatus(terminal));
    await vi.advanceTimersByTimeAsync(900);
    expect(f.events.filter((e) => e.kind === 'full_ejection_confirmed')).toHaveLength(1);
    expect(f.events.some((e) => e.kind === 'ready_for_new_job')).toBe(false);
    await vi.advanceTimersByTimeAsync(900);
    expect(f.events.filter((e) => e.kind === 'ready_for_new_job')).toHaveLength(1);
    expect((await f.printer.readReadiness()).oldJobCleared).toBe(true);
    await f.printer.sendOnce(grant, jpeg());
    expect(f.calls.filter((c) => c === 0x1080)).toHaveLength(1);
    expect(new Set(f.events.map((e) => e.observationId)).size).toBe(f.events.length);
    expect(f.events.find((e) => e.kind === 'full_ejection_confirmed')).toMatchObject({
      ...grant,
      evidenceVersion: 'instax-fi033-0102-dev-v1',
    });
  }
);
it('known empty never releases the attempt and expires at 60 seconds', async () => {
  const f = setup();
  await f.printer.connect();
  await send(f);
  f.setStatus(activePrint());
  await vi.advanceTimersByTimeAsync(900);
  f.setStatus(knownEmptyError());
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.events.some((e) => e.kind === 'full_ejection_confirmed')).toBe(false);
  expect(f.events.some((e) => e.kind === 'definitely_not_sent')).toBe(false);
  expect(f.events.some((e) => e.kind === 'outcome_unknown')).toBe(true);
  expect((await f.printer.readReadiness()).oldJobCleared).toBe(false);
  await f.printer.sendOnce(grant, jpeg());
  expect(f.calls.filter((c) => c === 0x1080)).toHaveLength(1);
});
it('expires an uninterrupted idle-only observation at exactly 60000ms', async () => {
  const f = setup();
  await f.printer.connect();
  const p = f.printer.sendOnce(grant, jpeg());
  while (!f.events.some((e) => e.kind === 'command_accepted'))
    await vi.advanceTimersByTimeAsync(50);
  await p;
  await vi.advanceTimersByTimeAsync(59_999);
  expect(f.events.some((e) => e.kind === 'outcome_unknown')).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.events.filter((e) => e.kind === 'outcome_unknown')).toHaveLength(1);
});
it.each([0, 0x1000, 0x1001, 0x1080])(
  'treats transport failure at opcode %s as unknown without retry',
  async (opcode) => {
    const f = setup();
    await f.printer.connect();
    f.failAt(opcode);
    await send(f);
    expect(f.events.some((e) => e.kind === 'definitely_not_sent')).toBe(false);
    expect(f.events.some((e) => e.kind === 'outcome_unknown')).toBe(true);
    expect((await f.printer.readReadiness()).connected).toBe(false);
    await f.printer.sendOnce(grant, jpeg());
    expect(f.calls.filter((c) => c === 0x1080).length).toBeLessThanOrEqual(1);
  }
);
it.each([activePrint, knownEmptyError, () => instaxStatus('0002')])(
  'invalidates safety after completion and reconnect never restores it',
  async (bad) => {
    const f = setup();
    await f.printer.connect();
    await send(f);
    f.setStatus(activePrint());
    await vi.advanceTimersByTimeAsync(900);
    f.setStatus(instaxStatus());
    await vi.advanceTimersByTimeAsync(1800);
    f.setStatus(bad());
    await vi.advanceTimersByTimeAsync(900);
    expect((await f.printer.readReadiness()).oldJobCleared).toBe(false);
    const callback = vi.mocked(connectMiniLink3).mock.calls[0][1];
    callback.onDisconnect();
    expect(f.connection.disconnect).toHaveBeenCalledOnce();
    f.setStatus(instaxStatus());
    await f.printer.connect('device');
    callback.onDisconnect();
    expect((await f.printer.readReadiness()).connected).toBe(true);
    expect((await f.printer.readReadiness()).oldJobCleared).toBe(false);
    expect(f.events.filter((e) => e.kind === 'full_ejection_confirmed')).toHaveLength(1);
  }
);
it('proves invalid JPEG unsent, consumes dispatch and resumes polling', async () => {
  const f = setup();
  await f.printer.connect();
  await f.printer.sendOnce(grant, new Uint8Array());
  expect(f.events.some((e) => e.kind === 'definitely_not_sent')).toBe(true);
  expect((await f.printer.readReadiness()).oldJobCleared).toBe(true);
  await f.printer.sendOnce(grant, jpeg());
  expect(f.calls.filter((c) => c === 0x1080)).toHaveLength(0);
});
it('teardown suppresses callbacks and stops polls', async () => {
  const f = setup();
  await f.printer.connect();
  await send(f);
  await f.printer.disconnect();
  const count = f.events.length;
  const calls = f.calls.length;
  vi.mocked(connectMiniLink3).mock.calls[0][1].onDisconnect();
  await vi.advanceTimersByTimeAsync(70_000);
  expect(f.events).toHaveLength(count);
  expect(f.calls).toHaveLength(calls);
});
it('waits for an in-flight poll before send and never overlaps exchanges', async () => {
  const f = setup();
  await f.printer.connect();
  const original = vi.mocked(f.connection.exchange).getMockImplementation()!;
  let release!: () => void;
  let busy = false;
  let overlap = false;
  vi.mocked(f.connection.exchange).mockImplementationOnce(async (...args) => {
    busy = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    busy = false;
    return original(...args);
  });
  await vi.advanceTimersByTimeAsync(900);
  const image = jpeg();
  const p = f.printer.sendOnce(grant, image);
  await f.printer.readReadiness();
  await vi.advanceTimersByTimeAsync(1800);
  expect(f.calls.filter((c) => c === 0x1000)).toHaveLength(0);
  const delegate = f.connection.exchange;
  vi.mocked(f.connection.exchange).mockImplementation(async (...args) => {
    overlap ||= busy;
    return original(...args);
  });
  release();
  await vi.advanceTimersByTimeAsync(10_000);
  await p;
  expect(overlap).toBe(false);
  expect(delegate).toBeDefined();
  expect(f.calls.filter((c) => c === 0x1080)).toHaveLength(1);
});
it.each([0, 0x1001, 0x1080, 2])(
  'ignores late successful exchanges after disconnect at %s',
  async (opcode) => {
    const f = setup();
    await f.printer.connect();
    const original = vi.mocked(f.connection.exchange).getMockImplementation()!;
    let release!: () => void;
    vi.mocked(f.connection.exchange).mockImplementation(async (...args) => {
      if (args[0] === opcode)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return original(...args);
    });
    const image = jpeg();
    const before = image.slice();
    const pending = f.printer.sendOnce(grant, image);
    while (!release) await vi.advanceTimersByTimeAsync(50);
    vi.mocked(connectMiniLink3).mock.calls[0][1].onDisconnect();
    expect(image).toEqual(before);
    release();
    await vi.advanceTimersByTimeAsync(70_000);
    await pending;
    expect(f.events.some((e) => e.kind === 'outcome_unknown')).toBe(true);
    expect(f.events.some((e) => e.kind === 'full_ejection_confirmed')).toBe(false);
    expect(f.events.some((e) => e.kind === 'definitely_not_sent')).toBe(false);
  }
);
it('refuses an authorized send on stale readiness without entering transport', async () => {
  const f = setup();
  await f.printer.connect();
  let release!: () => void;
  const original = vi.mocked(f.connection.exchange).getMockImplementation()!;
  vi.mocked(f.connection.exchange).mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return original(...args);
  });
  await vi.advanceTimersByTimeAsync(5001);
  const pending = f.printer.sendOnce(grant, jpeg());
  const outcome = pending.then(
    () => 'sent',
    () => 'refused'
  );
  release();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await outcome).toBe('refused');
  expect(f.calls.filter((c) => c === 0x1080)).toHaveLength(0);
});
it('rechecks a poll that becomes unavailable while the authorized send waits', async () => {
  const f = setup();
  await f.printer.connect();
  const original = vi.mocked(f.connection.exchange).getMockImplementation()!;
  let release!: () => void;
  vi.mocked(f.connection.exchange).mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return original(...args);
  });
  await vi.advanceTimersByTimeAsync(900);
  const pending = f.printer.sendOnce(grant, jpeg());
  f.setStatus(knownEmptyError());
  release();
  await vi.advanceTimersByTimeAsync(10_000);
  await pending;
  expect(f.events.some((e) => e.kind === 'definitely_not_sent')).toBe(true);
  expect(f.calls.filter((c) => c === 0x1080)).toHaveLength(0);
});
it('crosses the send barrier synchronously for concurrent callers', async () => {
  const f = setup();
  await f.printer.connect();
  const pending = Promise.all([
    f.printer.sendOnce(grant, jpeg()),
    f.printer.sendOnce(grant, jpeg()),
  ]);
  await vi.advanceTimersByTimeAsync(10_000);
  await pending;
  expect(f.calls.filter((c) => c === 0x1080)).toHaveLength(1);
});
it('invalidates observation when a polling exchange retires without disconnect callback', async () => {
  const f = setup();
  await f.printer.connect();
  await send(f);
  f.failAt(2);
  await vi.advanceTimersByTimeAsync(900);
  expect((await f.printer.readReadiness()).connected).toBe(false);
  expect(f.events.filter((e) => e.kind === 'outcome_unknown')).toHaveLength(1);
  const count = f.calls.length;
  await vi.advanceTimersByTimeAsync(70_000);
  expect(f.calls).toHaveLength(count);
});
it('explicit disconnect permanently retires the physical owner', async () => {
  const f = setup();
  await f.printer.connect();
  await f.printer.disconnect();
  await expect(f.printer.connect()).rejects.toThrow('disposed');
});
