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
import type { PrinterAdapterV2, PrinterReadinessSnapshot } from './printer/contract-v2';
import type { BoothMetadataJournal } from './print-journal';
export type BoothTransport = (path: string, body?: Record<string, unknown>) => Promise<unknown>;
export type Photo = { bytes: Uint8Array; url: string; discard: () => void };
export type Phase =
  'loading' | 'welcome' | 'paused' | 'finishing' | 'finished' | 'access-required' | 'unavailable';
export type View = {
  phase: Phase;
  title?: string;
  message?: string;
  photoUrl?: string;
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
  private initialized?: Promise<void>;
  private refreshing?: Promise<void>;
  private reporting?: Promise<void>;
  private nextObservation?: EquipmentObservation;
  private expiry?: ReturnType<typeof setTimeout>;
  private equipmentEpoch = 0;
  private state?: State;
  private equipment?: {
    observation: z.infer<typeof readinessObservationSchema>;
    at: number;
    printer: PrinterReadinessSnapshot;
  };
  private acknowledgedAt = 0;
  constructor(
    private readonly dependencies: {
      transport: BoothTransport;
      printer: PrinterAdapterV2;
      journal: BoothMetadataJournal;
    }
  ) {}
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private show(view: View) {
    if (this.disposed) return;
    this.view = view;
    this.listeners.forEach((listener) => listener());
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
  private failure(error: unknown) {
    this.acknowledgedAt = 0;
    const status =
      typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    const access = status === 401 || status === 403 || this.view.phase === 'access-required';
    if (access) this.state = undefined;
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
            await this.dependencies.transport('/api/booth/handoff/confirm', body)
          );
        } catch {
          /* A committed confirmation is recovered only through scoped state. */
        }
      }
      await this.refresh();
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
      const raw = await this.dependencies.transport('/api/booth/state');
      if (this.disposed) return;
      if (z.object({ state: z.literal('Finished') }).safeParse(raw).success) {
        this.state = undefined;
        this.show({ phase: 'finished', blockers: [], allowedActions: emptyActions });
        return;
      }
      this.state = stateSchema.parse(raw);
      await this.project();
    } catch (error) {
      this.failure(error);
    }
  }
  private async project() {
    const state = this.state;
    if (!state || this.disposed) return;
    const printer = await this.dependencies.printer.readReadiness();
    if (this.disposed) return;
    const equipment = this.equipment;
    const fresh = !!equipment && Date.now() - equipment.at <= READINESS_MAX_AGE_MS;
    const camera =
      fresh && equipment.observation.cameraLive && equipment.observation.cameraPermission;
    const connected = printer.connected && printer.observedAgeMs <= READINESS_MAX_AGE_MS;
    const printerReady =
      connected &&
      printer.ready &&
      !!equipment &&
      equipment.printer.printerId === printer.printerId &&
      equipment.printer.connectionGeneration === printer.connectionGeneration;
    const blockers = [...state.blockers];
    if (!camera) blockers.push('camera');
    if (!connected) blockers.push('printer_connection');
    if (!printerReady) blockers.push('printer_not_safe');
    if (!this.acknowledgedAt || Date.now() - this.acknowledgedAt > READINESS_MAX_AGE_MS)
      blockers.push('readiness_stale');
    const phase: Phase =
      state.state === 'Paused'
        ? 'paused'
        : state.state === 'Finishing'
          ? 'finishing'
          : state.state === 'Finished'
            ? 'finished'
            : state.state === 'Active' && state.allowedActions.startGuest && blockers.length === 0
              ? 'welcome'
              : 'unavailable';
    this.show({
      phase,
      counts: state.counts,
      blockers: [...new Set(blockers)],
      allowedActions: { connectPrinter: !connected, enableCamera: !camera },
    });
  }
  reportEquipment(observation: z.infer<typeof readinessObservationSchema>): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const parsed = readinessObservationSchema.parse(observation);
    this.equipmentEpoch++;
    this.nextObservation = {
      observation: parsed,
      at: Date.now(),
      epoch: this.equipmentEpoch,
      // A newer window cannot attest equipment observed before it was issued.
      readinessWindowId: this.state?.readinessWindowId,
    };
    if (!parsed.cameraLive || !parsed.cameraPermission || !parsed.printerConnected) {
      this.invalidateAdmission(
        !parsed.cameraLive || !parsed.cameraPermission ? 'camera' : 'printer_connection'
      );
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
      this.acknowledgedAt = 0;
      await this.project();
      if (!this.current(pending)) return;
      const body = packageActionSchemas.reportReadiness.parse({
        operationId: crypto.randomUUID(),
        readinessWindowId: pending.readinessWindowId,
        observedAgeMs: printer.observedAgeMs + Date.now() - at,
        printerId: printer.printerId,
        connectionGeneration: printer.connectionGeneration,
        observation: {
          ...observation,
          printerConnected: printer.connected,
          printerReady: printer.ready,
          oldJobCleared: printer.ready,
        },
      });
      packageReplySchema.parse(await this.dependencies.transport('/api/booth/readiness', body));
      if (!this.current(pending)) return;
      this.acknowledgedAt = at;
      clearTimeout(this.expiry);
      this.expiry = setTimeout(
        () => this.invalidateAdmission('readiness_stale'),
        Math.max(0, READINESS_MAX_AGE_MS - (Date.now() - at)) + 1
      );
      await this.readState();
    } catch (error) {
      this.failure(error);
    }
  }
  async connectPrinter() {
    if (this.disposed) return;
    this.acknowledgedAt = 0;
    try {
      const before = await this.dependencies.printer.readReadiness();
      const connected = await this.dependencies.printer.connect(before.printerId);
      if (
        before.connectionGeneration > 0 &&
        connected.connectionGeneration !== before.connectionGeneration
      ) {
        await this.refresh();
        if (!this.state || this.disposed) return;
        const body = packageActionSchemas.reportReadiness.parse({
          operationId: crypto.randomUUID(),
          kind: 'connection_changed',
          readinessWindowId: this.state.readinessWindowId,
          printerId: connected.printerId,
          connectionGeneration: connected.connectionGeneration,
          expectedRevision: this.state.revision,
        });
        packageReplySchema.parse(await this.dependencies.transport('/api/booth/readiness', body));
        await this.refresh();
      }
      await this.project();
    } catch (error) {
      this.failure(error);
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.expiry);
    this.acknowledgedAt = 0;
    this.listeners.clear();
  }
}
export const boothFetch = async (
  path: string,
  body?: Record<string, unknown>,
  adminUserId?: string
): Promise<unknown> => {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(adminUserId ? { 'x-package-admin-id': adminUserId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw Object.assign(new Error('Booth request failed'), { status: response.status });
  return response.json();
};
