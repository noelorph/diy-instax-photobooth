import type { PrinterAdapter, PrinterObservation } from './printer/contract';
export type Availability = { guestPrints: number; filmSheets: number; printerBusy: boolean };
type Reply = {
  runId?: string;
  sessionId?: string;
  captureId?: string;
  sessionState?: 'Abandoned';
  attemptId?: string;
  state?: string;
  display?: { title: string };
  availability?: Availability;
};
export type BoothTransport = (path: string, body?: Record<string, unknown>) => Promise<Reply>;
export type Photo = { bytes: Uint8Array; url: string; discard: () => void };
export type Phase =
  | 'loading'
  | 'welcome'
  | 'preview'
  | 'countdown'
  | 'capturing'
  | 'review'
  | 'preparing'
  | 'printing'
  | 'confirmed'
  | 'connection-hold'
  | 'uncertain'
  | 'paused'
  | 'unavailable';
export type View = { phase: Phase; title?: string; photoUrl?: string; message?: string };
type Journal = {
  runId?: string;
  sessionId?: string;
  capture?: { operationKey: string; capturedAt: string };
  captureId?: string;
  reservation?: { operationKey: string; runId: string; captureId: string };
  attemptId?: string;
};
const journalKey = 'booth-operation';
const evidence = {
  commandAccepted: 'command_acknowledged',
  physicalEjectionVerified: 'simulator_ejection',
  preFilmRejected: 'pre_film_rejection',
  knownUnsent: 'command_not_started',
  uncertain: 'ambiguous_outcome',
} as const;
const ready = (a?: Availability) => !!a && a.guestPrints > 0 && a.filmSheets > 0 && !a.printerBusy;
const denied = (e: unknown) =>
  typeof e === 'object' && e !== null && 'status' in e && (e.status === 401 || e.status === 403);

/** All durable fields are explicitly constructed metadata. Photo is a private, transient reference. */
export class BoothFlow {
  private view: View = { phase: 'loading' };
  private listeners = new Set<() => void>();
  private journal: Journal = {};
  private photo?: Photo;
  private stopped = false;
  private connected = true;
  private resumeBeforePhoto?: 'welcome' | 'preview';
  private sent = false;
  private pauseRequested = false;
  private connectionEpoch = 0;
  private reservationInFlight = false;
  private recovering = false;
  private initialized?: Promise<void>;
  private refreshInFlight?: Promise<void>;
  private captureInFlight?: Promise<Reply>;
  private reportKeys = new Map<string, { operationKey: string; observedAt: string }>();
  constructor(
    private readonly dependencies: {
      transport: BoothTransport;
      printer: PrinterAdapter;
      storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    }
  ) {}
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private show(phase: Phase, message?: string) {
    this.view = {
      phase,
      message,
      title: ['paused', 'uncertain', 'unavailable'].includes(phase) ? undefined : this.view.title,
      photoUrl: this.photo?.url,
    };
    this.listeners.forEach((l) => l());
  }
  private save() {
    this.dependencies.storage.setItem(journalKey, JSON.stringify(this.journal));
  }
  private discard() {
    this.photo?.discard();
    this.photo = undefined;
  }
  private post(path: string, body: Record<string, unknown> = {}) {
    return this.dependencies.transport(`/api/booth/${path}`, {
      operationKey: crypto.randomUUID(),
      ...body,
    });
  }
  private async bootstrap() {
    return this.dependencies.transport('/api/booth/bootstrap');
  }
  initialize(handoffId?: string) {
    return (this.initialized ??= this.boot(handoffId));
  }
  private async boot(handoffId?: string) {
    try {
      const saved = this.dependencies.storage.getItem(journalKey);
      if (saved) this.journal = JSON.parse(saved) as Journal;
      if (handoffId) {
        const confirmed = await this.post('handoffs/confirm', { handoffId });
        // A new authorized handoff is created only after Admin recovery/readiness.
        // Never submit the old run's metadata with the newly scoped grant.
        if (confirmed.runId && confirmed.runId !== this.journal.runId) {
          this.journal = { runId: confirmed.runId };
          this.save();
        }
      }
      // Recover metadata before starting another session. Never infer unsent from a reload.
      if (this.journal.capture && this.journal.sessionId) await this.acknowledgeCapture();
      if (this.stopped) return;
      if (this.journal.reservation && !this.journal.attemptId) {
        const result = await this.post(
          `guest-sessions/${this.journal.sessionId}/print-attempts`,
          this.journal.reservation
        );
        this.journal.attemptId = result.attemptId;
        this.save();
      }
      if (this.journal.attemptId) {
        await this.uncertain();
        return;
      }
      if (this.journal.sessionId) await this.abandon();
      const result = await this.bootstrap();
      if (result.availability?.printerBusy) {
        await this.connectionChanged();
        return;
      }
      this.journal = { runId: result.runId };
      this.save();
      this.view = { phase: 'welcome', title: result.display?.title };
      this.show(ready(result.availability) ? 'welcome' : 'unavailable');
    } catch {
      this.discard();
      this.show('paused');
    }
  }
  async start() {
    if (this.stopped || this.pauseRequested || !this.connected || this.view.phase !== 'welcome')
      return;
    this.show('loading');
    try {
      const result = await this.post('guest-sessions', { runId: this.journal.runId });
      this.journal.sessionId = result.sessionId;
      this.save();
      if (this.stopped) return;
      this.show('preview');
    } catch {
      this.show('paused');
    }
  }
  countdown() {
    if (!this.stopped && !this.pauseRequested && this.connected && this.view.phase === 'preview')
      this.show('countdown');
  }
  async shutter(capture: () => Promise<Photo>) {
    if (this.stopped || this.pauseRequested || !this.connected || this.view.phase !== 'countdown')
      return;
    try {
      await this.refresh();
      if (this.stopped || this.pauseRequested || !this.connected || this.view.phase !== 'countdown')
        return;
      this.show('capturing');
      // capture() draws the frame synchronously before its encoding promise yields.
      const pendingPhoto = capture();
      // Own both promise outcomes before any storage operation can throw.
      let journalSaved = false;
      const ownedPhoto = pendingPhoto.then((photo) => {
        if (!journalSaved) photo.discard();
        return photo;
      });
      void ownedPhoto.catch(() => {});
      this.journal.capture = {
        operationKey: crypto.randomUUID(),
        capturedAt: new Date().toISOString(),
      };
      this.save();
      journalSaved = true;
      const [photo, acknowledgement] = await Promise.allSettled([
        ownedPhoto,
        this.acknowledgeCapture(),
      ]);
      if (photo.status === 'fulfilled') {
        if (this.stopped || this.pauseRequested || acknowledgement.status === 'rejected')
          photo.value.discard();
        else {
          this.discard();
          this.photo = photo.value;
        }
      }
      if (this.stopped || this.pauseRequested) return;
      if (photo.status === 'rejected') {
        await this.connectionChanged();
        return;
      }
      if (acknowledgement.status === 'rejected') {
        this.show('paused');
        return;
      }
      this.show(this.connected ? 'review' : 'connection-hold');
    } catch {
      this.discard();
      this.show('paused');
    }
  }
  private acknowledgeCapture(): Promise<Reply> {
    if (this.captureInFlight) return this.captureInFlight;
    if (!this.journal.capture) return Promise.resolve({});
    this.captureInFlight = this.post(
      `guest-sessions/${this.journal.sessionId}/captures`,
      this.journal.capture
    )
      .then((result) => {
        this.journal.captureId = result.captureId;
        delete this.journal.capture;
        if (result.sessionState === 'Abandoned') {
          this.stopped = true;
          this.discard();
          this.show('paused');
        }
        this.save();
        return result;
      })
      .finally(() => {
        this.captureInFlight = undefined;
      });
    return this.captureInFlight;
  }
  retake() {
    if (this.view.phase !== 'review' || this.stopped) return;
    this.discard();
    this.show('preview');
  }
  refresh(): Promise<void> {
    // A revoked bootstrap clears the cookie. Settle queued shutter metadata first.
    if (this.journal.capture) return this.captureInFlight ? Promise.resolve() : this.online();
    if (this.view.phase === 'connection-hold' && this.journal.reservation) return this.online();
    return (this.refreshInFlight ??= this.refreshAuthority().finally(() => {
      this.refreshInFlight = undefined;
    }));
  }
  private async refreshAuthority() {
    if (this.stopped || this.pauseRequested) return;
    try {
      const result = await this.bootstrap();
      if (this.stopped) return;
      if (this.resumeBeforePhoto && ready(result.availability)) {
        const phase = this.resumeBeforePhoto;
        this.resumeBeforePhoto = undefined;
        this.connected = true;
        this.view = { ...this.view, title: result.display?.title };
        this.show(phase);
      }
      if (this.view.phase === 'connection-hold' && this.photo && ready(result.availability)) {
        this.connected = true;
        this.show('review');
      }
      if (!this.journal.attemptId && !this.journal.reservation && !ready(result.availability)) {
        this.discard();
        this.show('unavailable');
      }
    } catch (e) {
      if (denied(e)) {
        if (this.sent && this.journal.attemptId) {
          this.pauseRequested = true;
          return;
        }
        this.stopped = true;
        this.discard();
        if (this.journal.attemptId) await this.uncertain();
        else this.show('paused');
      } else this.offline();
    }
  }
  async print() {
    if (
      this.stopped ||
      this.pauseRequested ||
      !this.connected ||
      this.view.phase !== 'review' ||
      !this.photo ||
      !this.journal.captureId
    )
      return;
    const connectionEpoch = this.connectionEpoch;
    this.show('preparing', 'Preparing');
    await this.refresh();
    if (
      this.stopped ||
      this.pauseRequested ||
      !this.connected ||
      !this.photo ||
      this.getSnapshot().phase !== 'preparing'
    )
      return;
    this.journal.reservation = {
      operationKey: crypto.randomUUID(),
      runId: this.journal.runId!,
      captureId: this.journal.captureId,
    };
    this.reservationInFlight = true;
    try {
      this.save(); // Must succeed before the request can commit a reservation.
      const reserved = await this.post(
        `guest-sessions/${this.journal.sessionId}/print-attempts`,
        this.journal.reservation
      );
      this.journal.attemptId = reserved.attemptId;
      this.save();
      if (this.stopped) {
        await this.uncertain();
        return;
      }
      if (this.pauseRequested) {
        await this.report('knownUnsent');
        this.clearAttempt();
        this.discard();
        this.stopped = true;
        this.show('paused');
        return;
      }
      if (!this.connected || this.connectionEpoch !== connectionEpoch) {
        await this.report('knownUnsent');
        this.clearAttempt();
        this.show('connection-hold');
        return;
      }
      // No await between this barrier and sendOnce. A detected stop cannot slip through.
      if (!this.photo) {
        await this.uncertain();
        return;
      }
      this.sent = true;
      this.show('printing', 'Sending');
      const observations = await this.dependencies.printer.sendOnce(
        this.journal.attemptId!,
        this.photo.bytes
      );
      for (const observation of observations) {
        if (this.stopped) return;
        if (observation.attemptId !== this.journal.attemptId) {
          await this.uncertain();
          return;
        }
        await this.observe(observation.kind);
      }
    } catch (e) {
      if (this.sent || this.stopped) await this.uncertain();
      else if (denied(e)) {
        this.stopped = true;
        this.discard();
        this.show('paused');
      } else this.show('connection-hold');
    } finally {
      this.reservationInFlight = false;
    }
  }
  private async report(kind: PrinterObservation['kind']) {
    const id = this.journal.attemptId;
    if (!id) throw new Error('No pending attempt');
    const key = `${id}:${kind}`;
    let metadata = this.reportKeys.get(key);
    if (!metadata) {
      metadata = { operationKey: crypto.randomUUID(), observedAt: new Date().toISOString() };
      this.reportKeys.set(key, metadata);
    }
    return this.post(`print-attempts/${id}/observations`, {
      ...metadata,
      observationKind: kind,
      evidenceCode: evidence[kind],
    });
  }
  private clearAttempt() {
    delete this.journal.reservation;
    delete this.journal.attemptId;
    this.sent = false;
    this.save();
  }
  private async observe(kind: PrinterObservation['kind']) {
    if (kind === 'uncertain') {
      await this.uncertain();
      return;
    }
    if (this.pauseRequested && kind === 'commandAccepted') return;
    let result: Reply;
    try {
      result = await this.report(kind);
    } catch (error) {
      // A pause can win the Event lock after our Active check. It rejects
      // acknowledgement but still accepts this pending attempt's final evidence.
      if (
        kind === 'commandAccepted' &&
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 409
      ) {
        this.pauseRequested = true;
        this.show('printing', 'Waiting for film to eject');
        return;
      }
      throw error;
    }
    if (this.pauseRequested && result.state !== 'Accepted') {
      this.discard();
      this.clearAttempt();
      this.stopped = true;
      this.show('paused');
      return;
    }
    if (this.stopped) return;
    if (kind === 'commandAccepted') {
      this.show('printing', 'Waiting for film to eject');
      return;
    }
    if (result.state === 'Confirmed') {
      this.discard();
      this.journal = { runId: this.journal.runId };
      this.save();
      this.sent = false;
      this.show('confirmed');
    } else if (result.state === 'RejectedUnused') {
      this.clearAttempt();
      const current = await this.bootstrap();
      if (!this.stopped && this.photo && ready(current.availability))
        this.show('review', 'Your photo did not print. You can try again.');
      else {
        await this.requestPause();
        this.discard();
        this.show('unavailable');
      }
    } else await this.uncertain();
  }
  private async uncertain() {
    this.stopped = true;
    this.discard();
    this.show('uncertain');
    if (this.journal.attemptId) {
      try {
        await this.report('uncertain');
      } catch {
        /* Metadata stays for recovery; never resend. */
      }
    }
  }
  async requestPause() {
    if (this.stopped || this.pauseRequested) return;
    this.pauseRequested = true;
    if (!this.sent) {
      this.discard();
      this.show('paused');
    }
    try {
      if (this.journal.capture) await this.acknowledgeCapture();
      if (this.stopped) return;
      await this.post('pauses');
      if (!this.journal.attemptId && !this.journal.reservation) this.stopped = true;
    } catch {
      if (this.sent) await this.uncertain();
      else {
        this.stopped = true;
        this.show('paused');
      }
    }
  }
  async printTimedOut() {
    if (this.view.phase === 'printing') await this.uncertain();
  }
  async connectionChanged() {
    this.stopped = true;
    this.discard();
    this.show(this.journal.attemptId || this.journal.reservation ? 'uncertain' : 'paused');
    try {
      if (this.journal.capture && (await this.acknowledgeCapture()).sessionState === 'Abandoned')
        return;
      await this.post('connection-changes');
    } catch {
      if (this.journal.attemptId) await this.uncertain();
    }
  }
  offline() {
    if (['welcome', 'preview', 'countdown'].includes(this.view.phase))
      this.resumeBeforePhoto = this.view.phase === 'welcome' ? 'welcome' : 'preview';
    this.connectionEpoch++;
    this.connected = false;
    if (this.sent) {
      void this.uncertain();
      return;
    }
    if (this.photo) this.show('connection-hold');
    else if (!this.stopped) this.show('unavailable');
  }
  async online() {
    this.connected = true;
    if (this.reservationInFlight || this.recovering) return;
    this.recovering = true;
    try {
      if (this.journal.capture) {
        try {
          const result = await this.acknowledgeCapture();
          if (result.sessionState !== 'Abandoned') await this.post('pauses');
        } catch {
          // Retain the stable Capture metadata for another bounded retry or reload.
        } finally {
          this.stopped = true;
          this.discard();
          this.show('paused');
        }
        return;
      }
      if (this.stopped) {
        if (this.journal.attemptId) await this.uncertain();
        return;
      }
      if (this.journal.reservation) {
        try {
          const result = await this.post(
            `guest-sessions/${this.journal.sessionId}/print-attempts`,
            this.journal.reservation
          );
          this.journal.attemptId = result.attemptId;
          this.save();
          if (this.stopped || this.sent) {
            await this.uncertain();
            return;
          }
          await this.report('knownUnsent');
          this.clearAttempt();
        } catch {
          this.show('connection-hold');
          return;
        }
      }
      await this.refresh();
      if (!this.stopped && this.photo && this.view.phase !== 'unavailable') this.show('review');
    } finally {
      this.recovering = false;
    }
  }
  private async abandon() {
    await this.post(`guest-sessions/${this.journal.sessionId}/abandon`);
    this.journal = { runId: this.journal.runId };
    this.save();
  }
  async timeout() {
    if (!['preview', 'review'].includes(this.view.phase)) return;
    this.discard();
    this.show('loading');
    try {
      await this.abandon();
      await this.welcome();
    } catch {
      this.show('paused');
    }
  }
  async welcome() {
    if (this.stopped) return;
    try {
      const result = await this.bootstrap();
      this.show(ready(result.availability) ? 'welcome' : 'unavailable');
    } catch {
      this.discard();
      this.show('paused');
    }
  }
  dispose() {
    this.stopped = true;
    this.discard();
    this.listeners.clear();
  }
}

export const boothFetch: BoothTransport = async (path, body) => {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw Object.assign(new Error('Booth request failed'), { status: response.status });
  return response.json();
};
