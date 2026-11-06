import { describe, expect, it } from 'vitest';
import { createCandidateObservation } from './candidates';

const status = (bytes = [0, 2, 0xb3, 0, 0, 11, 0, 0, 0, 0]) => ({
  opcode: 2,
  payload: new Uint8Array(bytes),
});
const processing = () => status([0, 2, 0xb4, 0x12, 127, 11, 0, 0, 0, 0]);
const opened = () => status([0, 2, 0xb0, 1, 1, 0, 0, 0, 0, 0]);
const history = (prints = 258, covers = 3) => {
  const payload = new Uint8Array([0, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
  const view = new DataView(payload.buffer);
  view.setInt32(2, prints, false);
  view.setInt32(6, covers, false);
  return { opcode: 2, payload };
};

describe('REA qualification candidates (not physical confirmation)', () => {
  it('decodes the recorded processing payload and accepts terminal zero-film status only after it', () => {
    const probe = createCandidateObservation('ejection');
    expect(probe.observe(status()).candidate).toBe(false);
    expect(probe.observe(processing()).status).toEqual({
      filmRemaining: 4,
      battery: 3,
      charging: true,
      coverOpen: false,
      operating: true,
      error: false,
      operationInfo: 1,
      printResult: 127,
      waitTime: 11,
      errorCode: 0,
    });
    expect(probe.observe(status([0, 2, 0xb0, 0, 0, 11, 0, 0, 0, 0])).candidate).toBe(true);
    expect(createCandidateObservation('ejection').observe(status()).candidate).toBe(false);
  });

  it.each([
    [0, 2, 0xb3],
    [1, 2, 0xb3, 0, 0, 11, 0, 0, 0, 0],
    [0, 2, 0xb3, 1, 1, 11, 0, 0, 0, 0],
    [0, 2, 0xb3, 4, 0, 11, 0, 0, 0, 0],
    [0, 2, 0xb3, 0, 0, 11, 0, 0, 0, 1],
    [0, 2, 0xb3, 0, 240, 11, 0, 0, 0, 0],
    [0, 2, 0xb3, 0x10, 0, 11, 0, 0, 0, 0],
    [0, 2, 0x03, 0, 0, 11, 0, 0, 0, 0],
  ])('keeps an ambiguous/error sequence ineligible: %j', (...bytes) => {
    const probe = createCandidateObservation('ejection');
    probe.observe(processing());
    expect(probe.observe(status(bytes)).blockedReason).toBeTruthy();
    expect(probe.observe(status()).candidate).toBe(false);
  });

  it('invalidates on transport loss and never combines separate observation sessions', () => {
    const probe = createCandidateObservation('ejection');
    probe.observe(processing());
    probe.invalidate('Connection lost');
    expect(probe.observe(status()).candidate).toBe(false);
    expect(createCandidateObservation('ejection').observe(status()).candidate).toBe(false);
  });

  it('requires a closed baseline, cover cycle, fresh +1 FC history and ready status for reload', () => {
    const probe = createCandidateObservation('reload');
    probe.observe(status([0, 2, 0xb0, 0, 2, 0, 0, 0, 0, 0]));
    expect(probe.observe(history()).baseline).toEqual({ totalPrints: 258, totalEjectFC: 3 });
    probe.observe(opened());
    expect(probe.observe(status()).candidate).toBe(false);
    const result = probe.observe(history(258, 4));
    expect(result.history).toEqual({ totalPrints: 258, totalEjectFC: 4 });
    expect(result.candidate).toBe(true);
    expect(result.status?.filmRemaining).toBe(3);
  });

  it.each(['no-open', 'no-baseline', 'no-history-change', 'empty', 'busy', 'stale-history'])(
    'does not infer reload from %s',
    (scenario) => {
      const probe = createCandidateObservation('reload');
      probe.observe(status());
      if (scenario !== 'no-baseline') probe.observe(history());
      if (scenario !== 'no-open') probe.observe(opened());
      if (scenario === 'stale-history') probe.observe(history(258, 4));
      probe.observe(
        scenario === 'empty'
          ? status([0, 2, 0xb0, 0, 0, 0, 0, 0, 0, 0])
          : scenario === 'busy'
            ? processing()
            : status()
      );
      const result = probe.observe(history(258, scenario === 'no-history-change' ? 3 : 4));
      expect(result.candidate).toBe(false);
    }
  );

  it.each([
    [258, 2],
    [258, 5],
    [259, 4],
    [0, 0],
    [-1, 4],
    [258, -1],
  ])('rejects reset/ambiguous history (%i, %i)', (prints, covers) => {
    const probe = createCandidateObservation('reload');
    probe.observe(status());
    probe.observe(history());
    probe.observe(opened());
    probe.observe(status());
    expect(probe.observe(history(prints, covers)).blockedReason).toBeTruthy();
    expect(probe.observe(history(258, 4)).candidate).toBe(false);
  });

  it('rejects wrong selectors/opcodes and an extra cover cycle', () => {
    for (const response of [
      { opcode: 0x1080, payload: new Uint8Array(10) },
      status([0, 4, 0, 0, 0, 0, 0, 0, 0, 0]),
    ]) {
      expect(createCandidateObservation('reload').observe(response).blockedReason).toBeTruthy();
    }
    const probe = createCandidateObservation('reload');
    probe.observe(status());
    probe.observe(history());
    probe.observe(opened());
    probe.observe(status());
    probe.observe(opened());
    probe.observe(status());
    expect(probe.observe(history(258, 4)).candidate).toBe(false);
  });

  it('rejects a counter returning to baseline after increasing, and activity after a candidate', () => {
    const reload = createCandidateObservation('reload');
    reload.observe(status());
    reload.observe(history());
    reload.observe(opened());
    reload.observe(processing());
    reload.observe(history(258, 4));
    expect(reload.observe(history(258, 3)).blockedReason).toMatch(/decreased/);
    reload.observe(status());
    expect(reload.observe(history(258, 4)).candidate).toBe(false);
    const print = createCandidateObservation('ejection');
    print.observe(processing());
    expect(print.observe(status()).candidate).toBe(true);
    expect(print.observe(processing())).toMatchObject({
      candidate: false,
      blockedReason: 'Operation restarted after candidate',
    });
  });
});
