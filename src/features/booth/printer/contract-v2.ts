import type { DispatchAuthorization } from '@/lib/operations/package-contract';

export type PrinterReadinessSnapshot = {
  printerId: string;
  connectionGeneration: number;
  connected: boolean;
  ready: boolean;
  observedAgeMs: number;
};

type ObservationBase = {
  observationId: string;
  adapterVersion: string;
  evidenceVersion: string;
  connectionGeneration: number;
};
export type PrinterObservationV2 = ObservationBase &
  (
    | ({
        kind:
          | 'definitely_not_sent'
          | 'command_accepted'
          | 'full_ejection_confirmed'
          | 'no_film_rejected'
          | 'outcome_unknown';
      } & Pick<DispatchAuthorization, 'attemptId' | 'dispatchId'>)
    | { kind: 'connection_changed' | 'ready_for_new_job'; printerId: string }
  );

export interface PrinterAdapterV2 {
  connect(
    expectedPrinterId?: string,
    previousGeneration?: number
  ): Promise<PrinterReadinessSnapshot>;
  readReadiness(): Promise<PrinterReadinessSnapshot>;
  observe(listener: (observation: PrinterObservationV2) => void): () => void;
  sendOnce(authorization: DispatchAuthorization, image: Uint8Array): Promise<void>;
}
