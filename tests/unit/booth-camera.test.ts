import { afterEach, expect, it, vi } from 'vitest';
import { BrowserBoothCamera } from '@/features/booth/camera';
afterEach(() => vi.unstubAllGlobals());
it('refuses to request camera permission from a Guest', async () => {
  const getUserMedia = vi.fn();
  vi.stubGlobal('navigator', {
    permissions: { query: async () => ({ state: 'prompt' }) },
    mediaDevices: { getUserMedia },
  });
  await expect(
    new BrowserBoothCamera().start(document.createElement('video'), () => {})
  ).rejects.toThrow();
  expect(getUserMedia).not.toHaveBeenCalled();
});
it('stops a late camera stream after the Guest surface has already stopped', async () => {
  let resolve!: (stream: MediaStream) => void;
  const stopped = vi.fn();
  const track = { stop: stopped, onended: null };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  vi.stubGlobal('navigator', {
    permissions: { query: async () => ({ state: 'granted' }) },
    mediaDevices: {
      getUserMedia: () =>
        new Promise<MediaStream>((r) => {
          resolve = r;
        }),
    },
  });
  const video = document.createElement('video');
  video.play = async () => {};
  const camera = new BrowserBoothCamera();
  const started = camera.start(video, () => {});
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  camera.stop();
  resolve(stream);
  await started;
  expect(stopped).toHaveBeenCalledOnce();
  expect(video.srcObject ?? null).toBeNull();
});

it('reports an unavailable camera synchronously before a shutter can be counted', async () => {
  const camera = new BrowserBoothCamera();
  let result: Promise<unknown> | undefined;
  expect(() => {
    result = camera.capture();
    void result.catch(() => {});
  }).toThrow('Camera unavailable');
});

it.each(['draw', 'encode'] as const)(
  'distinguishes %s failure at the successful-shutter boundary',
  async (failure) => {
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 600 }, videoHeight: { value: 800 } });
    video.play = async () => {};
    const track = { stop: () => {}, onended: null };
    vi.stubGlobal('navigator', {
      permissions: { query: async () => ({ state: 'granted' }) },
      mediaDevices: {
        getUserMedia: async () => ({
          active: true,
          getTracks: () => [track],
          getVideoTracks: () => [track],
        }),
      },
    });
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => {
        if (failure === 'draw') throw new Error('draw failed');
      },
    } as unknown as CanvasRenderingContext2D);
    const encode = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(null));
    const camera = new BrowserBoothCamera();
    await camera.start(video, () => {});
    try {
      if (failure === 'draw') {
        expect(() => {
          const pending = camera.capture();
          void pending.catch(() => {});
        }).toThrow('draw failed');
      } else await expect(camera.capture()).rejects.toThrow('encode JPEG');
    } finally {
      context.mockRestore();
      encode.mockRestore();
      camera.stop();
    }
  }
);
