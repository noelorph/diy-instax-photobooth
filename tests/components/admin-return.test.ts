// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { consumeBoothReturn } from '@/features/admin/auth/booth-return';
vi.mock('server-only', () => ({}));
const cookie = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => cookie }));
it('uses only an authorized opaque Event and consumes the hint', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  cookie.get.mockReturnValue({ value: id });
  expect(await consumeBoothReturn(async (value) => value === id)).toBe(`/events/${id}`);
  cookie.get.mockReturnValue({ value: 'https://evil.test' });
  expect(await consumeBoothReturn(async () => true)).toBe('/dashboard');
  cookie.get.mockReturnValue({ value: id });
  expect(await consumeBoothReturn(async () => false)).toBe('/dashboard');
  expect(cookie.set).toHaveBeenCalled();
});
