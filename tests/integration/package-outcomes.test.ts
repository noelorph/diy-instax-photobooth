import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createPackageFixture, type PackageFixture } from '../fixtures/package-contract';
import { localOwnerSql } from '../fixtures/local-supabase';

let priorPolicy: string;
beforeAll(() => {
  priorPolicy = String(
    localOwnerSql('select mode from public.printer_completion_policy where id')[0].mode
  );
  localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
});
afterAll(() => {
  localOwnerSql(`update public.printer_completion_policy set mode='${priorPolicy}' where id`);
});

function ready(f: PackageFixture, generation = 0) {
  localOwnerSql(
    `update public.booth_runs set readiness_observation='{"printerMode":"simulated","printerEvidence":{"adapterVersion":"simulator-v2","evidenceVersion":"simulator-v1","modelNumber":null,"firmwareRevision":null},"cameraPermission":true,"cameraLive":true,"serverReachable":true,"printerConnected":true,"printerReady":true,"oldJobCleared":true,"connectionGeneration":${generation}}'::jsonb,observed_at=clock_timestamp(),received_at=clock_timestamp() where id='${f.runId}'`
  );
}

async function attempt(f: PackageFixture, dispatch = true) {
  f.seedRun();
  ready(f);
  const started = await f.booth('start_session', { expectedRevision: 2 });
  expect(started.error).toBeNull();
  const sessionId = started.data.receipt.result.sessionId as string;
  const captureId = randomUUID();
  expect(
    (
      await f.booth('record_capture', {
        sessionId,
        captureId,
        capturedAt: String(localOwnerSql('select clock_timestamp() as at')[0].at),
      })
    ).error
  ).toBeNull();
  ready(f);
  const reserved = await f.booth('reserve', {
    sessionId,
    captureId,
    expectedRevision: (await f.readBooth()).data.revision,
  });
  expect(reserved.error).toBeNull();
  const attemptId = reserved.data.receipt.result.attemptId as string;
  if (!dispatch) return attemptId;
  ready(f);
  const dispatched = await f.booth('dispatch', {
    attemptId,
    printerId: 'fixture-printer',
    connectionGeneration: 0,
    expectedRevision: reserved.data.revision,
  });
  expect(dispatched.error).toBeNull();
  return attemptId;
}

function observation(
  f: PackageFixture,
  attemptId: string,
  kind: string,
  metadata: Record<string, unknown> = {},
  observationId = randomUUID(),
  generation = 0
) {
  return f.booth(
    'observe',
    {
      attemptId,
      observationId,
      kind,
      evidenceVersion: 'simulator-v1',
      connectionGeneration: generation,
      metadata,
    },
    observationId
  );
}

for (const [kind, state] of [
  ['definitely_not_sent', 'NotPrinted'],
  ['command_accepted', 'Accepted'],
  ['full_ejection_confirmed', 'Printed'],
  ['no_film_rejected', 'NotPrinted'],
  ['outcome_unknown', 'Pending'],
  ['connection_changed', 'Pending'],
  ['ready_for_new_job', 'Dispatching'],
] as const) {
  it(`${kind} records its qualified state without inventing a print`, async () => {
    const f = await createPackageFixture();
    try {
      const attemptId = await attempt(f);
      const result = await observation(f, attemptId, kind);
      expect(result.error).toBeNull();
      expect(
        localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
      ).toBe(state);
      expect((await f.readBooth()).data.counts).toMatchObject({
        printed: state === 'Printed' ? 1 : 0,
        unresolved: ['Dispatching', 'Accepted', 'Pending'].includes(state) ? 1 : 0,
      });
    } finally {
      await f.dispose();
    }
  }, 30000);
}

it('keeps a terminal print immutable and records conflicting later evidence', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    const id = randomUUID();
    expect((await observation(f, attemptId, 'full_ejection_confirmed', {}, id)).error).toBeNull();
    expect((await observation(f, attemptId, 'full_ejection_confirmed', {}, id)).data.replayed).toBe(
      true
    );
    const conflict = await observation(f, attemptId, 'definitely_not_sent');
    expect(conflict.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Printed');
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.print_attempt_events where attempt_id='${attemptId}' and state='Discrepancy'`
      )[0].n
    ).toBe(1);
    expect((await f.readBooth()).data.counts.printed).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);

it('does not release a hold when not-sent evidence contradicts command acceptance', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'command_accepted')).error).toBeNull();
    expect((await observation(f, attemptId, 'definitely_not_sent')).error).toBeNull();
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Pending');
    expect((await f.readAdmin()).data.counts).toMatchObject({ printed: 0, unresolved: 1 });
    expect(
      localOwnerSql(`select blockers from public.booth_runs where id='${f.runId}'`)[0].blockers
    ).toContain('evidence_discrepancy');
  } finally {
    await f.dispose();
  }
}, 30000);

it.each(['definitely_not_sent', 'server_cancelled'])(
  'blocks late acceptance after proven non-send: %s',
  async (source) => {
    const f = await createPackageFixture();
    try {
      const attemptId = await attempt(f, source !== 'server_cancelled');
      const settled =
        source === 'server_cancelled'
          ? await f.booth('reconcile', { attemptId, reason: 'Reservation never dispatched' })
          : await observation(f, attemptId, 'definitely_not_sent');
      expect(settled.error).toBeNull();
      const id = randomUUID();
      const result = await observation(f, attemptId, 'command_accepted', {}, id);
      expect(result.error).toBeNull();
      expect(result.data.receipt.result.discrepancy).toBe(true);
      expect(
        localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
      ).toBe('NotPrinted');
      const before = (await f.readBooth()).data;
      expect(before.counts).toMatchObject({ printed: 0, unresolved: 0 });
      expect(before.readiness.blockers).toContain('evidence_discrepancy');
      const events = localOwnerSql(
        `select count(*)::integer n from public.print_attempt_events where attempt_id='${attemptId}'`
      )[0].n;
      const replay = await observation(f, attemptId, 'command_accepted', {}, id);
      expect(replay.error).toBeNull();
      expect(replay.data).toMatchObject({ replayed: true, receipt: result.data.receipt });
      expect((await f.readBooth()).data).toMatchObject({
        revision: before.revision,
        counts: before.counts,
      });
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.print_attempt_events where attempt_id='${attemptId}'`
        )[0].n
      ).toBe(events);
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.print_attempt_events where attempt_id='${attemptId}' and state='Discrepancy'`
        )[0].n
      ).toBe(1);
      expect(
        (
          await f.admin('pause', {
            runId: f.runId,
            expectedRevision: (await f.readAdmin()).data.revision,
          })
        ).error
      ).toBeNull();
      const requested = await f.admin('request_reload', {
        runId: f.runId,
        reason: 'Physical reload',
        printerId: 'fixture-printer',
        connectionGeneration: 0,
        expectedRevision: (await f.readAdmin()).data.revision,
      });
      expect(requested.error).toBeNull();
      expect(
        (
          await f.admin('confirm_reload', {
            reloadRequestId: requested.data.receipt.result.reloadRequestId,
            printerId: 'fixture-printer',
            connectionGeneration: 0,
            expectedRevision: (await f.readAdmin()).data.revision,
          })
        ).error
      ).toBeNull();
      expect((await observation(f, attemptId, 'ready_for_new_job')).error).toBeNull();
      ready(f);
      expect(
        (
          await f.admin('resume', {
            runId: f.runId,
            expectedRevision: (await f.readAdmin()).data.revision,
          })
        ).error?.message
      ).toBe('not_ready');
      expect(
        (await f.booth('start_session', { expectedRevision: (await f.readBooth()).data.revision }))
          .error?.message
      ).toBe('not_ready');
      const blockers = localOwnerSql(
        `select blockers from public.booth_runs where id='${f.runId}'`
      )[0].blockers as string[];
      expect(blockers.filter((b) => b === 'evidence_discrepancy')).toHaveLength(1);
      expect((await f.readBooth()).data.counts).toMatchObject(before.counts);
      expect(
        (await observation(f, attemptId, 'command_accepted', {}, randomUUID(), 1)).error?.message
      ).toBe('invalid_transition');
      localOwnerSql(
        `update public.booth_grants set created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' where id='${f.grantId}'`
      );
      expect((await observation(f, attemptId, 'command_accepted', {}, id)).error?.message).toBe(
        'access_required'
      );
      localOwnerSql(
        `update public.booth_grants set expires_at=clock_timestamp()+interval '1 hour',state='Revoked',revoked_at=clock_timestamp() where id='${f.grantId}'`
      );
      expect((await observation(f, attemptId, 'command_accepted', {}, id)).error?.message).toBe(
        'access_required'
      );
    } finally {
      await f.dispose();
    }
  },
  30000
);

it.each(['no_film_rejected', 'inspected'])(
  'keeps late acceptance diagnostic after %s without contradictory non-send evidence',
  async (source) => {
    const f = await createPackageFixture();
    try {
      const attemptId = await attempt(f);
      if (source === 'inspected') {
        expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
        expect(
          (
            await f.admin('resolve_attempt', {
              attemptId,
              outcome: 'not_printed',
              inspectionReason: 'No sheet; old job cleared',
              oldJobCleared: true,
              expectedRevision: (await f.readAdmin()).data.revision,
            })
          ).error
        ).toBeNull();
      } else {
        expect((await observation(f, attemptId, source)).error).toBeNull();
      }
      const result = await observation(f, attemptId, 'command_accepted');
      expect(result.error).toBeNull();
      expect(result.data.receipt.result).toMatchObject({ state: 'NotPrinted', discrepancy: false });
      expect(
        localOwnerSql(
          `select state from public.print_attempt_events where attempt_id='${attemptId}' and evidence_kind='command_accepted'`
        )[0].state
      ).toBe('Diagnostic');
      expect(
        localOwnerSql(`select blockers from public.booth_runs where id='${f.runId}'`)[0].blockers
      ).not.toContain('evidence_discrepancy');
      expect((await f.readBooth()).data.counts).toMatchObject({ printed: 0, unresolved: 0 });
    } finally {
      await f.dispose();
    }
  },
  30000
);

it('a reserved attempt proven unsent preserves old-job safety for the next guest', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f, false);
    expect((await observation(f, attemptId, 'definitely_not_sent')).error).toBeNull();
    expect(
      localOwnerSql(
        `select state,dispatch_id from public.print_attempts where id='${attemptId}'`
      )[0]
    ).toMatchObject({ state: 'NotPrinted', dispatch_id: null });
    expect(
      localOwnerSql(
        `select old_job_safety_confirmed from public.booth_runs where id='${f.runId}'`
      )[0].old_job_safety_confirmed
    ).toBe(true);
    const sessionId = localOwnerSql(
      `select session_id from public.print_attempts where id='${attemptId}'`
    )[0].session_id;
    expect((await f.booth('end_session', { sessionId, reason: 'page_reload' })).error).toBeNull();
    ready(f);
    expect((await f.readBooth()).data.readiness.blockers).not.toContain('printer_not_safe');
    const next = await f.booth('start_session', {
      expectedRevision: (await f.readBooth()).data.revision,
    });
    expect(next.error).toBeNull();
  } finally {
    await f.dispose();
  }
}, 30000);

it('retains command acceptance after an unknown outcome so later not-sent evidence cannot release capacity', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    expect((await observation(f, attemptId, 'command_accepted')).error).toBeNull();
    expect(
      localOwnerSql(
        `select state,accepted_at from public.print_attempts where id='${attemptId}'`
      )[0]
    ).toMatchObject({ state: 'Pending', accepted_at: expect.any(String) });
    expect((await observation(f, attemptId, 'definitely_not_sent')).error).toBeNull();
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Pending');
    expect((await f.readAdmin()).data.counts).toMatchObject({ printed: 0, unresolved: 1 });
    expect(
      localOwnerSql(`select blockers from public.booth_runs where id='${f.runId}'`)[0].blockers
    ).toContain('evidence_discrepancy');
  } finally {
    await f.dispose();
  }
}, 30000);

it('holds capacity through Pending and inspected Not printed releases it without clearing a separate reload request', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    expect((await f.readBooth()).data.counts).toMatchObject({ unresolved: 1, printsAvailable: 9 });
    const rejected = await f.admin('resolve_attempt', {
      attemptId,
      outcome: 'not_printed',
      inspectionReason: 'No sheet emerged',
      oldJobCleared: false,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(rejected.error?.message).toBe('not_ready');
    const resolved = await f.admin('resolve_attempt', {
      attemptId,
      outcome: 'not_printed',
      inspectionReason: 'No sheet emerged; old job cleared',
      oldJobCleared: true,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(resolved.error).toBeNull();
    expect((await f.readBooth()).data.counts).toMatchObject({
      printed: 0,
      unresolved: 0,
      printsAvailable: 10,
    });
    expect(
      localOwnerSql(
        `select old_job_safety_confirmed from public.booth_runs where id='${f.runId}'`
      )[0].old_job_safety_confirmed
    ).toBe(true);
  } finally {
    await f.dispose();
  }
}, 30000);

it('a printed outcome still blocks a new job until qualified idle evidence arrives', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'full_ejection_confirmed')).error).toBeNull();
    ready(f);
    expect((await f.readBooth()).data.readiness.blockers).toContain('printer_not_safe');
    expect((await observation(f, attemptId, 'ready_for_new_job')).error).toBeNull();
    ready(f);
    expect((await f.readBooth()).data.readiness.blockers).not.toContain('printer_not_safe');
  } finally {
    await f.dispose();
  }
}, 30000);

it.each([-60_000, 0, 60_000])(
  'an earlier attempt cannot clear the safety block after a later job settles (host clock offset %i ms)',
  async (offset) => {
    const f = await createPackageFixture();
    try {
      const firstId = await attempt(f);
      expect((await observation(f, firstId, 'full_ejection_confirmed')).error).toBeNull();
      expect((await observation(f, firstId, 'ready_for_new_job')).error).toBeNull();
      const firstSessionId = localOwnerSql(
        `select session_id from public.print_attempts where id='${firstId}'`
      )[0].session_id;
      expect(
        (await f.booth('end_session', { sessionId: firstSessionId, reason: 'page_reload' })).error
      ).toBeNull();
      ready(f);
      const started = await f.booth('start_session', {
        expectedRevision: (await f.readBooth()).data.revision,
      });
      expect(started.error).toBeNull();
      const sessionId = started.data.receipt.result.sessionId as string;
      const captureId = randomUUID();
      const hostTime = Date.now() + offset;
      let capturedAt: string;
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(hostTime);
        // Synthetic shutters share the database timeline; host/VM clocks can differ.
        capturedAt = String(localOwnerSql('select clock_timestamp() as at')[0].at);
      } finally {
        vi.useRealTimers();
      }
      const captured = await f.booth('record_capture', { sessionId, captureId, capturedAt });
      if (captured.error !== null) {
        const timing = localOwnerSql(
          `select created_at, state, closed_at, clock_timestamp() as checked_at from public.guest_sessions where id='${sessionId}'`
        );
        throw new Error(
          `Capture failed: ${captured.error.message}; capturedAt=${capturedAt}; session=${JSON.stringify(timing)}`
        );
      }
      ready(f);
      const reserved = await f.booth('reserve', {
        sessionId,
        captureId,
        expectedRevision: (await f.readBooth()).data.revision,
      });
      expect(reserved.error).toBeNull();
      const secondId = reserved.data.receipt.result.attemptId as string;
      ready(f);
      expect(
        (
          await f.booth('dispatch', {
            attemptId: secondId,
            printerId: 'fixture-printer',
            connectionGeneration: 0,
            expectedRevision: reserved.data.revision,
          })
        ).error
      ).toBeNull();
      expect((await observation(f, secondId, 'full_ejection_confirmed')).error).toBeNull();
      expect(
        localOwnerSql(
          `select old_job_safety_confirmed from public.booth_runs where id='${f.runId}'`
        )[0].old_job_safety_confirmed
      ).toBe(false);
      expect((await observation(f, firstId, 'ready_for_new_job')).error).toBeNull();
      expect(
        localOwnerSql(
          `select old_job_safety_confirmed from public.booth_runs where id='${f.runId}'`
        )[0].old_job_safety_confirmed
      ).toBe(false);
    } finally {
      await f.dispose();
    }
  },
  30000
);

it('current connection idle evidence clears inspected Printed after a reconnect', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'connection_changed')).error).toBeNull();
    localOwnerSql(`update public.booth_runs set connection_generation=1 where id='${f.runId}'`);
    const resolved = await f.admin('resolve_attempt', {
      attemptId,
      outcome: 'printed',
      inspectionReason: 'Full sheet ejected during reconnect',
      oldJobCleared: false,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(resolved.error).toBeNull();
    expect(
      localOwnerSql(
        `select old_job_safety_confirmed from public.booth_runs where id='${f.runId}'`
      )[0].old_job_safety_confirmed
    ).toBe(false);
    expect(
      (await observation(f, attemptId, 'full_ejection_confirmed', {}, randomUUID(), 1)).error
        ?.message
    ).toBe('invalid_transition');
    expect(
      (await observation(f, attemptId, 'ready_for_new_job', {}, randomUUID(), 1)).error
    ).toBeNull();
    expect(
      localOwnerSql(
        `select old_job_safety_confirmed from public.booth_runs where id='${f.runId}'`
      )[0].old_job_safety_confirmed
    ).toBe(true);
    ready(f, 1);
    expect((await f.readBooth()).data.readiness.blockers).not.toContain('printer_not_safe');
  } finally {
    await f.dispose();
  }
}, 30000);

it('a connection change after terminal settlement invalidates dynamic printer readiness', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'full_ejection_confirmed')).error).toBeNull();
    expect((await observation(f, attemptId, 'ready_for_new_job')).error).toBeNull();
    ready(f);
    expect((await f.readBooth()).data.readiness.blockers).not.toContain('readiness_stale');
    expect((await observation(f, attemptId, 'connection_changed')).error).toBeNull();
    expect((await f.readBooth()).data.readiness.blockers).toContain('readiness_stale');
  } finally {
    await f.dispose();
  }
}, 30000);

it('Finishing waits for Pending then closes after its inspected outcome', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    const finished = await f.admin('finish', {
      runId: f.runId,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(finished.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finishing');
    const resolved = await f.admin('resolve_attempt', {
      attemptId,
      outcome: 'printed',
      inspectionReason: 'Full sheet ejected',
      oldJobCleared: false,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(resolved.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finished');
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Printed');
  } finally {
    await f.dispose();
  }
}, 30000);

it('Finishing also closes after the adapter supplies the last qualified outcome', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    expect(
      (
        await f.admin('finish', {
          runId: f.runId,
          expectedRevision: (await f.readAdmin()).data.revision,
        })
      ).error
    ).toBeNull();
    expect((await observation(f, attemptId, 'full_ejection_confirmed')).error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Finished');
    expect((await f.readAdmin()).data.counts.printed).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);

it('rejects unqualified evidence and a wrong generation without settling the hold', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    const base = {
      attemptId,
      observationId: randomUUID(),
      kind: 'full_ejection_confirmed',
      evidenceVersion: 'simulator-v1',
      connectionGeneration: 0,
      metadata: {},
    };
    expect(
      (await f.booth('observe', { ...base, evidenceVersion: 'raw-status' }, base.observationId))
        .error?.message
    ).toBe('invalid_input');
    expect(
      (await f.booth('observe', { ...base, connectionGeneration: 1 }, base.observationId)).error
        ?.message
    ).toBe('invalid_transition');
    expect(
      (await f.booth('observe', { ...base, metadata: { counter: 9 } }, base.observationId)).error
        ?.message
    ).toBe('invalid_input');
    expect((await f.readBooth()).data.counts.unresolved).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);

it('a reconnect cannot use old-generation ejection or idle evidence to clear Pending', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'connection_changed')).error).toBeNull();
    localOwnerSql(`update public.booth_runs set connection_generation=1 where id='${f.runId}'`);
    expect((await observation(f, attemptId, 'full_ejection_confirmed')).error?.message).toBe(
      'invalid_transition'
    );
    expect((await observation(f, attemptId, 'ready_for_new_job')).error?.message).toBe(
      'invalid_transition'
    );
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Pending');
  } finally {
    await f.dispose();
  }
}, 30000);

it('replays an earlier scoped observation receipt after a reconnect', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    const id = randomUUID();
    expect((await observation(f, attemptId, 'command_accepted', {}, id)).error).toBeNull();
    localOwnerSql(`update public.booth_runs set connection_generation=1 where id='${f.runId}'`);
    const replay = await observation(f, attemptId, 'command_accepted', {}, id);
    expect(replay.error).toBeNull();
    expect(replay.data.replayed).toBe(true);
    expect(
      localOwnerSql(`select state from public.print_attempts where id='${attemptId}'`)[0].state
    ).toBe('Accepted');
  } finally {
    await f.dispose();
  }
}, 30000);

it('serializes matching adapter and phone outcomes and retains a later conflict', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    const revision = (await f.readAdmin()).data.revision;
    const [adapter, admin] = await Promise.all([
      observation(f, attemptId, 'full_ejection_confirmed'),
      f.admin('resolve_attempt', {
        attemptId,
        outcome: 'printed',
        inspectionReason: 'Full sheet ejected',
        oldJobCleared: false,
        expectedRevision: revision,
      }),
    ]);
    expect(adapter.error).toBeNull();
    expect(admin.error).toBeNull();
    expect((await f.readAdmin()).data.counts).toMatchObject({ printed: 1, unresolved: 0 });
    const conflict = await f.admin('resolve_attempt', {
      attemptId,
      outcome: 'not_printed',
      inspectionReason: 'Inspection disagreed',
      oldJobCleared: true,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(conflict.error).toBeNull();
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.print_attempt_events where attempt_id='${attemptId}' and state='Discrepancy'`
      )[0].n
    ).toBe(1);
    expect((await f.readAdmin()).data.counts.printed).toBe(1);
  } finally {
    await f.dispose();
  }
}, 30000);

it('retains conflicting simultaneous adapter and inspected outcomes without recounting', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    const revision = (await f.readAdmin()).data.revision;
    const [adapter, admin] = await Promise.all([
      observation(f, attemptId, 'full_ejection_confirmed'),
      f.admin('resolve_attempt', {
        attemptId,
        outcome: 'not_printed',
        inspectionReason: 'No sheet and old job cleared',
        oldJobCleared: true,
        expectedRevision: revision,
      }),
    ]);
    expect(adapter.error).toBeNull();
    expect(admin.error).toBeNull();
    expect(
      localOwnerSql(
        `select count(*)::integer n from public.print_attempt_events where attempt_id='${attemptId}' and state='Discrepancy'`
      )[0].n
    ).toBe(1);
    const state = localOwnerSql(
      `select state from public.print_attempts where id='${attemptId}'`
    )[0].state;
    expect(['Printed', 'NotPrinted']).toContain(state);
    expect((await f.readAdmin()).data.counts.printed).toBe(state === 'Printed' ? 1 : 0);
    expect(
      localOwnerSql(`select blockers from public.booth_runs where id='${f.runId}'`)[0].blockers
    ).toContain('evidence_discrepancy');
  } finally {
    await f.dispose();
  }
}, 30000);

it('a Paused run still accepts qualified outcome evidence without resuming', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    const paused = await f.admin('pause', {
      runId: f.runId,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(paused.error).toBeNull();
    expect((await observation(f, attemptId, 'full_ejection_confirmed')).error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_runs where id='${f.runId}'`)[0].state
    ).toBe('Paused');
  } finally {
    await f.dispose();
  }
}, 30000);

it('disabled policy permits pinned simulated settlement without granting new work', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    localOwnerSql("update public.printer_completion_policy set mode='disabled' where id");
    expect((await observation(f, attemptId, 'full_ejection_confirmed')).error).toBeNull();
    expect(
      (
        await f.admin('resolve_attempt', {
          attemptId,
          outcome: 'printed',
          inspectionReason: 'Sheet ejected',
          oldJobCleared: false,
          expectedRevision: (await f.readAdmin()).data.revision,
        })
      ).error
    ).toBeNull();
    expect((await f.readAdmin()).data.counts).toMatchObject({ printed: 1, unresolved: 0 });
  } finally {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    await f.dispose();
  }
}, 30000);

it('a no-film outcome creates a reload request that confirmation clears independently', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'no_film_rejected')).error).toBeNull();
    const request = localOwnerSql(
      `select id,state from public.booth_reload_requests where run_id='${f.runId}' and state='Open'`
    )[0];
    expect(request).toMatchObject({ state: 'Open' });
    expect((await f.readAdmin()).data.counts).toMatchObject({
      printed: 0,
      unresolved: 0,
      printsAvailable: 10,
    });
    const confirmed = await f.admin('confirm_reload', {
      reloadRequestId: request.id,
      printerId: 'fixture-printer',
      connectionGeneration: 0,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(confirmed.error).toBeNull();
    expect(
      localOwnerSql(`select state from public.booth_reload_requests where id='${request.id}'`)[0]
        .state
    ).toBe('Confirmed');
    expect(
      localOwnerSql(
        `select old_job_safety_confirmed from public.booth_runs where id='${f.runId}'`
      )[0].old_job_safety_confirmed
    ).toBe(false);
  } finally {
    await f.dispose();
  }
}, 30000);

it('late no-film evidence after inspected Not printed still invalidates film readiness', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    expect(
      (
        await f.admin('resolve_attempt', {
          attemptId,
          outcome: 'not_printed',
          inspectionReason: 'No sheet emerged; old job cleared',
          oldJobCleared: true,
          expectedRevision: (await f.readAdmin()).data.revision,
        })
      ).error
    ).toBeNull();
    const before = (await f.readAdmin()).data.counts;
    expect((await observation(f, attemptId, 'no_film_rejected')).error).toBeNull();
    expect((await f.readAdmin()).data.counts).toMatchObject(before);
    expect(
      localOwnerSql(`select film_loaded_confirmed from public.booth_runs where id='${f.runId}'`)[0]
        .film_loaded_confirmed
    ).toBe(false);
    expect(
      localOwnerSql(
        `select state from public.booth_reload_requests where run_id='${f.runId}' and state='Open'`
      )[0]
    ).toMatchObject({ state: 'Open' });
  } finally {
    await f.dispose();
  }
}, 30000);

function seedPrinted(f: PackageFixture, count = 9) {
  localOwnerSql(`do $$ declare sid uuid; cid uuid; begin
    for i in 1..${count} loop
      sid:=gen_random_uuid(); cid:=gen_random_uuid();
      insert into public.guest_sessions(id,event_id,run_id,accounting_version,state,closed_at) values(sid,'${f.eventId}','${f.runId}',2,'Printed',clock_timestamp());
      insert into public.captures(id,event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values(cid,'${f.eventId}','${f.runId}',sid,2,clock_timestamp(),gen_random_uuid());
      insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id,resolved_at) values('${f.eventId}','${f.runId}',sid,cid,2,'Guest','Printed',gen_random_uuid(),gen_random_uuid(),clock_timestamp());
    end loop;
  end $$`);
}

it('the last held unit becomes exhaustion after Printed and availability after Not printed', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    seedPrinted(f);
    expect((await f.readAdmin()).data.counts).toMatchObject({
      printed: 9,
      unresolved: 1,
      printsAvailable: 0,
    });
    expect((await observation(f, attemptId, 'full_ejection_confirmed')).error).toBeNull();
    expect((await f.readAdmin()).data.counts).toMatchObject({
      printed: 10,
      unresolved: 0,
      printsAvailable: 0,
    });
  } finally {
    await f.dispose();
  }
}, 30000);

it('a held last unit returns to availability after inspected Not printed', async () => {
  const f = await createPackageFixture();
  try {
    const attemptId = await attempt(f);
    seedPrinted(f);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    const resolved = await f.admin('resolve_attempt', {
      attemptId,
      outcome: 'not_printed',
      inspectionReason: 'No output and old job cleared',
      oldJobCleared: true,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(resolved.error).toBeNull();
    expect((await f.readAdmin()).data.counts).toMatchObject({
      printed: 9,
      unresolved: 0,
      printsAvailable: 1,
    });
  } finally {
    await f.dispose();
  }
}, 30000);

it('keeps 49 Printed and one Pending at zero availability until the outcome settles', async () => {
  const f = await createPackageFixture({ originalPackages: 5 });
  try {
    const attemptId = await attempt(f);
    seedPrinted(f, 49);
    expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
    expect((await f.readAdmin()).data.counts).toMatchObject({
      totalBookedPrints: 50,
      printed: 49,
      unresolved: 1,
      printsAvailable: 0,
    });
    expect((await f.readBooth()).data.readiness.blockers).toContain('print_pending');
    const resolved = await f.admin('resolve_attempt', {
      attemptId,
      outcome: 'not_printed',
      inspectionReason: 'No output and old job cleared',
      oldJobCleared: true,
      expectedRevision: (await f.readAdmin()).data.revision,
    });
    expect(resolved.error).toBeNull();
    expect((await f.readAdmin()).data.counts).toMatchObject({
      printed: 49,
      unresolved: 0,
      printsAvailable: 1,
    });
  } finally {
    await f.dispose();
  }
}, 30000);

it.each(['full_ejection_confirmed', 'definitely_not_sent'])(
  'rejects a fresh reservation after terminal %s on the same session',
  async (kind) => {
    const f = await createPackageFixture();
    try {
      const attemptId = await attempt(f);
      const row = localOwnerSql(
        `select session_id, capture_id from public.print_attempts where id='${attemptId}'`
      )[0];
      const receipt = localOwnerSql(
        `select operation_key, committed_revision from public.operation_receipts where event_id='${f.eventId}' and operation_kind='reserve'`
      )[0];
      const originalRevision = Number(receipt.committed_revision) - 1;
      expect((await observation(f, attemptId, kind)).error).toBeNull();
      expect((await observation(f, attemptId, 'ready_for_new_job')).error).toBeNull();
      ready(f);
      const replay = await f.booth(
        'reserve',
        {
          sessionId: row.session_id,
          captureId: row.capture_id,
          expectedRevision: originalRevision,
        },
        receipt.operation_key as ReturnType<typeof randomUUID>
      );
      expect(replay.error).toBeNull();
      expect(replay.data.replayed).toBe(true);
      const result = await f.booth('reserve', {
        sessionId: row.session_id,
        captureId: row.capture_id,
        expectedRevision: (await f.readBooth()).data.revision,
      });
      expect(result.error?.message).toBe('invalid_transition');
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.print_attempts where session_id='${row.session_id}'`
        )[0].n
      ).toBe(1);
    } finally {
      await f.dispose();
    }
  },
  30000
);

it.each(['complete', 'cancel'])(
  'replays inspected outcome after Event %s with fresh authority',
  async (action) => {
    const f = await createPackageFixture();
    try {
      const attemptId = await attempt(f);
      expect((await observation(f, attemptId, 'outcome_unknown')).error).toBeNull();
      const operationId = randomUUID();
      const payload = {
        attemptId,
        outcome: 'printed',
        inspectionReason: 'Full sheet ejected',
        oldJobCleared: false,
        expectedRevision: (await f.readAdmin()).data.revision,
      };
      const resolved = await f.admin('resolve_attempt', payload, operationId);
      expect(resolved.error).toBeNull();
      expect(
        (
          await f.admin('finish', {
            runId: f.runId,
            expectedRevision: (await f.readAdmin()).data.revision,
          })
        ).error
      ).toBeNull();
      expect(
        (await f.admin(action, { expectedRevision: (await f.readAdmin()).data.revision })).error
      ).toBeNull();
      const replay = await f.admin('resolve_attempt', payload, operationId);
      expect(replay.error).toBeNull();
      expect(replay.data).toMatchObject({ replayed: true, receipt: resolved.data.receipt });
      expect(
        (await f.admin('resolve_attempt', { ...payload, outcome: 'not_printed' }, operationId))
          .error?.message
      ).toBe('operation_conflict');
      expect((await f.admin('resolve_attempt', payload)).error?.message).toBe(
        'operation_unavailable'
      );
      localOwnerSql(`delete from auth.sessions where id='${f.adminSessionId}'`);
      expect((await f.admin('resolve_attempt', payload, operationId)).error?.message).toBe(
        'access_required'
      );
    } finally {
      await f.dispose();
    }
  },
  30000
);
