import { capturePrintableFrame } from '@/features/qualification/image';
import type { Photo } from './flow';
export interface BoothCamera {
  start(video: HTMLVideoElement, disconnected: () => void): Promise<void>;
  capture(): Promise<Photo>;
  stop(): void;
}
/** Permission must already have been granted during Admin setup. */
export class BrowserBoothCamera implements BoothCamera {
  private stream?: MediaStream;
  private generation = 0;
  private video?: HTMLVideoElement;
  async start(video: HTMLVideoElement, disconnected: () => void) {
    const generation = ++this.generation;
    const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
    if (generation !== this.generation) return;
    if (permission.state !== 'granted') throw new Error('Camera requires Admin setup');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
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
    await video.play();
  }
  async capture(): Promise<Photo> {
    if (!this.video || !this.stream?.active) throw new Error('Camera unavailable');
    const frame = await capturePrintableFrame(this.video);
    return {
      bytes: frame.jpeg,
      url: frame.previewUrl,
      discard: () => {
        frame.jpeg.fill(0);
        URL.revokeObjectURL(frame.previewUrl);
      },
    };
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (this.video) this.video.srcObject = null;
    this.stream = undefined;
    this.video = undefined;
  }
}
