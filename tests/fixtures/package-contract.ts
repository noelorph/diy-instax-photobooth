import {
  SIMULATOR_EVIDENCE,
  type PrinterEvidenceDescriptor,
  type BoothPrinterMode,
} from '@/lib/operations/package-contract';
import { createHash, randomUUID } from 'node:crypto';
import {
  cleanupEvents,
  localSupabase,
  localOwnerSql,
  ownerInsert,
  ownerUpdate,
} from './local-supabase';

export async function createPackageFixture(options: { originalPackages?: number } = {}) {
  const local = localSupabase();
  try {
    const adminUser = await local.provisionUser();
    const allowed = await local.allowlist(adminUser.id);
    if (allowed.error) throw allowed.error;
    const signed = await local.signIn(adminUser);
    const adminSessionId = JSON.parse(
      Buffer.from(signed.session.access_token.split('.')[1], 'base64url').toString()
    ).session_id as string;
    const eventId = randomUUID(),
      runId = randomUUID(),
      grantId = randomUUID();
    const deviceHash = createHash('sha256').update(randomUUID()).digest('hex');
    const grantHash = createHash('sha256').update(randomUUID()).digest('hex');
    ownerInsert('events', {
      id: eventId,
      accounting_version: 2,
      title: 'Package fixture',
      client_name: 'Client',
      client_email: 'package@example.test',
      client_phone: '123',
      venue_address: 'Hall',
      time_zone: 'Asia/Manila',
      starts_at: '2026-12-01T10:00:00Z',
      ends_at: '2026-12-01T12:00:00Z',
      film_package_count: options.originalPackages ?? 1,
    });
    return {
      local,
      adminUser,
      adminClient: signed.client,
      adminSessionId,
      eventId,
      runId,
      grantId,
      deviceHash,
      grantHash,
      seedRun(state = 'Active', evidencePolicyVersion = 'simulator-v1') {
        ownerUpdate('events', eventId, { state: 'Live', revision: 2 });
        ownerInsert('booth_runs', {
          id: runId,
          event_id: eventId,
          accounting_version: 2,
          state,
          evidence_policy_version: evidencePolicyVersion,
          device_hash: deviceHash,
          printer_id: 'fixture-printer',
          film_loaded_confirmed: true,
          power_confirmed: true,
          guided_access_confirmed: true,
        });
        ownerInsert('booth_grants', {
          id: grantId,
          event_id: eventId,
          run_id: runId,
          accounting_version: 2,
          state: 'Active',
          secret_hash: grantHash,
          device_hash: deviceHash,
          expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        });
      },
      readSetup() {
        return local.service.rpc('package_setup_read', {
          p_admin_user_id: adminUser.id,
          p_admin_session_id: adminSessionId,
          p_event_id: eventId,
          p_device_hash: deviceHash,
          p_printer_id: 'fixture-printer',
          p_connection_generation: 0,
        });
      },
      async reportSetup(
        printerEvidence: PrinterEvidenceDescriptor = SIMULATOR_EVIDENCE,
        printerMode: BoothPrinterMode = 'simulated'
      ) {
        const read = await this.readSetup();
        if (read.error) throw read.error;
        const reported = await this.admin('report_setup_readiness', {
          readinessWindowId: read.data.readinessWindowId,
          printerEvidence,
          printerMode,
          deviceHash,
          printerId: 'fixture-printer',
          connectionGeneration: 0,
          observedAgeMs: 0,
          observation: {
            cameraPermission: true,
            cameraLive: true,
            serverReachable: true,
            printerConnected: true,
            printerReady: true,
            oldJobCleared: true,
          },
          filmLoadedConfirmed: true,
          powerConfirmed: true,
          guidedAccessConfirmed: true,
        });
        return {
          ...reported,
          data: { ...reported.data, readinessWindowId: read.data.readinessWindowId },
        };
      },
      admin(operation: string, payload: Record<string, unknown>, operationId = randomUUID()) {
        if (['start', 'report_setup_readiness'].includes(operation))
          payload = {
            printerMode: 'simulated',
            ...(operation === 'report_setup_readiness'
              ? { printerEvidence: SIMULATOR_EVIDENCE }
              : {}),
            ...payload,
          };
        return local.service.rpc('package_admin_operation', {
          p_admin_user_id: adminUser.id,
          p_admin_session_id: adminSessionId,
          p_operation: operation,
          p_operation_id: operationId,
          p_payload: { eventId, ...payload },
        });
      },
      booth(operation: string, payload: Record<string, unknown>, operationId = randomUUID()) {
        if (['start_session', 'reserve', 'dispatch', 'report_readiness'].includes(operation))
          payload = {
            printerMode: 'simulated',
            ...(operation === 'report_readiness' ? { printerEvidence: SIMULATOR_EVIDENCE } : {}),
            ...payload,
          };
        if (operation === 'observe') {
          const a = localOwnerSql(
            `select printer_id,dispatch_id from public.print_attempts where id='${payload.attemptId}'`
          )[0];
          payload = {
            printerId: a?.printer_id,
            dispatchId: a?.dispatch_id,
            adapterVersion: 'simulator-v2',
            ...payload,
          };
        }
        return local.service.rpc('package_booth_operation', {
          p_grant_hash: grantHash,
          p_operation: operation,
          p_operation_id: operationId,
          p_payload: payload,
        });
      },
      readAdmin(operationId?: string) {
        return local.service.rpc('package_admin_read', {
          p_admin_user_id: adminUser.id,
          p_admin_session_id: adminSessionId,
          p_event_id: eventId,
          ...(operationId ? { p_operation_id: operationId } : {}),
        });
      },
      readBooth() {
        return local.service.rpc('package_booth_read', { p_grant_hash: grantHash });
      },
      async dispose() {
        try {
          cleanupEvents([eventId]);
        } finally {
          await local.cleanup();
        }
      },
    };
  } catch (error) {
    await local.cleanup();
    throw error;
  }
}
export type PackageFixture = Awaited<ReturnType<typeof createPackageFixture>>;
