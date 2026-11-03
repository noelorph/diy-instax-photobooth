import { z } from 'zod';
import {
  READINESS_MAX_AGE_MS,
  runStates,
  type PackageCounts,
} from '@/lib/operations/package-contract';
import {
  packageActionSchemas,
  readinessObservationSchema,
} from '@/lib/operations/package-action-schemas';
import type {
  PrinterAdapterV2,
  PrinterObservationV2,
  PrinterReadinessSnapshot,
} from './printer/contract-v2';
import type { BoothMetadataJournal, JournalEntry } from './print-journal';
import { dispatchReservedAttempt, recordAndReportObservation } from './print-dispatch';
export type BoothTransport = (
  path: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal
) => Promise<unknown>;
export type Photo = { bytes: Uint8Array; url: string; discard: () => void };
export type Phase =
  | 'loading'
  | 'welcome'
  | 'preview'
  | 'countdown'
  | 'capturing'
  | 'review'
  | 'printing'
  | 'confirmed'
  | 'paused'
  | 'finishing'
  | 'finished'
  | 'access-required'
  | 'unavailable';
export type View = {
  phase: Phase;
  title?: string;
  message?: string;
  photoUrl?: string;
  captureId?: string;
  shutterCount?: number;
  inactivityWarning?: boolean;
  counts?: PackageCounts;
  blockers: readonly string[];
  allowedActions: { connectPrinter: boolean; enableCamera: boolean };
};
const count = z.number().int().nonnegative();
export const packageCountsSchema = z.object({
  originalPackages: count,
  additionalPackages: count,
  totalBookedPrints: count,
  printed: count,
  unresolved: count,
  printsRemaining: count,
  printsAvailable: count,
});
export const packageReplySchema = z.object({
  receipt: z.object({
    operationId: z.uuid(),
    kind: z.string(),
    committedRevision: z.number().int(),
    result: z.record(z.string(), z.unknown()),
  }),
  revision: z.number().int(),
  replayed: z.boolean(),
});
const stateSchema = z.object({
  revision: z.number().int(),
  runId: z.uuid(),
  state: z.enum(runStates),
  counts: packageCountsSchema,
  blockers: z.array(z.string()),
  allowedActions: z.object({ startGuest: z.boolean(), reportReadiness: z.boolean() }).passthrough(),
  readinessWindowId: z.uuid(),
  printerId: z.string().min(1),
  connectionGeneration: z.number().int().nonnegative(),
  pendingAttemptId: z.uuid().nullable().optional(),
});
type State = z.infer<typeof stateSchema>;
type EquipmentObservation = {
  observation: z.infer<typeof readinessObservationSchema>;
  at: number;
  epoch: number;
  readinessWindowId?: string;
};
const emptyActions = { connectPrinter: false, enableCamera: false };
/** One controller for scoped authority; setup observations never cross this ownership boundary. */
export class BoothFlow {
  private view: View = { phase: 'loading', blockers: [], allowedActions: emptyActions };
  private listeners = new Set<() => void>();
  private disposed = false;
  private readonly requests = new AbortController();
  private initialized?: Promise<void>;
  private refreshing?: Promise<void>;
  private reporting?: Promise<void>;
  private nextObservation?: EquipmentObservation;
  private expiry?: ReturnType<typeof setTimeout>;
  private equipmentEpoch = 0;
  private connecting?: Promise<void>;
  private pendingConnection?: Record<string, unknown>;
  private state?: State;
  private equipment?: {
    observation: z.infer<typeof readinessObservationSchema>;
    at: number;
    printer: PrinterReadinessSnapshot;
  };
  private acknowledgedAt = 0;
  private sessionId?: string;
  private sessionClosing?: Promise<void>;
  private starting?: Promise<void>;
  private photo?: Photo;
  private pendingPhoto?: Photo;
  private transportOwnsPhoto = false;
  private captureId?: string;
  private shutterCount = 0;
  private shutterGeneration = 0;
  private attemptId?: string;
  private awaitingJobSafetyAttemptId?: string;
  private dispatchId?: string;
  private pendingRecovery = false;
  private observing = Promise.resolve();
  private readonly stopObserving: () => void;
  private completion?: ReturnType<typeof setTimeout>;
  private warningTimer?: ReturnType<typeof setTimeout>;
  private timeoutTimer?: ReturnType<typeof setTimeout>;
  constructor(
    private readonly dependencies: {
      transport: BoothTransport;
      printer: PrinterAdapterV2;
      journal: BoothMetadataJournal;
    }
  ) {
    this.stopObserving = dependencies.printer.observe((observation) => {
      if (observation.kind === 'connection_changed' && !this.disposed) {
        this.equipmentEpoch++;
        this.stopForBlocker('printer_connection');
      }
      this.observing = this.observing
        .then(() => this.observe(observation))
        .catch((error) => {
          this.failure(error);
        });
    });
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private show(view: View) {
    if (this.disposed) return;
    const changed = this.view.phase !== view.phase;
    const timed = view.phase === 'preview' || view.phase === 'review';
    this.view = {
      ...view,
      inactivityWarning:
        timed && !changed ? (view.inactivityWarning ?? this.view.inactivityWarning) : false,
    };
    if (changed) {
      this.clearInactivity();
      if (view.phase === 'preview' || view.phase === 'review') this.startInactivity();
    }
    this.listeners.forEach((listener) => listener());
  }
  private clearInactivity() {
    clearTimeout(this.warningTimer);
    clearTimeout(this.timeoutTimer);
  }
  private startInactivity() {
    this.warningTimer = setTimeout(() => {
      this.show({ ...this.view, inactivityWarning: true });
    }, 75_000);
    this.timeoutTimer = setTimeout(() => void this.timeout(), 90_000);
  }
  continueGuest(): void {
    if (!this.view.inactivityWarning || !['preview', 'review'].includes(this.view.phase)) return;
    this.clearInactivity();
    this.show({ ...this.view, inactivityWarning: false });
    this.startInactivity();
  }
  async timeout(): Promise<void> {
    if (!['preview', 'review'].includes(this.view.phase) || !this.sessionId) return;
    const sessionId = this.sessionId;
    this.shutterGeneration++;
    this.discardPhoto();
    this.sessionId = undefined;
    this.show({ ...this.view, phase: 'unavailable', photoUrl: undefined, captureId: undefined });
    try {
      await this.closeSession(sessionId);
      await this.refresh();
    } catch (error) {
      this.failure(error);
    }
  }
  private invalidateAdmission(blocker: string) {
    this.acknowledgedAt = 0;
    if (this.view.phase === 'welcome')
      this.show({
        ...this.view,
        phase: 'unavailable',
        blockers: [...new Set([...this.view.blockers, blocker])],
      });
  }
  private stopForBlocker(blocker: string) {
    this.acknowledgedAt = 0;
    if (
      !['preview', 'countdown', 'capturing', 'review', 'printing', 'confirmed'].includes(
        this.view.phase
      )
    ) {
      this.invalidateAdmission(blocker);
      return;
    }
    this.guestStopped();
    this.show({
      ...this.view,
      phase: 'unavailable',
      photoUrl: undefined,
      captureId: undefined,
      blockers: [...new Set([...this.view.blockers, blocker])],
    });
  }
  private discardPhoto() {
    this.photo?.discard();
    this.photo = undefined;
    this.captureId = undefined;
  }
  private discardPendingPhoto() {
    this.pendingPhoto?.discard();
    this.pendingPhoto = undefined;
  }
  private guestStopped() {
    this.clearInactivity();
    this.shutterGeneration++;
    this.discardPendingPhoto();
    if (!this.transportOwnsPhoto) this.discardPhoto();
    if (this.sessionId) {
      const closing = this.endSession(this.sessionId);
      this.sessionClosing = closing;
      void closing
        .catch(() => {
          this.pendingRecovery = true;
        })
        .finally(() => {
          if (this.sessionClosing === closing) this.sessionClosing = undefined;
        });
    }
    this.sessionId = undefined;
  }
  private async endSession(sessionId: string) {
    const body = packageActionSchemas.endSession.parse({
      operationId: crypto.randomUUID(),
      reason: 'booth_stopped',
    });
    const reply = packageReplySchema.parse(
      await this.dependencies.transport(`/api/booth/sessions/${sessionId}/end`, body)
    );
    if (reply.receipt.operationId !== body.operationId || reply.receipt.kind !== 'end_session')
      throw new Error('Unexpected session end receipt');
  }
  private failure(error: unknown) {
    if (this.disposed || this.view.phase === 'finished') return;
    this.acknowledgedAt = 0;
    const status =
      typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    const access = status === 401 || status === 403 || this.view.phase === 'access-required';
    if (access) this.state = undefined;
    this.guestStopped();
    this.show({
      ...(!access ? this.view : {}),
      phase: access
        ? 'access-required'
        : this.state?.state === 'Paused'
          ? 'paused'
          : this.state?.state === 'Finishing'
            ? 'finishing'
            : 'unavailable',
      blockers: access
        ? ['access_required']
        : [
            ...new Set([
              ...this.view.blockers,
              'readiness_stale',
              ...(status === 409 ? [] : ['server_unreachable']),
            ]),
          ],
      allowedActions: access ? emptyActions : this.view.allowedActions,
      photoUrl: undefined,
      captureId: undefined,
    });
  }
  initialize(handoffId?: string) {
    return (this.initialized ??= this.boot(handoffId));
  }
  private async boot(handoffId?: string) {
    try {
      if (handoffId) {
        const body = packageActionSchemas.confirmHandoff.parse({
          handoffId,
          operationId: crypto.randomUUID(),
        });
        try {
          packageReplySchema.parse(
            await this.dependencies.transport(
              '/api/booth/handoff/confirm',
              body,
              this.requests.signal
            )
          );
        } catch {
          /* A committed confirmation is recovered only through scoped state. */
        }
      }
      await this.refresh();
      if (this.state && !this.sessionId) {
        let entries: readonly JournalEntry[] = [];
        let malformed = false;
        try {
          entries = this.dependencies.journal.readOperations();
        } catch {
          malformed = true;
        }
        if (entries.length || this.state.pendingAttemptId) {
          const status = await this.reconcilePending(entries);
          this.pendingRecovery = malformed || status === 'pending';
          await this.refresh();
        } else if (malformed) {
          this.pendingRecovery = true;
          await this.project();
        }
      }
    } catch (error) {
      this.failure(error);
    }
  }
  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return (this.refreshing ??= this.readState().finally(() => {
      this.refreshing = undefined;
    }));
  }
  private async readState() {
    try {
      const raw = await this.dependencies.transport(
        '/api/booth/state',
        undefined,
        this.requests.signal
      );
      if (this.disposed) return;
      if (z.object({ state: z.literal('Finished') }).safeParse(raw).success) {
        this.state = undefined;
        this.guestStopped();
        this.show({ phase: 'finished', blockers: [], allowedActions: emptyActions });
        return;
      }
      const state = stateSchema.parse(raw);
      if (this.state && state.revision < this.state.revision) return;
      this.state = state;
      await this.project();
    } catch (error) {
      this.failure(error);
    }
  }
  private async project() {
    const state = this.state;
    if (!state || this.disposed) return;
    const printer = await this.dependencies.printer.readReadiness();
    if (this.disposed || this.state !== state) return;
    const equipment = this.equipment;
    const fresh = !!equipment && Date.now() - equipment.at <= READINESS_MAX_AGE_MS;
    const camera =
      fresh && equipment.observation.cameraLive && equipment.observation.cameraPermission;
    const connected = printer.connected && printer.observedAgeMs <= READINESS_MAX_AGE_MS;
    const reconciled =
      printer.printerId === state.printerId &&
      printer.connectionGeneration === state.connectionGeneration &&
      !this.pendingConnection;
    const printerReady =
      reconciled &&
      connected &&
      printer.ready &&
      !!equipment &&
      equipment.observation.printerConnected &&
      equipment.observation.printerReady &&
      equipment.observation.oldJobCleared &&
      equipment.printer.printerId === printer.printerId &&
      equipment.printer.connectionGeneration === printer.connectionGeneration;
    const blockers = [...state.blockers];
    if (this.pendingRecovery) blockers.push('print_pending');
    if (this.sessionClosing) blockers.push('guest_session_closing');
    if (equipment && !equipment.observation.serverReachable) blockers.push('offline');
    if (!camera) blockers.push('camera');
    if (!connected) blockers.push('printer_connection');
    if (!printerReady) blockers.push('printer_not_safe');
    if (!this.acknowledgedAt || Date.now() - this.acknowledgedAt > READINESS_MAX_AGE_MS)
      blockers.push('readiness_stale');
    const owningGuestReady =
      (!!this.sessionId || !!this.starting) &&
      state.state === 'Active' &&
      ((this.view.phase === 'printing' && !!this.attemptId) ||
        blockers.every(
          (blocker) =>
            blocker === 'guest_session_open' ||
            (this.view.phase === 'printing' && blocker === 'print_pending')
        ));
    const confirming =
      this.view.phase === 'confirmed' &&
      !!this.sessionId &&
      camera &&
      connected &&
      reconciled &&
      !!equipment?.observation.serverReachable &&
      blockers.every((blocker) =>
        ['guest_session_open', 'booked_prints_exhausted', 'printer_not_safe'].includes(blocker)
      );
    const phase: Phase =
      state.state === 'Paused'
        ? 'paused'
        : state.state === 'Finishing'
          ? 'finishing'
          : state.state === 'Finished'
            ? 'finished'
            : state.state === 'Active' &&
                (confirming ||
                  owningGuestReady ||
                  (state.allowedActions.startGuest && blockers.length === 0))
              ? 'welcome'
              : 'unavailable';
    if (phase !== 'welcome' && this.sessionId) this.guestStopped();
    const visiblePhase = phase === 'welcome' && this.sessionId ? this.view.phase : phase;
    const showingPhoto = visiblePhase === 'review' || visiblePhase === 'printing';
    this.show({
      phase: visiblePhase,
      photoUrl: showingPhoto ? this.photo?.url : undefined,
      captureId: showingPhoto ? this.captureId : undefined,
      shutterCount: this.shutterCount,
      counts: state.counts,
      blockers: [...new Set(blockers)],
      allowedActions: { connectPrinter: !connected || !reconciled, enableCamera: !camera },
    });
  }
  start(): Promise<void> {
    if (this.starting) return this.starting;
    return (this.starting = this.beginSession().finally(() => {
      this.starting = undefined;
    }));
  }
  private async beginSession(): Promise<void> {
    if (this.view.phase !== 'welcome' || !this.state || this.sessionId) return;
    const state = this.state;
    const body = packageActionSchemas.startSession.parse({
      operationId: crypto.randomUUID(),
      expectedRevision: state.revision,
    });
    try {
      const reply = packageReplySchema.parse(
        await this.dependencies.transport('/api/booth/sessions', body, this.requests.signal)
      );
      if (reply.receipt.operationId !== body.operationId || reply.receipt.kind !== 'start_session')
        throw new Error('Unexpected session receipt');
      const sessionId = z.uuid().parse(reply.receipt.result.sessionId);
      if (this.disposed || this.state?.state !== 'Active' || this.view.phase !== 'welcome') {
        void this.endSession(sessionId).catch(() => {
          this.pendingRecovery = true;
        });
        return;
      }
      this.sessionId = sessionId;
      this.shutterCount = 0;
      this.show({ ...this.view, phase: 'preview', shutterCount: 0 });
    } catch (error) {
      this.failure(error);
    }
  }
  countdown(): void {
    if (this.view.phase === 'preview' && this.sessionId)
      this.show({ ...this.view, phase: 'countdown' });
  }
  async shutter(capture: () => Promise<Photo>): Promise<void> {
    if (this.view.phase !== 'countdown' || !this.sessionId || !this.state) return;
    let pending: Promise<Photo>;
    try {
      pending = capture();
    } catch {
      this.show({ ...this.view, phase: 'preview' });
      return;
    }
    const generation = ++this.shutterGeneration;
    const sessionId = this.sessionId;
    const operationId = crypto.randomUUID();
    const captureId = crypto.randomUUID();
    const capturedAt = new Date().toISOString();
    this.shutterCount++;
    this.show({ ...this.view, phase: 'capturing', shutterCount: this.shutterCount });
    let encoded: Promise<Photo | undefined> | undefined;
    try {
      this.dependencies.journal.putOperation({
        kind: 'capture',
        operationId,
        runId: this.state.runId,
        sessionId,
        captureId,
        capturedAt,
        recordedAt: Date.now(),
      });
      encoded = pending.then((photo) => {
        if (
          generation !== this.shutterGeneration ||
          this.disposed ||
          this.sessionId !== sessionId
        ) {
          photo.discard();
          return undefined;
        }
        this.pendingPhoto = photo;
        return photo;
      });
      const [photo, reply] = await Promise.all([
        encoded,
        this.dependencies.transport(
          '/api/booth/captures',
          packageActionSchemas.recordCapture.parse({
            operationId,
            sessionId,
            captureId,
            capturedAt,
          })
        ),
      ]);
      const acknowledged = packageReplySchema.parse(reply);
      if (
        acknowledged.receipt.operationId !== operationId ||
        acknowledged.receipt.kind !== 'record_capture'
      )
        throw new Error('Unexpected capture receipt');
      this.dependencies.journal.acknowledgeOperation(operationId);
      if (
        !photo ||
        generation !== this.shutterGeneration ||
        this.disposed ||
        this.sessionId !== sessionId
      ) {
        if (this.pendingPhoto === photo) this.discardPendingPhoto();
        return;
      }
      this.discardPhoto();
      this.pendingPhoto = undefined;
      this.photo = photo;
      this.captureId = captureId;
      this.show({
        ...this.view,
        phase: 'review',
        photoUrl: photo.url,
        captureId,
        shutterCount: this.shutterCount,
      });
    } catch (error) {
      if (generation === this.shutterGeneration) this.failure(error);
      if (!encoded) void pending.then((photo) => photo.discard()).catch(() => {});
    }
  }
  retake(): void {
    if (this.view.phase !== 'review' || !this.sessionId) return;
    this.discardPhoto();
    this.show({ ...this.view, phase: 'preview', photoUrl: undefined, captureId: undefined });
  }
  async print(): Promise<void> {
    if (this.view.phase !== 'review' || !this.sessionId || !this.captureId || !this.photo) return;
    const sessionId = this.sessionId;
    const captureId = this.captureId;
    const photo = this.photo;
    this.show({ ...this.view, phase: 'printing' });
    try {
      await this.refresh();
      if (this.getSnapshot().phase !== 'printing' || !this.state || this.sessionId !== sessionId)
        return;
      const runId = this.state.runId;
      const printerId = this.state.printerId;
      const connectionGeneration = this.state.connectionGeneration;
      const old = this.dependencies.journal.readOperations();
      if (old.length && (await this.reconcilePending(old)) !== 'clear')
        throw new Error('Previous operation pending');
      this.transportOwnsPhoto = true;
      await dispatchReservedAttempt(
        {
          runId,
          sessionId,
          captureId,
          reservationOperationId: crypto.randomUUID(),
          dispatchOperationId: crypto.randomUUID(),
          printerId,
          connectionGeneration,
          image: photo.bytes,
        },
        {
          journal: this.dependencies.journal,
          printer: this.dependencies.printer,
          reconcile: (entries) => this.reconcilePending(entries),
          canSendNow: () =>
            !this.disposed &&
            this.view.phase === 'printing' &&
            this.sessionId === sessionId &&
            this.state?.state === 'Active' &&
            !!this.equipment &&
            Date.now() - this.equipment.at <= READINESS_MAX_AGE_MS &&
            this.equipment.observation.cameraLive &&
            this.equipment.observation.cameraPermission &&
            this.equipment.observation.serverReachable &&
            this.equipment.observation.printerConnected &&
            this.equipment.observation.printerReady &&
            this.equipment.observation.oldJobCleared,
          releaseImage: () => {
            this.transportOwnsPhoto = false;
            if (this.photo === photo) this.discardPhoto();
          },
          reserve: async (operationId) => {
            await this.refresh();
            if (!this.state || this.sessionId !== sessionId) throw new Error('Guest stopped');
            const body = packageActionSchemas.reserve.parse({
              operationId,
              expectedRevision: this.state.revision,
              sessionId,
              captureId,
            });
            const reply = packageReplySchema.parse(
              await this.dependencies.transport(
                '/api/booth/print-attempts',
                body,
                this.requests.signal
              )
            );
            if (reply.receipt.operationId !== operationId || reply.receipt.kind !== 'reserve')
              throw new Error('Unexpected reservation receipt');
            this.attemptId = z.uuid().parse(reply.receipt.result.attemptId);
            return { attemptId: this.attemptId };
          },
          authorizeDispatch: async (attemptId, operationId) => {
            await this.refresh();
            if (!this.state || this.sessionId !== sessionId) throw new Error('Guest stopped');
            const body = packageActionSchemas.dispatch.parse({
              operationId,
              expectedRevision: this.state.revision,
              printerId,
              connectionGeneration,
            });
            const reply = z
              .object({
                ...packageReplySchema.shape,
                sendAllowed: z.boolean(),
                authorization: z
                  .object({
                    attemptId: z.uuid(),
                    dispatchId: z.uuid(),
                    printerId: z.string(),
                    connectionGeneration: count,
                  })
                  .optional(),
              })
              .parse(
                await this.dependencies.transport(
                  `/api/booth/print-attempts/${attemptId}/dispatch`,
                  body,
                  this.requests.signal
                )
              );
            if (reply.receipt.operationId !== operationId || reply.receipt.kind !== 'dispatch')
              throw new Error('Unexpected dispatch receipt');
            this.dispatchId = reply.authorization?.dispatchId;
            await this.refresh();
            return reply;
          },
        }
      );
      this.show({ ...this.view, photoUrl: undefined, captureId: undefined });
    } catch (error) {
      this.failure(error);
    }
  }
  async reconcilePending(entries: readonly JournalEntry[]): Promise<'clear' | 'pending'> {
    const raw = await this.dependencies.transport(
      '/api/booth/state',
      undefined,
      this.requests.signal
    );
    const state = stateSchema.parse(raw);
    if (this.state && state.runId !== this.state.runId) return 'pending';
    this.state = state;
    let attemptId = state.pendingAttemptId ?? this.attemptId;
    let terminal = false;
    const confirmed: string[] = [];
    let missingReservation = false;
    for (const entry of entries) {
      if (entry.runId !== state.runId) return 'pending';
      if (
        entry.kind === 'observation' &&
        'attemptId' in entry &&
        ((state.pendingAttemptId && entry.attemptId !== state.pendingAttemptId) ||
          (attemptId && entry.attemptId !== attemptId))
      )
        return 'pending';
      let receipt: z.infer<typeof packageReplySchema>['receipt'];
      try {
        receipt = packageReplySchema.shape.receipt.parse(
          (
            (await this.dependencies.transport(
              `/api/booth/operations/${entry.operationId}`,
              undefined,
              this.requests.signal
            )) as { receipt: unknown }
          ).receipt
        );
      } catch (error) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('status' in error) ||
          error.status !== 404
        )
          throw error;
        if (entry.kind === 'reservation') missingReservation = true;
        if (entry.kind === 'observation') {
          if (!attemptId) return 'pending';
          const replay = await this.reportObservationEntry(entry, attemptId);
          confirmed.push(entry.operationId);
          if (
            replay.receipt.result.state === 'Printed' ||
            replay.receipt.result.state === 'NotPrinted'
          )
            terminal = true;
        }
        continue;
      }
      const expectedKind = {
        capture: 'record_capture',
        reservation: 'reserve',
        dispatch_intent: 'dispatch',
        observation: 'observe',
      }[entry.kind];
      if (receipt.operationId !== entry.operationId || receipt.kind !== expectedKind)
        return 'pending';
      confirmed.push(entry.operationId);
      if (entry.kind === 'reservation') attemptId = z.uuid().parse(receipt.result.attemptId);
      if (
        entry.kind === 'observation' &&
        (receipt.result.state === 'Printed' || receipt.result.state === 'NotPrinted')
      )
        terminal = true;
    }
    if (missingReservation) {
      const oldSession = entries.find((entry) => entry.kind === 'reservation');
      if (oldSession?.kind !== 'reservation') return 'pending';
      await this.closeSession(oldSession.sessionId);
      const after = stateSchema.parse(
        await this.dependencies.transport('/api/booth/state', undefined, this.requests.signal)
      );
      if (after.pendingAttemptId) return 'pending';
      // Confirmed session closure fences any delayed reservation request.
      confirmed.push(oldSession.operationId);
    }
    if (attemptId && !terminal && (entries.length || !this.sessionId)) {
      const body = packageActionSchemas.reconcile.parse({
        operationId: crypto.randomUUID(),
        reason: 'booth_recovery',
      });
      const reply = packageReplySchema.parse(
        await this.dependencies.transport(
          `/api/booth/print-attempts/${attemptId}/reconcile`,
          body,
          this.requests.signal
        )
      );
      if (reply.receipt.operationId !== body.operationId || reply.receipt.kind !== 'reconcile')
        return 'pending';
      terminal =
        reply.receipt.result.state === 'NotPrinted' || reply.receipt.result.state === 'Printed';
    }
    for (const id of confirmed) this.dependencies.journal.acknowledgeOperation(id);
    try {
      return (attemptId && !terminal) || this.dependencies.journal.readOperations().length
        ? 'pending'
        : 'clear';
    } catch {
      return 'pending';
    }
  }
  private async closeSession(sessionId: string) {
    const body = packageActionSchemas.endSession.parse({
      operationId: crypto.randomUUID(),
      reason: 'booth_recovery',
    });
    const reply = packageReplySchema.parse(
      await this.dependencies.transport(
        `/api/booth/sessions/${sessionId}/end`,
        body,
        this.requests.signal
      )
    );
    if (reply.receipt.operationId !== body.operationId || reply.receipt.kind !== 'end_session')
      throw new Error('Unexpected session end receipt');
    if (this.sessionId === sessionId) this.sessionId = undefined;
  }
  private async observe(observation: PrinterObservationV2) {
    const runId = this.state?.runId;
    if (!runId || this.disposed) return;
    const attemptId =
      'attemptId' in observation
        ? observation.attemptId
        : (this.attemptId ?? this.awaitingJobSafetyAttemptId ?? this.state?.pendingAttemptId);
    if (!attemptId) return;
    await recordAndReportObservation(
      runId,
      observation,
      this.dependencies.journal,
      async (entry) => {
        const reply = await this.reportObservationEntry(entry, attemptId);
        if (
          entry.observationKind === 'full_ejection_confirmed' &&
          'attemptId' in entry &&
          entry.attemptId === this.attemptId &&
          entry.dispatchId === this.dispatchId &&
          reply.receipt.result.state === 'Printed'
        ) {
          this.awaitingJobSafetyAttemptId = entry.attemptId;
          await this.refresh();
          if (this.view.phase !== 'printing') return;
          this.show({
            ...this.view,
            phase: 'confirmed',
            photoUrl: undefined,
            captureId: undefined,
          });
          clearTimeout(this.completion);
          this.completion = setTimeout(() => void this.finishConfirmed(), 3_000);
        }
      }
    );
    if (observation.kind === 'ready_for_new_job' && attemptId === this.awaitingJobSafetyAttemptId) {
      this.awaitingJobSafetyAttemptId = undefined;
      this.dispatchId = undefined;
    }
  }
  private async reportObservationEntry(
    entry: Extract<JournalEntry, { kind: 'observation' }>,
    attemptId: string
  ) {
    const body = packageActionSchemas.observe.parse({
      operationId: entry.operationId,
      attemptId,
      observationId: entry.observationId,
      kind: entry.observationKind,
      evidenceVersion: entry.evidenceVersion,
      connectionGeneration: entry.connectionGeneration,
      metadata: {},
    });
    const { attemptId: _attemptId, ...httpBody } = body;
    void _attemptId;
    const reply = packageReplySchema.parse(
      await this.dependencies.transport(
        `/api/booth/print-attempts/${attemptId}/observations`,
        httpBody,
        this.requests.signal
      )
    );
    if (reply.receipt.operationId !== entry.operationId || reply.receipt.kind !== 'observe')
      throw new Error('Unexpected observation receipt');
    return reply;
  }
  private async finishConfirmed() {
    if (this.view.phase !== 'confirmed' || !this.sessionId) return;
    try {
      await this.closeSession(this.sessionId);
      this.attemptId = undefined;
      await this.refresh();
    } catch (error) {
      this.failure(error);
    }
  }
  reportEquipment(observation: z.infer<typeof readinessObservationSchema>): Promise<void> {
    if (this.disposed || this.connecting) return Promise.resolve();
    const parsed = readinessObservationSchema.parse(observation);
    const negative =
      !parsed.cameraLive ||
      !parsed.cameraPermission ||
      !parsed.printerConnected ||
      !parsed.serverReachable ||
      !parsed.printerReady ||
      !parsed.oldJobCleared;
    if (
      !negative &&
      this.attemptId &&
      (this.view.phase === 'printing' || this.view.phase === 'confirmed')
    )
      return Promise.resolve();
    // Healthy samples do not invalidate a still-fresh in-flight acknowledgement.
    if (negative) this.equipmentEpoch++;
    this.nextObservation = {
      observation: parsed,
      at: Date.now(),
      epoch: this.equipmentEpoch,
      // A newer window cannot attest equipment observed before it was issued.
      readinessWindowId: this.state?.readinessWindowId,
    };
    if (negative) {
      const blocker = !parsed.serverReachable
        ? 'offline'
        : !parsed.cameraLive || !parsed.cameraPermission
          ? 'camera'
          : !parsed.printerConnected
            ? 'printer_connection'
            : 'printer_not_safe';
      this.stopForBlocker(blocker);
      if (this.equipment) this.equipment.observation = parsed;
      void this.project();
    }
    return (this.reporting ??= this.drainReports().finally(() => {
      this.reporting = undefined;
    }));
  }
  private async drainReports() {
    while (this.nextObservation && !this.disposed) {
      const observation = this.nextObservation;
      this.nextObservation = undefined;
      await this.report(observation);
    }
  }
  private current(observation: EquipmentObservation) {
    return (
      !this.disposed &&
      this.view.phase !== 'finished' &&
      this.view.phase !== 'access-required' &&
      observation.epoch === this.equipmentEpoch &&
      Date.now() - observation.at <= READINESS_MAX_AGE_MS
    );
  }
  private async report(pending: EquipmentObservation) {
    const { observation, at } = pending;
    try {
      if (!this.current(pending)) return;
      await this.refresh();
      if (!this.state || !pending.readinessWindowId || !this.current(pending)) return;
      const printer = await this.dependencies.printer.readReadiness();
      if (!this.current(pending)) return;
      this.equipment = { observation, at, printer };
      if (
        !printer.connected ||
        !printer.ready ||
        printer.printerId !== this.state.printerId ||
        printer.connectionGeneration !== this.state.connectionGeneration
      )
        this.acknowledgedAt = 0;
      await this.project();
      if (!this.current(pending)) return;
      const body = packageActionSchemas.reportReadiness.parse({
        operationId: crypto.randomUUID(),
        readinessWindowId: pending.readinessWindowId,
        observedAgeMs: printer.observedAgeMs + Date.now() - at,
        printerId: printer.printerId,
        // A disconnected owner invalidates the bound connection, never attests a live one.
        connectionGeneration: printer.connected
          ? printer.connectionGeneration
          : this.state.connectionGeneration,
        observation: {
          ...observation,
          printerConnected: observation.printerConnected && printer.connected,
          printerReady: observation.printerReady && printer.ready,
          oldJobCleared: observation.oldJobCleared && printer.ready,
        },
      });
      packageReplySchema.parse(
        await this.dependencies.transport('/api/booth/readiness', body, this.requests.signal)
      );
      if (!this.current(pending)) return;
      this.acknowledgedAt =
        observation.cameraLive &&
        observation.cameraPermission &&
        observation.serverReachable &&
        observation.printerConnected &&
        observation.printerReady &&
        observation.oldJobCleared &&
        printer.connected &&
        printer.ready
          ? at
          : 0;
      clearTimeout(this.expiry);
      this.expiry = setTimeout(
        () => this.invalidateAdmission('readiness_stale'),
        Math.max(0, READINESS_MAX_AGE_MS - (Date.now() - at)) + 1
      );
      await this.refresh();
    } catch (error) {
      this.failure(error);
    }
  }
  connectPrinter(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return (this.connecting ??= this.reconcileConnection().finally(() => {
      this.connecting = undefined;
    }));
  }
  private async reconcileConnection() {
    this.equipmentEpoch++;
    this.invalidateAdmission('readiness_stale');
    try {
      // A readiness write can advance the revision used by the connection operation.
      await this.reporting;
      // Retry an uncertain write unchanged before issuing another connection operation.
      if (!this.pendingConnection) {
        await this.refresh();
        const state = this.state;
        if (!state || this.disposed) return;
        const connected = await this.dependencies.printer.connect(
          state.printerId,
          state.connectionGeneration
        );
        if (this.disposed) return;
        if (connected.printerId !== state.printerId) throw new Error('Printer identity changed');
        if (connected.connectionGeneration !== state.connectionGeneration) {
          this.pendingConnection = packageActionSchemas.reportReadiness.parse({
            operationId: crypto.randomUUID(),
            kind: 'connection_changed',
            readinessWindowId: state.readinessWindowId,
            printerId: connected.printerId,
            connectionGeneration: connected.connectionGeneration,
            expectedRevision: state.revision,
          });
        }
      }
      if (this.pendingConnection) {
        await this.project();
        const body = this.pendingConnection;
        const reply = packageReplySchema.parse(
          await this.dependencies.transport('/api/booth/readiness', body, this.requests.signal)
        );
        if (
          reply.receipt.operationId !== body.operationId ||
          reply.receipt.kind !== 'report_readiness'
        )
          throw new Error('Unexpected connection receipt');
        this.pendingConnection = undefined;
        await this.refresh();
      }
      await this.project();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409)
        this.pendingConnection = undefined;
      this.failure(error);
    }
  }
  dispose() {
    this.disposed = true;
    this.stopObserving();
    this.guestStopped();
    this.requests.abort();
    clearTimeout(this.expiry);
    clearTimeout(this.completion);
    this.clearInactivity();
    this.acknowledgedAt = 0;
    this.listeners.clear();
  }
}
export const boothFetch = async (
  path: string,
  body?: Record<string, unknown>,
  adminUserId?: string,
  signal?: AbortSignal
): Promise<unknown> => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, READINESS_MAX_AGE_MS);
  try {
    const response = await fetch(path, {
      signal: controller.signal,
      method: body ? 'POST' : 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(adminUserId ? { 'x-package-admin-id': adminUserId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw Object.assign(new Error('Booth request failed'), {
        status: response.status,
        code: typeof details?.code === 'string' ? details.code : undefined,
      });
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
};
