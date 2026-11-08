import type { BoothPrinterMode } from '@/lib/operations/package-contract';
import type { PrinterAdapterV2 } from './printer/contract-v2';
import { MiniLink3PrinterV2 } from './printer/mini-link3-v2';
import { SimulatedPrinterV2 } from './printer/simulator-v2';
import type { WebBluetoothPort } from '@/features/qualification/instax/bluetooth';
// The selected owner survives setup → scoped route subscription changes.
let owner: { mode: Exclude<BoothPrinterMode, 'disabled'>; printer: PrinterAdapterV2 } | undefined;
export function getBoothPrinter(mode: 'simulated'): SimulatedPrinterV2;
export function getBoothPrinter(mode: Exclude<BoothPrinterMode, 'disabled'>): PrinterAdapterV2;
export function getBoothPrinter(mode: Exclude<BoothPrinterMode, 'disabled'>): PrinterAdapterV2 {
  if (mode !== 'simulated' && mode !== 'instax-development') throw Error('Printer mode disabled');
  const browser = typeof window !== 'undefined';
  if (browser && owner && owner.mode !== mode) throw Error('Printer mode changed; restart the app');
  const selected = (browser ? owner : undefined) ?? {
    mode,
    printer:
      mode === 'simulated'
        ? new SimulatedPrinterV2('simulator')
        : new MiniLink3PrinterV2({
            requestDevice(options) {
              const bluetooth = (navigator as Navigator & { bluetooth?: WebBluetoothPort })
                .bluetooth;
              if (!bluetooth) throw Error('Web Bluetooth unavailable');
              return bluetooth.requestDevice(options);
            },
          }),
  };
  if (browser) owner = selected;
  return selected.printer;
}
/** Terminal teardown only; React subscription cleanup must retain the owner. */
export async function releaseBoothPrinter() {
  const released = owner;
  if (released) {
    try {
      await released.printer.disconnect();
    } finally {
      if (owner === released) owner = undefined;
    }
  }
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
