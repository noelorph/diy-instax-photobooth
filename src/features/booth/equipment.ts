import { SimulatedPrinterV2 } from './printer/simulator-v2';
// One connection owner across the local setup → scoped route transition.
let printer: SimulatedPrinterV2 | undefined;
export function getBoothPrinter() {
  return (printer ??= new SimulatedPrinterV2('simulator'));
}
export function hasLiveCamera(video: HTMLVideoElement | null) {
  const stream = video?.srcObject as MediaStream | null;
  return (
    !!video &&
    !!stream?.active &&
    video.videoWidth > 0 &&
    video.videoHeight > 0 &&
    stream.getVideoTracks().some((track) => track.readyState === 'live')
  );
}
