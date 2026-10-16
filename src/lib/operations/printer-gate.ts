import 'server-only';
import { OperationError } from './types';

// ADR-0021 / #17: no production physical-completion rule is qualified.
export function requireSimulator(code: 'state_conflict' | 'invalid_evidence' = 'state_conflict') {
  if (process.env.NODE_ENV === 'production' || process.env.BOOTH_SIMULATOR_ENABLED !== 'true')
    throw new OperationError(code);
}
