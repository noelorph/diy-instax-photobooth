import {
  READINESS_MAX_AGE_MS,
  type DispatchAuthorization,
  type ReloadRequestBinding,
} from '@/lib/operations/package-contract';
import { validateTrialJpeg } from '@/features/qualification/image';
import {
  connectMiniLink3,
  type PrinterConnection,
  type WebBluetoothPort,
} from '@/features/qualification/instax/bluetooth';
import { createCandidateObservation } from '@/features/qualification/instax/candidates';
import { INSTAX_OPCODES } from '@/features/qualification/instax/protocol';
import { preflightPrinter, sendTrialPrint } from '@/features/qualification/instax/session';
import type {
  PrinterAdapterV2,
  PrinterObservationV2,
  PrinterReadinessSnapshot,
} from './contract-v2';

const evidence = {
  adapterVersion: 'instax-mini-link3-v1',
  evidenceVersion: 'instax-fi033-0102-dev-v1',
  modelNumber: 'FI033',
  firmwareRevision: '0102',
} as const;
type Job = {
  authorization: DispatchAuthorization;
  detector: ReturnType<typeof createCandidateObservation>;
  completed: boolean;
  safe: boolean;
  unknown: boolean;
  expiry?: ReturnType<typeof setTimeout>;
};
type Owner = {
  active: boolean;
  generation: number;
  connection?: PrinterConnection;
  timer?: ReturnType<typeof setTimeout>;
  polling?: Promise<void>;
  retiring?: Promise<void>;
  sending: boolean;
  observedAt: number | null;
  ready: boolean;
  job?: Job;
  reload?: {
    request: ReloadRequestBinding;
    detector: ReturnType<typeof createCandidateObservation>;
    expiry: ReturnType<typeof setTimeout>;
  };
  coverOpen?: boolean;
  loadFault?: { loadFault: 'cover_open' | 'load_change'; loadFaultId: string };
};

/** Development evidence only; an interrupted job cannot be cleared by reconnecting. */
export class MiniLink3PrinterV2 implements PrinterAdapterV2 {
  private owner?: Owner;
  private connecting?: Promise<PrinterReadinessSnapshot>;
  private printerId = '';
  private generation = 0;
  private unsafe = false;
  private disposed = false;
  private sent = new Set<string>();
  private observedReloads = new Set<string>();
  private listeners = new Set<(event: PrinterObservationV2) => void>();

  constructor(private readonly bluetooth: WebBluetoothPort) {}

  async connect(
    expectedPrinterId?: string,
    previousGeneration = 0
  ): Promise<PrinterReadinessSnapshot> {
    if (this.disposed) throw Error('Printer owner disposed');
    if (!this.owner?.active && !this.connecting) {
      const owner: Owner = {
        active: true,
        generation: Math.max(this.generation, previousGeneration) + 1,
        sending: false,
        observedAt: null,
        ready: false,
      };
      const retired = this.owner;
      this.owner = owner;
      this.connecting = this.open(owner, expectedPrinterId, retired?.retiring).finally(() => {
        this.connecting = undefined;
      });
    }
    if (this.connecting) await this.connecting;
    if (expectedPrinterId && expectedPrinterId !== this.printerId)
      throw Error('Printer identity changed');
    if (previousGeneration > this.generation) throw Error('Stale connection generation');
    return this.readReadiness();
  }

  private async open(owner: Owner, expectedPrinterId?: string, retiring?: Promise<void>) {
    try {
      await retiring;
      if (!this.current(owner)) throw Error('Connection retired');
      const connection = await connectMiniLink3(this.bluetooth, {
        onResponse: () => {},
        onDisconnect: () => {
          if (this.current(owner)) this.fault(owner);
        },
      });
      owner.connection = connection;
      if (!this.current(owner)) {
        await connection.disconnect();
        throw Error('Connection retired');
      }
      if (
        !connection.deviceId ||
        (expectedPrinterId && connection.deviceId !== expectedPrinterId) ||
        (this.printerId && connection.deviceId !== this.printerId)
      )
        throw Error('Printer identity missing or changed');
      if (connection.modelNumber !== 'FI033' || connection.firmwareRevision !== '0102')
        throw Error('Unsupported printer model or firmware');
      this.printerId = connection.deviceId;
      this.generation = owner.generation;
      await preflightPrinter(this.transport(owner), true);
      if (!this.current(owner)) throw Error('Connection retired');
      await this.poll(owner);
      if (!this.current(owner)) throw Error('Connection retired');
      this.schedule(owner);
      return this.readReadiness();
    } catch (error) {
      this.fault(owner);
      await (owner.retiring ?? owner.connection?.disconnect());
      throw error;
    }
  }

  private current(owner: Owner) {
    return !this.disposed && this.owner === owner && owner.active;
  }

  // Check ownership at every exchange, including the harness's delayed upload continuations.
  private transport(owner: Owner): PrinterConnection {
    return {
      ...owner.connection!,
      exchange: async (...args) => {
        if (!this.current(owner)) throw Error('Connection retired');
        try {
          const response = await owner.connection!.exchange(...args);
          if (!this.current(owner)) throw Error('Connection retired');
          return response;
        } catch (error) {
          this.fault(owner);
          throw error;
        }
      },
    };
  }

  async readReadiness(): Promise<PrinterReadinessSnapshot> {
    const owner = this.owner;
    const connected = !!owner && this.current(owner);
    const age =
      owner?.observedAt == null
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, Date.now() - owner.observedAt);
    const snapshot = {
      printerId: this.printerId,
      connectionGeneration: this.generation,
      connected,
      ready:
        connected &&
        !!owner?.ready &&
        !owner.sending &&
        !this.unsafe &&
        age <= READINESS_MAX_AGE_MS,
      observedAgeMs: age,
      evidence: connected ? evidence : null,
      oldJobCleared: connected && !this.unsafe,
    };
    return owner?.loadFault ? { ...snapshot, ...owner.loadFault } : snapshot;
  }

  observe(listener: (event: PrinterObservationV2) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(
    owner: Owner,
    kind: Exclude<PrinterObservationV2['kind'], 'film_loaded'>,
    job = owner.job
  ) {
    if (this.disposed || this.owner !== owner) return;
    const base = {
      observationId: crypto.randomUUID(),
      adapterVersion: evidence.adapterVersion,
      evidenceVersion: evidence.evidenceVersion,
      connectionGeneration: owner.generation,
    };
    const event: PrinterObservationV2 =
      kind === 'connection_changed'
        ? { ...base, kind, printerId: this.printerId }
        : { ...base, ...job!.authorization, kind };
    this.listeners.forEach((listener) => listener(event));
  }

  private unknown(owner: Owner) {
    const job = owner.job;
    if (!job || job.unknown) return;
    job.unknown = true;
    job.safe = false;
    clearTimeout(job.expiry);
    job.detector.invalidate('Observation interrupted');
    this.unsafe = true;
    this.emit(owner, 'outcome_unknown');
  }

  private fault(owner: Owner) {
    if (!this.current(owner)) return;
    owner.active = false;
    owner.ready = false;
    clearTimeout(owner.timer);
    clearTimeout(owner.reload?.expiry);
    owner.reload = undefined;
    owner.retiring = owner.connection?.disconnect().catch(() => {});
    this.unknown(owner);
    if (this.printerId && owner.generation === this.generation)
      this.emit(owner, 'connection_changed');
  }

  private schedule(owner: Owner) {
    if (!this.current(owner) || owner.sending) return;
    owner.timer = setTimeout(() => {
      owner.polling = this.poll(owner).finally(() => {
        owner.polling = undefined;
        this.schedule(owner);
      });
    }, 900);
  }

  private async poll(owner: Owner) {
    try {
      for (const selector of [2, 3]) {
        if (!this.current(owner)) return;
        const reload = owner.reload;
        const response = await this.transport(owner).exchange(
          INSTAX_OPCODES.supportFunctionInfo,
          new Uint8Array([selector]),
          10_000
        );
        if (!this.current(owner)) return;
        if (response.payload[1] !== selector) throw Error('Unexpected status/history selector');
        if (reload && owner.reload === reload) {
          const result = reload.detector.observe(response);
          if (result.blockedReason || result.candidate) {
            clearTimeout(reload.expiry);
            owner.reload = undefined;
            if (result.candidate) {
              owner.loadFault = undefined;
              const event: PrinterObservationV2 = {
                ...reload.request,
                kind: 'film_loaded',
                observationId: crypto.randomUUID(),
                adapterVersion: evidence.adapterVersion,
                evidenceVersion: evidence.evidenceVersion,
              };
              this.listeners.forEach((listener) => listener(event));
            }
          }
        }
        const job = owner.job;
        const readiness = createCandidateObservation('ejection').observe(response);
        // Recognized loading preserves previously proven safety; it never clears an unsafe job.
        const loading =
          job?.safe &&
          ((!readiness.status?.operating &&
            readiness.blockedReason === 'Cover opened during print observation') ||
            (readiness.status?.operating &&
              readiness.status.operationInfo === 2 &&
              readiness.status.printResult === 127 &&
              !readiness.status.coverOpen &&
              readiness.blockedReason === 'Unrecognized operation/result sequence'));
        const snapshot = job && !loading ? job.detector.observe(response) : readiness;
        if (readiness.status) owner.coverOpen = readiness.status.coverOpen;
        if (snapshot.status?.coverOpen && !owner.reload && !owner.loadFault)
          owner.loadFault = { loadFault: 'cover_open', loadFaultId: crypto.randomUUID() };
        if (snapshot.blockedReason) {
          owner.ready = false;
          if (job && !loading) this.unknown(owner);
          continue;
        }
        if (selector !== 2 || !snapshot.status) continue;
        const status = snapshot.status;
        owner.observedAt = Date.now();
        owner.ready =
          !status.coverOpen &&
          !status.operating &&
          !status.error &&
          status.operationInfo === 0 &&
          status.printResult === 0 &&
          status.filmRemaining > 0;
        if (!job || job.unknown) continue;
        if (snapshot.candidate && !job.completed) {
          job.completed = true;
          clearTimeout(job.expiry);
          this.emit(owner, 'full_ejection_confirmed');
        } else if (snapshot.candidate && job.completed && !job.safe) {
          job.safe = true;
          this.unsafe = false;
          this.emit(owner, 'ready_for_new_job');
        }
      }
    } catch {
      this.fault(owner);
    }
  }

  observeReload(request: ReloadRequestBinding) {
    const owner = this.owner;
    if (
      !owner ||
      !this.current(owner) ||
      request.printerId !== this.printerId ||
      request.connectionGeneration !== owner.generation
    )
      return () => {};
    const key = JSON.stringify([
      request.reloadRequestId,
      request.reloadRequestRevision,
      request.printerId,
      request.connectionGeneration,
    ]);
    if (this.observedReloads.has(key)) return () => {};
    this.observedReloads.add(key);
    clearTimeout(owner.reload?.expiry);
    const reload = {
      request: { ...request },
      detector: createCandidateObservation('reload'),
      expiry: setTimeout(() => {
        if (owner.reload === reload) owner.reload = undefined;
      }, 60_000),
    };
    owner.reload = reload;
    return () => {
      clearTimeout(reload.expiry);
      if (owner.reload === reload) owner.reload = undefined;
      // The scoped request already holds film readiness; closed-cover acknowledgement retires its local fault.
      if (owner.coverOpen === false) owner.loadFault = undefined;
    };
  }

  async sendOnce(authorization: DispatchAuthorization, image: Uint8Array): Promise<void> {
    if (this.sent.has(authorization.dispatchId)) return;
    this.sent.add(authorization.dispatchId);
    const owner = this.owner;
    if (
      !owner ||
      !this.current(owner) ||
      owner.sending ||
      !owner.ready ||
      owner.observedAt === null ||
      Date.now() - owner.observedAt > READINESS_MAX_AGE_MS ||
      this.unsafe ||
      authorization.printerId !== this.printerId ||
      authorization.connectionGeneration !== owner.generation
    )
      throw Error('Printer not ready for authorized send');
    owner.sending = true;
    clearTimeout(owner.timer);
    const job: Job = {
      authorization: { ...authorization },
      detector: createCandidateObservation('ejection'),
      completed: false,
      safe: false,
      unknown: false,
    };
    try {
      await owner.polling;
      try {
        validateTrialJpeg(image);
      } catch {
        this.emit(owner, 'definitely_not_sent', job);
        return;
      }
      if (
        !this.current(owner) ||
        !owner.ready ||
        owner.observedAt === null ||
        Date.now() - owner.observedAt > READINESS_MAX_AGE_MS ||
        this.unsafe
      ) {
        this.emit(owner, 'definitely_not_sent', job);
        return;
      }
      owner.job = job;
      this.unsafe = true;
      const result = await sendTrialPrint(this.transport(owner), image, () => {});
      if (!this.current(owner)) return;
      if (result.kind !== 'accepted') {
        this.unknown(owner);
        return;
      }
      this.emit(owner, 'command_accepted');
      job.expiry = setTimeout(() => {
        if (this.current(owner)) this.unknown(owner);
      }, 60_000);
    } finally {
      owner.sending = false;
      this.schedule(owner);
    }
  }

  async disconnect() {
    if (this.disposed) return;
    const owner = this.owner;
    this.disposed = true;
    this.listeners.clear();
    if (owner) {
      owner.active = false;
      clearTimeout(owner.timer);
      clearTimeout(owner.job?.expiry);
      clearTimeout(owner.reload?.expiry);
      await (owner.retiring ?? owner.connection?.disconnect());
    }
  }
}
