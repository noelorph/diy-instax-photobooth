export type TrialEventInput = {
  kind: string;
  attemptId?: string;
  opcode?: number;
  statusByte?: number;
  filmRemaining?: number;
  responseHex?: string;
  message?: string;
};
export type TrialEvent = TrialEventInput & { runId: string; timestamp: string; elapsedMs: number };
export type TrialLog = {
  readonly runId: string;
  beginRun(): void;
  record(event: TrialEventInput): TrialEvent;
  getEvents(): TrialEvent[];
  exportJson(): string;
  newAttemptId(): string;
};

export function createTrialLog(clock: { now(): number; iso(): string }): TrialLog {
  let start = clock.now();
  let runId = `run-${crypto.randomUUID()}`;
  let attemptSequence = 0;
  const events: TrialEvent[] = [];
  return {
    get runId() {
      return runId;
    },
    beginRun() {
      runId = `run-${crypto.randomUUID()}`;
      start = clock.now();
      attemptSequence = 0;
    },
    newAttemptId: () => `${runId}-attempt-${++attemptSequence}`,
    record(input) {
      const event: TrialEvent = {
        runId,
        timestamp: clock.iso(),
        elapsedMs: Math.max(0, clock.now() - start),
        kind: String(input.kind).slice(0, 64),
      };
      if (input.attemptId !== undefined) event.attemptId = String(input.attemptId).slice(0, 100);
      if (input.opcode !== undefined) event.opcode = input.opcode & 65535;
      if (input.statusByte !== undefined) event.statusByte = input.statusByte & 255;
      if (input.filmRemaining !== undefined) event.filmRemaining = input.filmRemaining & 15;
      if (input.message !== undefined) event.message = String(input.message).slice(0, 300);
      if (
        input.responseHex !== undefined &&
        ['printer-response', 'status', 'link3-status'].includes(input.kind)
      ) {
        event.responseHex = String(input.responseHex)
          .replace(/[^0-9a-f]/gi, '')
          .slice(0, 256);
      }
      events.push(event);
      return { ...event };
    },
    exportJson: () => JSON.stringify({ runId, events }, null, 2),
    getEvents: () => events.map((event) => ({ ...event })),
  };
}
