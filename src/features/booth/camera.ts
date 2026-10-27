import { capturePrintableFrame } from '@/features/qualification/image';
import type { Photo } from './flow';
export interface BoothCamera {
  start(
    video: HTMLVideoElement,
    disconnected: () => void,
    permission: 'existing' | 'request'
  ): Promise<void>;
  /** Throws synchronously before a successful draw; returned promise only encodes that shutter. */
  capture(): Promise<Photo>;
  stop(): void;
}
/** Explicit gestures may request access; passive observation never prompts. */
export class BrowserBoothCamera implements BoothCamera {
  private stream?: MediaStream;
  private generation = 0;
  private video?: HTMLVideoElement;
  private pending?: Promise<void>;
  start(
    video: HTMLVideoElement,
    disconnected: () => void,
    permission: 'existing' | 'request'
  ): Promise<void> {
    if (this.pending) return this.pending;
    const generation = this.generation;
    const pending = this.acquire(video, disconnected, permission, generation);
    this.pending = pending;
    void pending
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      })
      .catch(() => {});
    return pending;
  }
  private async acquire(
    video: HTMLVideoElement,
    disconnected: () => void,
    permission: 'existing' | 'request',
    generation: number
  ) {
    if (!this.stream?.active && permission === 'existing') {
      let granted = false;
      try {
        granted =
          (await navigator.permissions.query({ name: 'camera' as PermissionName })).state ===
          'granted';
      } catch {
        /* Unknown permission stays blocked. */
      }
      if (generation !== this.generation) return;
      if (!granted) throw new Error('Enable Camera to allow camera access');
    }
    const stream = this.stream?.active
      ? this.stream
      : await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    this.video = video;
    stream.getVideoTracks().forEach((track) => {
      track.onended = disconnected;
    });
    video.srcObject = stream;
    try {
      await video.play();
      if (generation !== this.generation) return;
      if (!stream.active || !video.videoWidth || !video.videoHeight)
        throw new Error('Camera feed is not live');
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }
  capture(): Promise<Photo> {
    if (!this.video || !this.stream?.active) throw new Error('Camera unavailable');
    return capturePrintableFrame(this.video).then((frame) => ({
      bytes: frame.jpeg,
      url: frame.previewUrl,
      discard: () => {
        frame.jpeg.fill(0);
        URL.revokeObjectURL(frame.previewUrl);
      },
    }));
  }
  stop() {
    this.generation++;
    this.pending = undefined;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (this.video) this.video.srcObject = null;
    this.stream = undefined;
    this.video = undefined;
  }
}
