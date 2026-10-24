import type { PrinterAdapter, PrinterObservation } from './contract';
export type SimulatedOutcome = 'accepted' | 'ejected' | 'rejected' | 'uncertain';

/** Development adapter. Retains observations only; never retains the supplied image. */
export class SimulatedPrinter implements PrinterAdapter {
  private readonly attempts = new Map<string, Promise<PrinterObservation[]>>();
  private commands = 0;
  constructor(private readonly outcome: SimulatedOutcome = 'ejected') {}
  get commandCount() {
    return this.commands;
  }
  sendOnce(attemptId: string, image: Uint8Array): Promise<PrinterObservation[]> {
    const previous = this.attempts.get(attemptId);
    if (previous) return previous;
    if (!image.byteLength) return Promise.reject(new Error('Printable image required'));
    this.commands++;
    const kinds: PrinterObservation['kind'][] =
      this.outcome === 'rejected'
        ? ['preFilmRejected']
        : this.outcome === 'accepted'
          ? ['commandAccepted']
          : [
              'commandAccepted',
              this.outcome === 'ejected' ? 'physicalEjectionVerified' : 'uncertain',
            ];
    const result = Promise.resolve(
      kinds.map((kind) => ({ kind, attemptId, monotonicMs: performance.now() }))
    );
    this.attempts.set(attemptId, result);
    return result;
  }
}
