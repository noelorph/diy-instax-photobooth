import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrinterConnection } from './bluetooth';
import { INSTAX_OPCODES, type InstaxOpcode, type InstaxResponse } from './protocol';
import {
  preflightPrinter,
  sendTrialPrint,
  startStatusObservation,
  type PrintPhase,
} from './session';

const validJpeg = new Uint8Array(
  readFileSync('src/features/qualification/fixtures/baseline-600x800.jpg')
);
const frameOffset = validJpeg.findIndex(
  (byte, index) => byte === 0xff && validJpeg[index + 1] === 0xc0
);
function connection(options: { failAt?: number; failOpcode?: number; film?: number } = {}) {
  const calls: { opcode: number; payload: Uint8Array }[] = [];
  const fake: PrinterConnection = {
    modelNumber: 'FI033',
    firmwareRevision: '1.2.3',
    disconnect: vi.fn(async () => undefined),
    async exchange(opcode: InstaxOpcode, payload = new Uint8Array()) {
      calls.push({ opcode, payload });
      if (calls.length === options.failAt || opcode === options.failOpcode)
        throw new Error('printer disconnected');
      if (opcode === INSTAX_OPCODES.supportFunctionInfo && payload[0] === 0)
        return { opcode, payload: new Uint8Array([0, 0, 2, 88, 3, 32]) };
      if (opcode === INSTAX_OPCODES.supportFunctionInfo && payload[0] === 2)
        return { opcode, payload: new Uint8Array([0, 2, options.film ?? 3]) };
      return { opcode, payload: new Uint8Array([0]) };
    },
  };
  return { fake, calls };
}
async function sendWithTimers(
  fake: PrinterConnection,
  onPhase: (phase: PrintPhase) => void = vi.fn(),
  jpeg = validJpeg
) {
  vi.useFakeTimers();
  const result = sendTrialPrint(fake, jpeg, onPhase);
  await vi.runAllTimersAsync();
  return result;
}
afterEach(() => vi.useRealTimers());

describe('supervised print session', () => {
  it('preflightChecksImageAndFilm', async () => {
    const good = connection();
    await expect(preflightPrinter(good.fake)).resolves.toEqual({ filmRemaining: 3 });
    expect(good.calls.map((call) => call.opcode)).toEqual([0, 2, 2]);
    await expect(preflightPrinter(connection({ film: 0 }).fake)).rejects.toThrow('film');
  });

  it('allows an empty connection for reload diagnostics but still blocks dispatch', async () => {
    const { fake, calls } = connection({ film: 0 });
    await expect(preflightPrinter(fake, true)).resolves.toEqual({ filmRemaining: 0 });
    expect(await sendWithTimers(fake)).toMatchObject({ kind: 'rejected-before-command' });
    expect(calls.every(({ opcode }) => opcode === 0 || opcode === 2)).toBe(true);
  });

  it('uploadsThenPrintsOnce', async () => {
    const { fake, calls } = connection();
    const phases: string[] = [];
    expect(await sendWithTimers(fake, (phase) => phases.push(phase))).toEqual({ kind: 'accepted' });
    const opcodes = calls.map((call) => call.opcode);
    expect(opcodes[3]).toBe(INSTAX_OPCODES.downloadStart);
    expect(opcodes.slice(4, -2)).toEqual(
      Array(Math.ceil(validJpeg.length / 900)).fill(INSTAX_OPCODES.downloadData)
    );
    expect(opcodes.slice(-2)).toEqual([INSTAX_OPCODES.downloadEnd, INSTAX_OPCODES.printImage]);
    expect(calls[4].payload.length).toBe(904);
    expect(opcodes.filter((opcode) => opcode === INSTAX_OPCODES.printImage)).toHaveLength(1);
    expect(phases).toEqual(['preflight', 'uploading', 'command-sent', 'command-acknowledged']);
  });

  it('rejectsBeforeCommand', async () => {
    const { fake, calls } = connection({ failOpcode: INSTAX_OPCODES.downloadData });
    expect(await sendWithTimers(fake)).toMatchObject({ kind: 'rejected-before-command' });
    expect(calls.map((call) => call.opcode)).not.toContain(INSTAX_OPCODES.printImage);
  });

  it('disconnectAfterCommandIsUncertain', async () => {
    const { fake, calls } = connection({ failOpcode: INSTAX_OPCODES.printImage });
    expect(await sendWithTimers(fake)).toMatchObject({ kind: 'uncertain' });
    expect(calls.filter((call) => call.opcode === INSTAX_OPCODES.printImage)).toHaveLength(1);
  });

  it('ackIsNotEjection', async () => {
    const { fake } = connection();
    const phases: string[] = [];
    expect(await sendWithTimers(fake, (phase) => phases.push(phase))).toEqual({ kind: 'accepted' });
    expect(phases).not.toContain('ejected');
  });

  it('statusObservationDoesNotConfirm', async () => {
    vi.useFakeTimers();
    const { fake, calls } = connection();
    const onStatus = vi.fn();
    const onError = vi.fn();
    const stop = startStatusObservation(fake, onStatus, onError);
    await vi.advanceTimersByTimeAsync(60_001);
    const sampled = calls.length;
    expect(sampled).toBeGreaterThan(30);
    expect(calls.every((call) => call.opcode === INSTAX_OPCODES.supportFunctionInfo)).toBe(true);
    expect(onStatus).toHaveBeenCalledTimes(sampled);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toHaveLength(sampled);
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it('samplesRawStatusWithinOneSecondWithoutSendingAnotherPrint', async () => {
    vi.useFakeTimers();
    const { fake, calls } = connection();
    const onStatus = vi.fn();
    const stop = startStatusObservation(fake, onStatus, vi.fn());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onStatus).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      { opcode: INSTAX_OPCODES.supportFunctionInfo, payload: new Uint8Array([2]) },
    ]);
    stop();
  });

  it('cancellingObservationIgnoresAnInFlightStatusReply', async () => {
    vi.useFakeTimers();
    let resolve!: (response: InstaxResponse) => void;
    const { fake } = connection();
    fake.exchange = () => new Promise<InstaxResponse>((complete) => (resolve = complete));
    const onStatus = vi.fn();
    const stop = startStatusObservation(fake, onStatus, vi.fn());
    await vi.advanceTimersByTimeAsync(900);

    stop();
    resolve({
      opcode: INSTAX_OPCODES.supportFunctionInfo,
      payload: new Uint8Array([0, 2, 3, 0, 0, 11]),
    });
    await Promise.resolve();

    expect(onStatus).not.toHaveBeenCalled();
  });

  it('serializes reload status/history polling and cancels before the next query', async () => {
    vi.useFakeTimers();
    const { fake } = connection();
    let resolve!: (response: InstaxResponse) => void;
    const exchange = vi.fn(() => new Promise<InstaxResponse>((done) => (resolve = done)));
    fake.exchange = exchange;
    const received = vi.fn();
    const stop = startStatusObservation(fake, received, vi.fn(), true);
    await vi.advanceTimersByTimeAsync(2700);
    expect(exchange).toHaveBeenCalledTimes(1);
    resolve({ opcode: 2, payload: new Uint8Array([0, 2, 0xb0, 0, 2, 0, 0, 0, 0, 0]) });
    await vi.advanceTimersByTimeAsync(0);
    expect(
      exchange.mock.calls.map((call) => (call as unknown as [number, Uint8Array])[1][0])
    ).toEqual([2, 3]);
    stop();
    resolve({ opcode: 2, payload: new Uint8Array([0, 3, 0, 0, 0, 1, 0, 0, 0, 1]) });
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it('ignores a late reply after the wall-clock deadline and does not query history', async () => {
    vi.useFakeTimers();
    const { fake } = connection();
    let resolve!: (response: InstaxResponse) => void;
    const exchange = vi.fn(() => new Promise<InstaxResponse>((done) => (resolve = done)));
    fake.exchange = exchange;
    const received = vi.fn();
    const stop = startStatusObservation(fake, received, vi.fn(), true);
    await vi.advanceTimersByTimeAsync(900);
    vi.setSystemTime(Date.now() + 60_000);
    resolve({ opcode: 2, payload: new Uint8Array([0, 2, 3]) });
    await vi.advanceTimersByTimeAsync(0);
    expect(received).not.toHaveBeenCalled();
    expect(exchange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('rejects malformed image variants before any printer exchange', async () => {
    const frameOnly = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 3, 32, 2, 88, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 0xff, 0xd9,
    ]);
    const progressive = validJpeg.slice();
    progressive[frameOffset + 1] = 0xc2;
    const wrongSize = validJpeg.slice();
    wrongSize[frameOffset + 7] = 3;
    const oversize = new Uint8Array(55_001);
    oversize.set(validJpeg);
    for (const image of [frameOnly, progressive, wrongSize, oversize]) {
      const { fake, calls } = connection();
      const result = await sendTrialPrint(fake, image, vi.fn());
      expect(result.kind).toBe('rejected-before-command');
      expect(calls).toHaveLength(0);
    }
  });
});
