import { describe, expect, it, vi } from 'vitest';
import { createTrialLog } from './trial-log';
import { createTrialController } from './trial';
import type { SendResult } from './instax/session';

const jpeg = new Uint8Array([1, 2, 3]);
function fixture(result: SendResult = { kind: 'accepted' }) {
  const log = createTrialLog({ now: () => 0, iso: () => '2026-10-14T10:00:00Z' });
  const storage = new Map<string, string>();
  const store = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  } as Storage;
  const send = vi.fn(async () => result);
  return { controller: createTrialController({ send }, log, store), send, log, store };
}

describe('local qualification allowance', () => {
  it('oneCommandPerAttempt', async () => {
    let finish!: (result: SendResult) => void;
    const f = fixture();
    f.send.mockImplementation(
      () =>
        new Promise<SendResult>((resolve) => {
          finish = resolve;
        })
    );
    const first = f.controller.startPrint(jpeg);
    await expect(f.controller.startPrint(jpeg)).rejects.toThrow('busy');
    expect(f.send).toHaveBeenCalledTimes(1);
    finish({ kind: 'accepted' });
    await first;
  });

  it('ackKeepsAllowanceHeld', async () => {
    const f = fixture();
    await f.controller.startPrint(jpeg);
    expect(f.controller.getState()).toMatchObject({ remaining: 3, phase: 'awaiting-observation' });
    f.controller.observeEjection('2026-10-14T10:00:00Z');
    expect(f.controller.getState().remaining).toBe(2);
  });

  it('ejectionObservationIsIdempotent', async () => {
    const f = fixture();
    await f.controller.startPrint(jpeg);
    f.controller.observeEjection('2026-10-14T10:00:00Z');
    expect(() => f.controller.observeEjection('2026-10-14T10:00:01Z')).toThrow();
    expect(f.controller.getState().remaining).toBe(2);
  });

  it('threeObservationsExhaustAllowance', async () => {
    const f = fixture();
    for (let index = 0; index < 3; index++) {
      await f.controller.startPrint(jpeg);
      f.controller.observeEjection('2026-10-14T10:00:00Z');
    }
    expect(f.controller.getState()).toMatchObject({ remaining: 0, phase: 'exhausted' });
    await expect(f.controller.startPrint(jpeg)).rejects.toThrow('allowance');
    expect(f.send).toHaveBeenCalledTimes(3);
  });

  it('rejectionBeforeCommandReleasesAttempt', async () => {
    const f = fixture({ kind: 'rejected-before-command', message: 'no film' });
    await f.controller.startPrint(jpeg);
    expect(f.controller.getState()).toMatchObject({ remaining: 3, phase: 'ready' });
    await f.controller.startPrint(jpeg);
    expect(f.send).toHaveBeenCalledTimes(2);
  });

  it('reloadRequiresReconciliation', async () => {
    const f = fixture();
    await f.controller.startPrint(jpeg);
    const reloaded = createTrialController({ send: f.send }, f.log, f.store);
    expect(reloaded.getState().needsReconciliation).toBe(true);
    await expect(reloaded.startPrint(jpeg)).rejects.toThrow();
    expect(() => reloaded.beginNewRun(false)).toThrow();
    reloaded.beginNewRun(true);
    expect(reloaded.getState()).toMatchObject({
      remaining: 3,
      phase: 'ready',
      needsReconciliation: false,
    });
  });

  it('post-command uncertainty blocks another print', async () => {
    const f = fixture({ kind: 'uncertain', message: 'disconnect' });
    await f.controller.startPrint(jpeg);
    expect(f.controller.getState().phase).toBe('uncertain');
    await expect(f.controller.startPrint(jpeg)).rejects.toThrow();
  });

  it('assigns a new run ID after physical reconciliation', async () => {
    const f = fixture();
    const firstRunId = f.log.runId;
    f.controller.beginNewRun(true);
    expect(f.log.runId).not.toBe(firstRunId);
    await f.controller.startPrint(jpeg);
    expect(f.log.exportJson()).toContain(f.log.runId);
  });

  it('keeps disconnect uncertainty if an in-flight send later reports rejection', async () => {
    let finish!: (result: SendResult) => void;
    const f = fixture();
    f.send.mockImplementation(
      () =>
        new Promise<SendResult>((resolve) => {
          finish = resolve;
        })
    );
    const pending = f.controller.startPrint(jpeg);
    f.controller.markUncertain('printer disconnected');
    finish({ kind: 'rejected-before-command', message: 'write failed' });
    await pending;
    expect(f.controller.getState()).toMatchObject({
      phase: 'uncertain',
      needsReconciliation: true,
    });
  });
});
