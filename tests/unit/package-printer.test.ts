// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulatedPrinterV2 } from '@/features/booth/printer/simulator-v2';
import type { DispatchAuthorization } from '@/lib/operations/package-contract';
import { requireQualifiedPrinterEvidence } from '@/lib/operations/printer-gate';
vi.mock('server-only', () => ({}));

const authorization: DispatchAuthorization = {
  attemptId: 'attempt',
  dispatchId: 'dispatch',
  printerId: 'printer',
  connectionGeneration: 0,
};

describe('provisional printer adapter', () => {
  it('sends one command and separates acceptance from full ejection', async () => {
    const write = vi.fn(async () => {});
    const printer = new SimulatedPrinterV2('printer', write);
    const observed: string[] = [];
    printer.observe((item) => observed.push(item.kind));
    const attempt = {
      ...authorization,
      connectionGeneration: (await printer.connect('printer')).connectionGeneration,
    };
    await Promise.all([
      printer.sendOnce(attempt, new Uint8Array([1])),
      printer.sendOnce(attempt, new Uint8Array([2])),
    ]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(observed).toEqual([]);
    printer.emit('command_accepted', attempt);
    expect(observed).toEqual(['command_accepted']);
    printer.emit('full_ejection_confirmed', attempt);
    expect(observed).toEqual(['command_accepted', 'full_ejection_confirmed']);
  });
  it('keeps delayed outcome evidence on the original generation after reconnect', async () => {
    const printer = new SimulatedPrinterV2('printer');
    const seen: { kind: string; connectionGeneration: number }[] = [];
    printer.observe((item) => seen.push(item));
    const original = (await printer.connect()).connectionGeneration;
    const attempt = { ...authorization, connectionGeneration: original };
    await printer.sendOnce(attempt, new Uint8Array([1]));
    printer.emit('connection_changed');
    await printer.connect();
    printer.emit('full_ejection_confirmed', attempt);
    expect(seen.at(-1)).toMatchObject({
      kind: 'full_ejection_confirmed',
      connectionGeneration: original,
    });
  });
  it('advances generation once per reconnect and reports the disconnected generation', async () => {
    const printer = new SimulatedPrinterV2('printer');
    const changes: number[] = [];
    printer.observe((item) => {
      if (item.kind === 'connection_changed') changes.push(item.connectionGeneration);
    });
    const first = (await printer.connect()).connectionGeneration;
    printer.emit('connection_changed');
    const second = (await printer.connect()).connectionGeneration;
    expect(changes).toEqual([first]);
    expect(second).toBe(first + 1);
  });
  it('emits explicit rejection, unknown, disconnect and ready observations without inferring output', async () => {
    const printer = new SimulatedPrinterV2('printer');
    const seen: string[] = [];
    printer.observe((item) => seen.push(item.kind));
    const generation = (await printer.connect()).connectionGeneration;
    const attempt = { ...authorization, connectionGeneration: generation };
    printer.emit('definitely_not_sent', attempt);
    printer.emit('no_film_rejected', attempt);
    printer.emit('outcome_unknown', attempt);
    printer.emit('connection_changed');
    await printer.connect();
    printer.emit('ready_for_new_job');
    expect(seen).toEqual([
      'definitely_not_sent',
      'no_film_rejected',
      'outcome_unknown',
      'connection_changed',
      'ready_for_new_job',
    ]);
    expect((await printer.readReadiness()).ready).toBe(true);
  });
  it('does not retry an ambiguous transport write for the same dispatch ID', async () => {
    const write = vi.fn(async () => {
      throw new Error('transport ambiguous');
    });
    const printer = new SimulatedPrinterV2('printer', write);
    const attempt = {
      ...authorization,
      connectionGeneration: (await printer.connect()).connectionGeneration,
    };
    await expect(printer.sendOnce(attempt, new Uint8Array([1]))).rejects.toThrow(
      'transport ambiguous'
    );
    await printer.sendOnce(attempt, new Uint8Array([1]));
    expect(printer.commandCount).toBe(1);
  });
  it('gives each emitted observation a server compatible unique ID', async () => {
    const printer = new SimulatedPrinterV2('printer');
    const ids: string[] = [];
    printer.observe((item) => ids.push(item.observationId));
    await printer.connect();
    printer.emit('ready_for_new_job');
    printer.emit('ready_for_new_job');
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('keeps the printer unavailable for another job until ready-for-new-job arrives', async () => {
    const printer = new SimulatedPrinterV2('printer');
    const attempt = {
      ...authorization,
      connectionGeneration: (await printer.connect()).connectionGeneration,
    };
    await printer.sendOnce(attempt, new Uint8Array([1]));
    expect((await printer.readReadiness()).ready).toBe(false);
    printer.emit('full_ejection_confirmed', attempt);
    expect((await printer.readReadiness()).ready).toBe(false);
    printer.emit('ready_for_new_job');
    expect((await printer.readReadiness()).ready).toBe(true);
  });
});

describe('production evidence gate', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('rejects simulator evidence in production even with a simulator flag and false client simulation hint', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
    expect(() =>
      requireQualifiedPrinterEvidence(
        'full_ejection_confirmed',
        { source: 'simulator', evidenceVersion: 'simulator-v1', simulated: false } as never,
        { mode: 'simulated', evidenceVersion: 'simulator-v1' }
      )
    ).toThrow();
  });
  it.each([
    ['full_ejection_confirmed', 'physical', 'simulator-v1'],
    ['full_ejection_confirmed', 'simulator', 'made-up'],
    ['counter_decreased', 'simulator', 'simulator-v1'],
    ['status_ready', 'simulator', 'simulator-v1'],
    ['no_film_guess', 'simulator', 'simulator-v1'],
    ['full_ejection_confirmed', 'admin', 'simulator-v1'],
  ])('rejects unqualified %s from %s', (kind, source, evidenceVersion) => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('BOOTH_SIMULATOR_ENABLED', 'true');
    expect(() =>
      requireQualifiedPrinterEvidence(
        kind,
        { source, evidenceVersion },
        { mode: 'simulated', evidenceVersion: 'simulator-v1' }
      )
    ).toThrow();
  });
});
