import type { SendResult } from './instax/session';
import type { TrialLog } from './trial-log';

const STORAGE_KEY = 'iphone-qualification-run-unresolved';
export type TrialState = {
  remaining: number;
  phase: 'ready' | 'sending' | 'awaiting-observation' | 'uncertain' | 'exhausted';
  needsReconciliation: boolean;
};
export type TrialController = {
  startPrint(jpeg: Uint8Array): Promise<void>;
  observeEjection(observedAt: string): void;
  markUncertain(reason: string): void;
  beginNewRun(physicalSheetsChecked: boolean): void;
  getState(): TrialState;
};

export function createTrialController(
  printer: { send(jpeg: Uint8Array): Promise<SendResult> },
  log: TrialLog,
  storage: Storage
): TrialController {
  let state: TrialState = storage.getItem(STORAGE_KEY)
    ? { remaining: 3, phase: 'uncertain', needsReconciliation: true }
    : { remaining: 3, phase: 'ready', needsReconciliation: false };
  let activeAttemptId: string | undefined;
  const setState = (patch: Partial<TrialState>) => {
    state = { ...state, ...patch };
  };
  return {
    getState: () => ({ ...state }),
    async startPrint(jpeg) {
      if (state.needsReconciliation || state.phase === 'uncertain')
        throw new Error('Reconcile physical sheets before printing');
      if (state.remaining === 0) throw new Error('Qualification allowance exhausted');
      if (state.phase !== 'ready') throw new Error('Print attempt busy');
      const attemptId = log.newAttemptId();
      activeAttemptId = attemptId;
      setState({ phase: 'sending' });
      storage.setItem(STORAGE_KEY, '1');
      log.record({ kind: 'print-start', attemptId });
      let result: SendResult;
      try {
        result = await printer.send(jpeg);
      } catch (error) {
        result = {
          kind: 'uncertain',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      log.record({
        kind: result.kind,
        attemptId,
        message: result.kind === 'accepted' ? undefined : result.message,
      });
      if (result.kind === 'accepted') setState({ phase: 'awaiting-observation' });
      else if (result.kind === 'uncertain')
        setState({ phase: 'uncertain', needsReconciliation: true });
      else {
        activeAttemptId = undefined;
        setState({ phase: 'ready' });
      }
    },
    observeEjection(observedAt) {
      if (state.phase !== 'awaiting-observation' || !activeAttemptId)
        throw new Error('No pending physical ejection');
      if (Number.isNaN(Date.parse(observedAt)))
        throw new Error('Invalid ejection observation time');
      log.record({ kind: 'observed-ejection', attemptId: activeAttemptId, message: observedAt });
      activeAttemptId = undefined;
      const remaining = state.remaining - 1;
      setState({ remaining, phase: remaining === 0 ? 'exhausted' : 'ready' });
    },
    markUncertain(reason) {
      if (state.phase !== 'sending' && state.phase !== 'awaiting-observation')
        throw new Error('No active attempt');
      log.record({ kind: 'uncertain', attemptId: activeAttemptId, message: reason });
      setState({ phase: 'uncertain', needsReconciliation: true });
    },
    beginNewRun(physicalSheetsChecked) {
      if (!physicalSheetsChecked) throw new Error('Physical sheets must be reconciled');
      if (state.phase === 'sending' || state.phase === 'awaiting-observation')
        throw new Error('Active print must be resolved first');
      storage.removeItem(STORAGE_KEY);
      activeAttemptId = undefined;
      state = { remaining: 3, phase: 'ready', needsReconciliation: false };
      log.beginRun();
      log.record({ kind: 'new-run', message: 'Physical sheets reconciled by operator' });
    },
  };
}
