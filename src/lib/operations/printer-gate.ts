import 'server-only';
import { OperationError } from './types';

// ADR-0021 / #17: no production physical-completion rule is qualified.
export function requireSimulator(code: 'state_conflict' | 'invalid_evidence' = 'state_conflict') {
  if (process.env.NODE_ENV === 'production' || process.env.BOOTH_SIMULATOR_ENABLED !== 'true')
    throw new OperationError(code);
}

/** Policy comes from the authenticated run on the server, never from observation payload. */
export function requireQualifiedPrinterEvidence(
  kind: string,
  evidence: { source: string; evidenceVersion: string },
  runPolicy: { mode: 'disabled' | 'simulated'; evidenceVersion: string }
) {
  requireSimulator('invalid_evidence');
  if (
    runPolicy.mode !== 'simulated' ||
    runPolicy.evidenceVersion !== 'simulator-v1' ||
    evidence.source !== 'simulator' ||
    evidence.evidenceVersion !== runPolicy.evidenceVersion ||
    ![
      'definitely_not_sent',
      'command_accepted',
      'full_ejection_confirmed',
      'no_film_rejected',
      'outcome_unknown',
      'connection_changed',
      'ready_for_new_job',
    ].includes(kind)
  )
    throw new OperationError('invalid_evidence');
}
