import { afterEach, expect, it, vi } from 'vitest';
import { boothFetch } from '@/features/booth/flow';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('preserves a definitive rejection code for command recovery', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ code: 'stale_revision' }, { status: 409 }));
  await expect(boothFetch('/api/admin/events/event/booth/pause', {})).rejects.toMatchObject({
    status: 409,
    code: 'stale_revision',
  });
});

it.each(['timeout', 'dispose'] as const)(
  'aborts a stalled request on %s and clears its timer',
  async (reason) => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_path, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            requestSignal = options.signal as AbortSignal;
            requestSignal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true }
            );
          })
      )
    );
    const owner = new AbortController();
    const request = expect(
      boothFetch('/api/booth/state', undefined, undefined, owner.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    if (reason === 'timeout') {
      await vi.advanceTimersByTimeAsync(4999);
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
    } else owner.abort();
    await request;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('clears the request deadline after a successful response', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ready: true })))
  );
  await expect(boothFetch('/api/booth/state')).resolves.toEqual({ ready: true });
  expect(vi.getTimerCount()).toBe(0);
});
