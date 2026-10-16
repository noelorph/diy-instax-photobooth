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
