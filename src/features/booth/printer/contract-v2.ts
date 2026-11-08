import type {
  DispatchAuthorization,
  PrinterEvidenceDescriptor,
} from '@/lib/operations/package-contract';

export type PrinterReadinessSnapshot = PrinterLoadFault & {
  printerId: string;
  connectionGeneration: number;
  connected: boolean;
  ready: boolean;
  observedAgeMs: number;
  evidence: PrinterEvidenceDescriptor | null;
  oldJobCleared: boolean;
};
export type PrinterLoadFault =
  | { loadFault?: never; loadFaultId?: never }
  | { loadFault: 'cover_open' | 'load_change'; loadFaultId: string };

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
          | 'outcome_unknown'
          | 'ready_for_new_job';
      } & Pick<DispatchAuthorization, 'attemptId' | 'dispatchId' | 'printerId'>)
    | { kind: 'connection_changed'; printerId: string }
  );

export interface PrinterAdapterV2 {
  connect(
    expectedPrinterId?: string,
    previousGeneration?: number
  ): Promise<PrinterReadinessSnapshot>;
  disconnect(): Promise<void>;
  readReadiness(): Promise<PrinterReadinessSnapshot>;
  observe(listener: (observation: PrinterObservationV2) => void): () => void;
  sendOnce(authorization: DispatchAuthorization, image: Uint8Array): Promise<void>;
}
