import type { AttemptState, PackageCounts, RunState } from '@/lib/operations/package-contract';
export type Attempt = { id: string; kind: string; state: AttemptState };
export type OperationalEvent = {
  id: string;
  title: string;
  state: string;
  revision: number;
  counts: PackageCounts;
  captures: number;
  attemptsPage: number;
  hasOlderAttempts: boolean;
  runId: string | null;
  runState: RunState | null;
  resumeAllowed: boolean;
  possibleDelivery: boolean;
  blockers: string[];
  attempts: Attempt[];
};
