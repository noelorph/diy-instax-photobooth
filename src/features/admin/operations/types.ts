import type {
  AttemptState,
  PackageCounts,
  RunState,
  ReloadRequestBinding,
} from '@/lib/operations/package-contract';
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
  printerId?: string | null;
  connectionGeneration?: number | null;
  activeReloadRequest?: ReloadRequestBinding | null;
  reloadConfirmation?: (ReloadRequestBinding & { confirmationSource: string | null }) | null;
  runId: string | null;
  runState: RunState | null;
  resumeAllowed: boolean;
  possibleDelivery: boolean;
  blockers: string[];
  equipment: {
    expiresAt: string | null;
    cameraLive: boolean;
    printerConnected: boolean;
    serverReachable: boolean;
    filmLoaded: boolean;
  } | null;
  attempts: Attempt[];
};
