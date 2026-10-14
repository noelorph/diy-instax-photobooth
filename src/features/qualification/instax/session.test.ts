import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrinterConnection } from './bluetooth';
import { INSTAX_OPCODES, type InstaxOpcode } from './protocol';
import {
  preflightPrinter,
  sendTrialPrint,
  startStatusObservation,
  type PrintPhase,
} from './session';

const validJpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 3, 32, 2, 88, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 0xff, 0xd9,
]);
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
  onPhase: (phase: PrintPhase) => void = vi.fn()
) {
  vi.useFakeTimers();
  const result = sendTrialPrint(fake, validJpeg, onPhase);
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

  it('uploadsThenPrintsOnce', async () => {
    const { fake, calls } = connection();
    const phases: string[] = [];
    expect(await sendWithTimers(fake, (phase) => phases.push(phase))).toEqual({ kind: 'accepted' });
    const opcodes = calls.map((call) => call.opcode);
    expect(opcodes.slice(-4)).toEqual([
      INSTAX_OPCODES.downloadStart,
      INSTAX_OPCODES.downloadData,
      INSTAX_OPCODES.downloadEnd,
      INSTAX_OPCODES.printImage,
    ]);
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
    expect(calls.filter((call) => call.opcode === INSTAX_OPCODES.supportFunctionInfo)).toHaveLength(
      30
    );
    expect(onStatus).toHaveBeenCalledTimes(30);
    expect(onError).not.toHaveBeenCalled();
    stop();
  });
});
