import { createHash, randomUUID } from 'node:crypto';
import { cleanupEvents, localSupabase, ownerInsert } from './local-supabase';

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
      admin(operation: string, payload: Record<string, unknown>, operationId = randomUUID()) {
        return local.service.rpc('package_admin_operation', {
          p_admin_user_id: adminUser.id,
          p_admin_session_id: adminSessionId,
          p_operation: operation,
          p_operation_id: operationId,
          p_payload: { eventId, ...payload },
        });
      },
      booth(operation: string, payload: Record<string, unknown>, operationId = randomUUID()) {
        return local.service.rpc('package_booth_operation', {
          p_grant_hash: grantHash,
          p_operation: operation,
          p_operation_id: operationId,
          p_payload: payload,
        });
      },
      readAdmin() {
        return local.service.rpc('package_admin_read', {
          p_admin_user_id: adminUser.id,
          p_admin_session_id: adminSessionId,
          p_event_id: eventId,
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
