import type { DispatchAuthorization } from '@/lib/operations/package-contract';
import type {
  PrinterAdapterV2,
  PrinterObservationV2,
  PrinterReadinessSnapshot,
} from './contract-v2';

/** Development-only controlled observations; no simulated outcome is physical evidence. */
export class SimulatedPrinterV2 implements PrinterAdapterV2 {
  private connected = false;
  private ready = false;
  private generation = 0;
  private observedAt = Date.now();
  private listeners = new Set<(observation: PrinterObservationV2) => void>();
  private sent = new Set<string>();
  private oldJobPending = false;
  private commands = 0;

  constructor(
    private readonly printerId: string,
    private readonly write: (image: Uint8Array) => Promise<void> = async () => {}
  ) {}

  get commandCount() {
    return this.commands;
  }

  async connect(expectedPrinterId?: string) {
    if (expectedPrinterId && expectedPrinterId !== this.printerId)
      throw new Error('Printer identity changed');
    if (!this.connected) {
      this.generation++;
      this.ready = !this.oldJobPending;
    }
    this.connected = true;
    this.observedAt = Date.now();
    return this.readReadiness();
  }

  async readReadiness(): Promise<PrinterReadinessSnapshot> {
    return {
      printerId: this.printerId,
      connectionGeneration: this.generation,
      connected: this.connected,
      ready: this.ready,
      observedAgeMs: Date.now() - this.observedAt,
    };
  }

  observe(listener: (observation: PrinterObservationV2) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async sendOnce(authorization: DispatchAuthorization, image: Uint8Array) {
    if (this.sent.has(authorization.dispatchId)) return;
    if (
      !this.connected ||
      !this.ready ||
      authorization.printerId !== this.printerId ||
      authorization.connectionGeneration !== this.generation ||
      !image.byteLength
    )
      throw new Error('Printer not ready for authorized send');
    this.sent.add(authorization.dispatchId);
    this.oldJobPending = true;
    this.ready = false;
    this.commands++;
    await this.write(image);
  }

  emit(
    kind: Extract<PrinterObservationV2, { attemptId: string }>['kind'],
    authorization: DispatchAuthorization
  ): void;
  emit(kind: 'connection_changed' | 'ready_for_new_job'): void;
  emit(kind: PrinterObservationV2['kind'], authorization?: DispatchAuthorization) {
    if (kind === 'connection_changed') {
      this.connected = false;
      this.ready = false;
    }
    if (kind === 'ready_for_new_job') {
      this.oldJobPending = false;
      this.ready = this.connected;
    }
    this.observedAt = Date.now();
    const base = {
      observationId: crypto.randomUUID(),
      adapterVersion: 'simulator-v2',
      evidenceVersion: 'simulator-v1',
      connectionGeneration: authorization?.connectionGeneration ?? this.generation,
    };
    const observation: PrinterObservationV2 =
      kind === 'connection_changed' || kind === 'ready_for_new_job'
        ? { ...base, kind, printerId: this.printerId }
        : {
            ...base,
            kind,
            attemptId: authorization!.attemptId,
            dispatchId: authorization!.dispatchId,
          };
    this.listeners.forEach((listener) => listener(observation));
  }
}
