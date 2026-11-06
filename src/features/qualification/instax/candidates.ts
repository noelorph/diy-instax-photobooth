import { INSTAX_OPCODES, type InstaxResponse } from './protocol';

export type PrinterStatus = {
  filmRemaining: number;
  battery: number;
  charging: boolean;
  coverOpen: boolean;
  operating: boolean;
  error: boolean;
  operationInfo: number;
  printResult: number;
  waitTime: number;
  errorCode: number;
};
type PrintHistory = { totalPrints: number; totalEjectFC: number };
export type CandidateSnapshot = {
  status: PrinterStatus | null;
  history: PrintHistory | null;
  baseline: PrintHistory | null;
  candidate: boolean;
  blockedReason: string | null;
};

// Static field provenance and physical limits: docs/qualification/evidence/instax-mini-link-7.0.6.
// One observer per accepted print or supervised reload, on one uninterrupted connection.
export function createCandidateObservation(mode: 'ejection' | 'reload') {
  let snapshot: CandidateSnapshot = {
    status: null,
    history: null,
    baseline: null,
    candidate: false,
    blockedReason: null,
  };
  let sawProcessing = false;
  let sawOpen = false;
  let sawClose = false;

  function invalidate(reason: string): CandidateSnapshot {
    snapshot = { ...snapshot, candidate: false, blockedReason: snapshot.blockedReason ?? reason };
    return snapshot;
  }

  function observe(response: InstaxResponse): CandidateSnapshot {
    const p = response.payload;
    if (
      response.opcode !== INSTAX_OPCODES.supportFunctionInfo ||
      p.length !== 10 ||
      p[0] !== 0 ||
      (p[1] !== 2 && p[1] !== 3)
    ) {
      return invalidate('Unsupported or incomplete status/history response');
    }
    const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
    if (p[1] === 2) {
      const status: PrinterStatus = {
        filmRemaining: p[2] & 15,
        battery: (p[2] >> 4) & 7,
        charging: !!(p[2] & 128),
        coverOpen: !!(p[3] & 1),
        operating: !!(p[3] & 2),
        error: !!(p[3] & 4),
        operationInfo: p[3] >> 4,
        printResult: p[4],
        waitTime: p[5],
        errorCode: view.getInt32(6, false),
      };
      snapshot = { ...snapshot, status };
      if (snapshot.blockedReason) return snapshot;
      if (
        status.error ||
        status.errorCode !== 0 ||
        status.battery < 1 ||
        status.battery > 3 ||
        (p[3] & 8) !== 0
      )
        return invalidate('Error, battery or unknown status condition');
      if (snapshot.candidate && status.operating)
        return invalidate('Operation restarted after candidate');
      if (mode === 'ejection') {
        if (status.coverOpen) return invalidate('Cover opened during print observation');
        if (status.operating && status.operationInfo === 1 && status.printResult === 127) {
          sawProcessing = true;
        } else if (idle(status)) {
          snapshot = { ...snapshot, candidate: sawProcessing };
        } else return invalidate('Unrecognized operation/result sequence');
      } else {
        if (![0, 1, 2, 127].includes(status.printResult)) {
          return invalidate('Unrecognized reload result');
        }
        if (status.coverOpen) {
          if (!snapshot.baseline) return invalidate('Cover opened before a closed baseline');
          if (sawClose) return invalidate('More than one cover cycle in this observation');
          sawOpen = true;
        } else if (sawOpen) sawClose = true;
      }
    } else {
      const previousHistory = snapshot.history;
      const history = {
        totalPrints: view.getInt32(2, false),
        totalEjectFC: view.getInt32(6, false),
      };
      snapshot = { ...snapshot, history };
      if (snapshot.blockedReason) return snapshot;
      if (history.totalPrints < 0 || history.totalEjectFC < 0) {
        return invalidate('Negative/wrapped history counter');
      }
      if (
        previousHistory &&
        (history.totalPrints < previousHistory.totalPrints ||
          history.totalEjectFC < previousHistory.totalEjectFC)
      )
        return invalidate('History counter decreased during observation');
      if (mode === 'reload') {
        const { status, baseline } = snapshot;
        if (!baseline) {
          if (
            status &&
            !status.coverOpen &&
            !status.operating &&
            status.operationInfo === 0 &&
            (status.printResult === 0 || status.printResult === 2)
          ) {
            snapshot = { ...snapshot, baseline: history };
          }
        } else {
          const delta = history.totalEjectFC - baseline.totalEjectFC;
          if (
            history.totalPrints !== baseline.totalPrints ||
            delta < 0 ||
            delta > 1 ||
            (delta === 1 && !sawClose)
          ) {
            return invalidate('History changed outside the observed reload sequence');
          }
          // Evaluate only a fresh history response after closed, ready status.
          if (sawClose && delta === 1 && status && idle(status) && status.filmRemaining > 0) {
            snapshot = { ...snapshot, candidate: true };
          }
        }
      }
    }
    return snapshot;
  }

  return { observe, invalidate };
}

function idle(status: PrinterStatus): boolean {
  return (
    !status.coverOpen && !status.operating && status.operationInfo === 0 && status.printResult === 0
  );
}
