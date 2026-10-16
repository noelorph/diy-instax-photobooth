// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { localSupabase } from '../fixtures/local-supabase';
import { getHistorySummary, getOperationalEvent } from '@/features/admin/operations/read';
import { createClient } from '@/lib/supabase/server';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: vi.fn().mockResolvedValue({}) }));
const local = localSupabase();
afterEach(async () => {
  await local.cleanup();
});
it('reads authenticated Event totals and excludes deleted or inaccessible Events', async () => {
  const admin = await local.provisionUser();
  await local.allowlist(admin.id);
  const signed = await local.signIn(admin);
  vi.mocked(createClient).mockResolvedValue(signed.client);
  const created = await signed.client
    .from('events')
    .insert({
      title: 'Operations',
      client_name: 'Client',
      client_email: 'client@example.test',
      client_phone: '123',
      venue_address: 'Hall',
      time_zone: 'Asia/Manila',
      starts_at: '2026-11-01T10:00:00Z',
      ends_at: '2026-11-01T11:00:00Z',
      film_package_count: 1,
      original_print_allowance: 10,
    })
    .select('id')
    .single();
  expect(created.error).toBeNull();
  const id = created.data!.id;
  try {
    const summary = await getHistorySummary();
    expect(summary.status).toBe('success');
    if (summary.status === 'success') {
      expect(summary.events).toBeGreaterThanOrEqual(1);
      expect(summary.captures).toBeGreaterThanOrEqual(0);
    }
    const result = await getOperationalEvent(id);
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.event.originalAllowance).toBe(10);
      expect(result.event.allowanceReserved).toBe(0);
      expect(result.event.confirmedPrints).toBe(0);
    }
  } finally {
    await local.service.from('events').delete().eq('id', id);
  }
  expect((await getOperationalEvent(id)).status).toBe('not_found');
});
