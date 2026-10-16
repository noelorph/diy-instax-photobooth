/** Timing is process-monotonic. No observation contains an image or raw printer payload. */
export type PrinterObservation = {
  attemptId: string;
  monotonicMs: number;
} & (
  | { kind: 'commandAccepted' }
  | { kind: 'physicalEjectionVerified' }
  | { kind: 'preFilmRejected' }
  | { kind: 'knownUnsent' }
  | { kind: 'uncertain' }
);

/** Real hardware implementations require the separate, physically validated #17 decision. */
export interface PrinterAdapter {
  sendOnce(attemptId: string, image: Uint8Array): Promise<PrinterObservation[]>;
}
