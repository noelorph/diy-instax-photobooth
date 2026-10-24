import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createPackageFixture } from '../fixtures/package-contract';
import { localOwnerSql, ownerInsert } from '../fixtures/local-supabase';

it.each([
  'add_event_prints',
  'change_event_run',
  'reserve_test_attempt',
  'prepare_booth_handoff',
  'open_guest_session',
  'record_capture',
  'abandon_guest_session',
  'reserve_guest_attempt',
  'report_booth_observation',
  'resolve_uncertain_print',
  'recover_interrupted_print',
  'report_test_observation',
  'confirm_test_output',
  'mark_wasted_film',
  'request_booth_pause',
  'pause_booth_for_reconnect',
  'finish_booth_handoff',
  'confirm_booth_handoff',
  'complete_event_redaction',
])(
  'legacy %s rejects v2 records before mutation',
  async (name) => {
    const f = await createPackageFixture();
    try {
      f.seedRun();
      const sessionId = randomUUID(),
        captureId = randomUUID(),
        attemptId = randomUUID(),
        handoffId = randomUUID();
      ownerInsert('guest_sessions', {
        id: sessionId,
        event_id: f.eventId,
        run_id: f.runId,
        accounting_version: 2,
      });
      ownerInsert('captures', {
        id: captureId,
        event_id: f.eventId,
        run_id: f.runId,
        session_id: sessionId,
        accounting_version: 2,
        captured_at: new Date().toISOString(),
        shutter_operation_id: randomUUID(),
      });
      ownerInsert('print_attempts', {
        id: attemptId,
        event_id: f.eventId,
        run_id: f.runId,
        session_id: sessionId,
        capture_id: captureId,
        accounting_version: 2,
        kind: 'Guest',
        state: 'Accepted',
        request_key: randomUUID(),
        connection_id: randomUUID(),
      });
      ownerInsert('booth_handoffs', {
        id: handoffId,
        event_id: f.eventId,
        run_id: f.runId,
        grant_id: f.grantId,
        accounting_version: 2,
        admin_user_id: f.adminUser.id,
        admin_session_id: f.adminSessionId,
        device_token_hash: f.deviceHash,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
      const admin = { admin_user_id: f.adminUser.id, admin_session_id: f.adminSessionId };
      const key = { operation_key: randomUUID() },
        grant = { grant_hash: f.grantHash };
      const calls: Record<string, object> = {
        add_event_prints: { ...admin, event_id: f.eventId, quantity: 1 },
        change_event_run: { ...admin, event_id: f.eventId, expected_revision: 2, action: 'pause' },
        reserve_test_attempt: { ...admin, event_id: f.eventId, connection_id: randomUUID() },
        prepare_booth_handoff: {
          ...admin,
          event_id: f.eventId,
          expected_revision: 2,
          connection_id: randomUUID(),
          setup_evidence: {
            device_token_hash: f.deviceHash,
            camera_ready: true,
            printer_ready: true,
            guided_access_ready: true,
            printer_mode: 'simulated',
          },
        },
        open_guest_session: { ...grant, run_id: f.runId },
        record_capture: { ...grant, session_id: sessionId, captured_at: new Date().toISOString() },
        abandon_guest_session: { ...grant, session_id: sessionId },
        reserve_guest_attempt: {
          ...grant,
          run_id: f.runId,
          session_id: sessionId,
          capture_id: captureId,
        },
        report_booth_observation: {
          ...grant,
          attempt_id: attemptId,
          observation_kind: 'commandAccepted',
          evidence_code: 'command_acknowledged',
          observed_at: new Date().toISOString(),
        },
        resolve_uncertain_print: {
          ...admin,
          attempt_id: attemptId,
          outcome: 'unused',
          inspection_reason: 'Old job cleared',
        },
        recover_interrupted_print: {
          ...admin,
          attempt_id: attemptId,
          reason: 'Interrupted transport',
        },
        report_test_observation: {
          ...admin,
          attempt_id: attemptId,
          observation_kind: 'commandAccepted',
          evidence_code: 'command_acknowledged',
          observed_at: new Date().toISOString(),
        },
        confirm_test_output: { ...admin, attempt_id: attemptId, usable: true },
        mark_wasted_film: { ...admin, attempt_id: attemptId, reason: 'Unusable output' },
        request_booth_pause: { ...grant, run_id: f.runId },
        pause_booth_for_reconnect: { ...grant, run_id: f.runId },
        finish_booth_handoff: {
          ...grant,
          handoff_id: handoffId,
          device_token_hash: f.deviceHash,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        confirm_booth_handoff: { ...grant, handoff_id: handoffId },
        complete_event_redaction: { ...admin, event_id: f.eventId },
      };
      const result = await f.local.service.rpc(name, { ...key, ...calls[name] });
      expect(result.error?.message).toBe('state_conflict');
      expect(
        localOwnerSql(
          `select state,revision,client_name,media_removal_state from public.events where id='${f.eventId}'`
        )[0]
      ).toEqual({ state: 'Live', revision: 2, client_name: 'Client', media_removal_state: 'none' });
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.operation_receipts where event_id='${f.eventId}'`
        )[0].n
      ).toBe(0);
    } finally {
      await f.dispose();
    }
  },
  30000
);
