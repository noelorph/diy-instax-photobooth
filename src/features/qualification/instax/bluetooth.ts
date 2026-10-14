import {
  buildRequest,
  InstaxResponseStream,
  INSTAX_BLE_UUIDS,
  type InstaxOpcode,
  type InstaxResponse,
} from './protocol';

const DEVICE_INFO_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
const MODEL_NUMBER = '00002a24-0000-1000-8000-00805f9b34fb';
const FIRMWARE_REVISION = '00002a26-0000-1000-8000-00805f9b34fb';

type Characteristic = EventTarget & {
  value?: DataView;
  properties?: { notify?: boolean; write?: boolean; writeWithoutResponse?: boolean };
  readValue?(): Promise<DataView>;
  startNotifications?(): Promise<unknown>;
  stopNotifications?(): Promise<unknown>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
};
type Service = { getCharacteristic(uuid: string): Promise<Characteristic> };
type Server = {
  connected: boolean;
  getPrimaryService(uuid: string): Promise<Service>;
  disconnect(): void;
};
type Device = EventTarget & { name?: string; gatt?: { connect(): Promise<Server> } };
export type WebBluetoothPort = {
  requestDevice(options: {
    filters: { namePrefix: string }[];
    optionalServices: string[];
  }): Promise<Device>;
};
export type PrinterConnection = {
  modelNumber: string;
  firmwareRevision: string;
  exchange(opcode: InstaxOpcode, payload?: Uint8Array, timeoutMs?: number): Promise<InstaxResponse>;
  disconnect(): Promise<void>;
};

function decode(view: DataView): string {
  return new TextDecoder()
    .decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    .replace(/\0+$/, '')
    .trim();
}

export async function connectMiniLink3(
  bluetooth: WebBluetoothPort,
  callbacks: { onResponse(response: InstaxResponse): void; onDisconnect(): void }
): Promise<PrinterConnection> {
  const device = await bluetooth.requestDevice({
    filters: [{ namePrefix: 'INSTAX-' }],
    optionalServices: [DEVICE_INFO_SERVICE, INSTAX_BLE_UUIDS.printService],
  });
  if (!device.gatt) throw new Error('Selected printer has no GATT server');
  const server = await device.gatt.connect();
  try {
    const info = await server.getPrimaryService(DEVICE_INFO_SERVICE);
    const modelCharacteristic = await info.getCharacteristic(MODEL_NUMBER);
    if (!modelCharacteristic.readValue) throw new Error('Printer model is unreadable');
    const modelNumber = decode(await modelCharacteristic.readValue());
    if (modelNumber !== 'FI033')
      throw new Error(`Expected FI033, received ${modelNumber || 'no model'}`);
    const firmwareCharacteristic = await info.getCharacteristic(FIRMWARE_REVISION);
    if (!firmwareCharacteristic.readValue) throw new Error('Printer firmware is unreadable');
    const firmwareRevision = decode(await firmwareCharacteristic.readValue());
    const printService = await server.getPrimaryService(INSTAX_BLE_UUIDS.printService);
    const write = await printService.getCharacteristic(INSTAX_BLE_UUIDS.writeCharacteristic);
    const notify = await printService.getCharacteristic(INSTAX_BLE_UUIDS.notifyCharacteristic);
    const withoutResponse =
      !!write.properties?.writeWithoutResponse && !!write.writeValueWithoutResponse;
    const withResponse = !!write.properties?.write && !!write.writeValueWithResponse;
    if (!withoutResponse && !withResponse)
      throw new Error('Printer characteristic has no supported write mode');
    if (!notify.properties?.notify || !notify.startNotifications)
      throw new Error('Printer notifications unavailable');

    const stream = new InstaxResponseStream();
    let stopped = false;
    let pending:
      | {
          opcode: number;
          resolve(value: InstaxResponse): void;
          reject(error: Error): void;
          timer: ReturnType<typeof setTimeout>;
        }
      | undefined;
    const rejectPending = (error: Error) => {
      if (!pending) return;
      const current = pending;
      pending = undefined;
      clearTimeout(current.timer);
      current.reject(error);
    };
    const onNotification = () => {
      if (!notify.value || stopped) return;
      try {
        const bytes = new Uint8Array(
          notify.value.buffer,
          notify.value.byteOffset,
          notify.value.byteLength
        );
        for (const response of stream.push(bytes)) {
          callbacks.onResponse(response);
          if (pending?.opcode === response.opcode) {
            const current = pending;
            pending = undefined;
            clearTimeout(current.timer);
            current.resolve(response);
          }
        }
      } catch (error) {
        rejectPending(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const onDisconnect = () => {
      if (stopped) return;
      stopped = true;
      rejectPending(new Error('Printer disconnected'));
      callbacks.onDisconnect();
    };
    notify.addEventListener('characteristicvaluechanged', onNotification);
    try {
      await notify.startNotifications();
    } catch (error) {
      notify.removeEventListener('characteristicvaluechanged', onNotification);
      throw error;
    }
    device.addEventListener('gattserverdisconnected', onDisconnect);

    return {
      modelNumber,
      firmwareRevision,
      async exchange(opcode, payload = new Uint8Array(), timeoutMs = 5000) {
        if (stopped || !server.connected) throw new Error('Printer disconnected');
        if (pending) throw new Error('Printer already has a pending exchange');
        const packet = buildRequest(opcode, payload);
        const responsePromise = new Promise<InstaxResponse>((resolve, reject) => {
          const timer = setTimeout(
            () => rejectPending(new Error('Printer response timed out')),
            timeoutMs
          );
          pending = { opcode, resolve, reject, timer };
        });
        try {
          for (let offset = 0; offset < packet.byteLength; offset += 182) {
            const chunk = packet.slice(offset, offset + 182);
            const buffer = new ArrayBuffer(chunk.byteLength);
            new Uint8Array(buffer).set(chunk);
            if (withoutResponse) await write.writeValueWithoutResponse!(buffer);
            else await write.writeValueWithResponse!(buffer);
          }
        } catch (error) {
          rejectPending(error instanceof Error ? error : new Error(String(error)));
        }
        return responsePromise;
      },
      async disconnect() {
        if (!stopped) {
          stopped = true;
          rejectPending(new Error('Printer disconnected'));
        }
        device.removeEventListener('gattserverdisconnected', onDisconnect);
        notify.removeEventListener('characteristicvaluechanged', onNotification);
        await notify.stopNotifications?.();
        if (server.connected) server.disconnect();
      },
    };
  } catch (error) {
    if (server.connected) server.disconnect();
    throw error;
  }
}
