import { afterEach, expect, it, vi } from 'vitest';
import { BrowserBoothCamera } from '@/features/booth/camera';
afterEach(() => vi.unstubAllGlobals());
it('lets an explicit request supersede a pending passive permission query', async () => {
  let resolveQuery!: (value: { state: string }) => void;
  const video = document.createElement('video');
  Object.defineProperties(video, { videoWidth: { value: 600 }, videoHeight: { value: 800 } });
  video.play = async () => {};
  const track = { stop: vi.fn(), onended: null };
  const stream = { active: true, getTracks: () => [track], getVideoTracks: () => [track] };
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal('navigator', {
    permissions: {
      query: () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    },
    mediaDevices: { getUserMedia },
  });
  const camera = new BrowserBoothCamera();
  const passive = camera.start(video, () => {}, 'existing').catch(() => {});
  const explicit = camera.start(video, () => {}, 'request');
  expect(getUserMedia).toHaveBeenCalledOnce();
  await explicit;
  resolveQuery({ state: 'granted' });
  await passive;
  expect(video.srcObject).toBe(stream);
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(track.stop).not.toHaveBeenCalled();
  camera.stop();
});
it.each(['prompt', 'missing', 'rejected'] as const)(
  'explicit request acquires a live camera with %s permission query',
  async (state) => {
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 600 }, videoHeight: { value: 800 } });
    video.play = async () => {};
    const track = { stop: vi.fn(), onended: null };
    const stream = { active: true, getTracks: () => [track], getVideoTracks: () => [track] };
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal('navigator', {
      ...(state === 'missing'
        ? {}
        : {
            permissions: {
              query: async () => {
                if (state === 'rejected') throw new Error('unsupported');
                return { state };
              },
            },
          }),
      mediaDevices: { getUserMedia },
    });
    const camera = new BrowserBoothCamera();
    await camera.start(video, () => {}, 'request');
    expect(video.srcObject).toBe(stream);
    camera.stop();
  }
);
it.each(['prompt', 'missing', 'rejected'] as const)(
  'passive existing never prompts with %s permission query',
  async (state) => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', {
      ...(state === 'missing'
        ? {}
        : {
            permissions: {
              query: async () => {
                if (state === 'rejected') throw new Error('unsupported');
                return { state };
              },
            },
          }),
      mediaDevices: { getUserMedia },
    });
    await expect(
      new BrowserBoothCamera().start(document.createElement('video'), () => {}, 'existing')
    ).rejects.toThrow();
    expect(getUserMedia).not.toHaveBeenCalled();
  }
);
it('deduplicates pending requests, cleans failed streams and permits retry after denial', async () => {
  const video = document.createElement('video');
  Object.defineProperties(video, { videoWidth: { value: 600 }, videoHeight: { value: 800 } });
  video.play = async () => {};
  const track = { stop: vi.fn(), onended: null };
  const stream = { active: true, getTracks: () => [track], getVideoTracks: () => [track] };
  const getUserMedia = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const camera = new BrowserBoothCamera();
  await expect(camera.start(video, () => {}, 'request')).rejects.toThrow('denied');
  await Promise.all([
    camera.start(video, () => {}, 'request'),
    camera.start(video, () => {}, 'request'),
  ]);
  expect(getUserMedia).toHaveBeenCalledTimes(2);
  expect(video.srcObject).toBe(stream);
  camera.stop();
  expect(track.stop).toHaveBeenCalledOnce();
});
it('does not retain a stream whose video cannot play', async () => {
  const track = { stop: vi.fn(), onended: null };
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => ({
        active: true,
        getTracks: () => [track],
        getVideoTracks: () => [track],
      }),
    },
  });
  const video = document.createElement('video');
  video.play = async () => {
    throw new Error('play failed');
  };
  const camera = new BrowserBoothCamera();
  await expect(camera.start(video, () => {}, 'request')).rejects.toThrow('play failed');
  expect(track.stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
  expect(() => camera.capture()).toThrow('Camera unavailable');
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
  const started = camera.start(video, () => {}, 'existing');
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
    await camera.start(video, () => {}, 'existing');
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
it('rejects a stream without live video dimensions', async () => {
  const track = { stop: vi.fn(), onended: null };
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => ({
        active: true,
        getTracks: () => [track],
        getVideoTracks: () => [track],
      }),
    },
  });
  const video = document.createElement('video');
  video.play = async () => {};
  await expect(new BrowserBoothCamera().start(video, () => {}, 'request')).rejects.toThrow(
    'not live'
  );
  expect(track.stop).toHaveBeenCalledOnce();
});
it('a late stream from a stopped generation cannot release the new owner stream', async () => {
  let release!: (stream: MediaStream) => void;
  const oldTrack = { stop: vi.fn(), onended: null },
    newTrack = { stop: vi.fn(), onended: null };
  const makeStream = (track: typeof oldTrack) =>
    ({
      active: true,
      getTracks: () => [track],
      getVideoTracks: () => [track],
    }) as unknown as MediaStream;
  const next = makeStream(newTrack);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<MediaStream>((r) => {
              release = r;
            })
        )
        .mockResolvedValue(next),
    },
  });
  const video = document.createElement('video');
  Object.defineProperties(video, { videoWidth: { value: 600 }, videoHeight: { value: 800 } });
  video.play = async () => {};
  const camera = new BrowserBoothCamera();
  const old = camera.start(video, () => {}, 'request');
  camera.stop();
  await camera.start(video, () => {}, 'request');
  release(makeStream(oldTrack));
  await old;
  expect(video.srcObject).toBe(next);
  expect(oldTrack.stop).toHaveBeenCalledOnce();
  expect(newTrack.stop).not.toHaveBeenCalled();
  camera.stop();
  expect(newTrack.stop).toHaveBeenCalledOnce();
});
