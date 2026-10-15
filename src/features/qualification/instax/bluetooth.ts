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
const LINK3_STATUS_SERVICE = '00006287-3c17-d293-8e48-14fe2e4da212';
const LINK3_STATUS_NOTIFY = '00006487-3c17-d293-8e48-14fe2e4da212';

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
type PendingRequest = {
  opcode: number;
  resolve(value: InstaxResponse): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
  writeComplete: boolean;
  response?: InstaxResponse;
};
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
  callbacks: {
    onResponse(response: InstaxResponse): void;
    onDisconnect(): void;
    onLink3Status?(bytes: Uint8Array): void;
    onLink3StatusReady?(): void;
    onLink3StatusError?(error: Error): void;
  }
): Promise<PrinterConnection> {
  let device: Device;
  try {
    device = await bluetooth.requestDevice({
      filters: [{ namePrefix: 'INSTAX-' }],
      optionalServices: [DEVICE_INFO_SERVICE, INSTAX_BLE_UUIDS.printService, LINK3_STATUS_SERVICE],
    });
  } catch (error) {
    throw new Error(
      `Bluetooth device selection: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!device.gatt) throw new Error('Selected printer has no GATT server');
  let server: Server;
  try {
    server = await device.gatt.connect();
  } catch (error) {
    throw new Error(
      `Bluetooth GATT connection: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  let stage = 'device information service';
  try {
    const info = await server.getPrimaryService(DEVICE_INFO_SERVICE);
    stage = 'model characteristic';
    const modelCharacteristic = await info.getCharacteristic(MODEL_NUMBER);
    if (!modelCharacteristic.readValue) throw new Error('Printer model is unreadable');
    stage = 'model read';
    const modelNumber = decode(await modelCharacteristic.readValue());
    if (modelNumber !== 'FI033')
      throw new Error(`Expected FI033, received ${modelNumber || 'no model'}`);
    stage = 'firmware characteristic';
    const firmwareCharacteristic = await info.getCharacteristic(FIRMWARE_REVISION);
    if (!firmwareCharacteristic.readValue) throw new Error('Printer firmware is unreadable');
    stage = 'firmware read';
    const firmwareRevision = decode(await firmwareCharacteristic.readValue());
    stage = 'print service';
    const printService = await server.getPrimaryService(INSTAX_BLE_UUIDS.printService);
    stage = 'write characteristic';
    const write = await printService.getCharacteristic(INSTAX_BLE_UUIDS.writeCharacteristic);
    stage = 'notification characteristic';
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
    let pending: PendingRequest | undefined;
    let link3Notify: Characteristic | undefined;
    const onLink3Notification = () => {
      if (stopped || !link3Notify?.value) return;
      const { buffer, byteOffset, byteLength } = link3Notify.value;
      callbacks.onLink3Status?.(new Uint8Array(buffer, byteOffset, byteLength).slice());
    };
    const isActive = (request: PendingRequest) => !stopped && pending === request;
    const retire = () => {
      if (stopped) return;
      stopped = true;
      notify.removeEventListener('characteristicvaluechanged', onNotification);
      link3Notify?.removeEventListener('characteristicvaluechanged', onLink3Notification);
      device.removeEventListener('gattserverdisconnected', onDisconnect);
      if (server.connected) server.disconnect();
    };
    const rejectPending = (error: Error, retireTransport = false) => {
      if (!pending) return;
      const current = pending;
      pending = undefined;
      clearTimeout(current.timer);
      current.reject(error);
      if (retireTransport) retire();
    };
    const completePending = () => {
      const response = pending?.response;
      if (!pending?.writeComplete || !response) return;
      const current = pending;
      pending = undefined;
      clearTimeout(current.timer);
      current.resolve(response);
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
            pending.response = response;
            completePending();
          }
        }
      } catch (error) {
        rejectPending(error instanceof Error ? error : new Error(String(error)), true);
      }
    };
    const onDisconnect = () => {
      if (stopped) return;
      stopped = true;
      rejectPending(new Error('Printer disconnected'));
      link3Notify?.removeEventListener('characteristicvaluechanged', onLink3Notification);
      callbacks.onDisconnect();
    };
    notify.addEventListener('characteristicvaluechanged', onNotification);
    stage = 'notifications';
    try {
      await notify.startNotifications();
    } catch (error) {
      notify.removeEventListener('characteristicvaluechanged', onNotification);
      throw error;
    }
    device.addEventListener('gattserverdisconnected', onDisconnect);
    if (callbacks.onLink3Status || callbacks.onLink3StatusError) {
      try {
        const statusService = await server.getPrimaryService(LINK3_STATUS_SERVICE);
        const characteristic = await statusService.getCharacteristic(LINK3_STATUS_NOTIFY);
        if (!characteristic.properties?.notify || !characteristic.startNotifications)
          throw new Error('Link 3 status notifications unavailable');
        link3Notify = characteristic;
        link3Notify.addEventListener('characteristicvaluechanged', onLink3Notification);
        await characteristic.startNotifications();
        callbacks.onLink3StatusReady?.();
      } catch (error) {
        link3Notify?.removeEventListener('characteristicvaluechanged', onLink3Notification);
        link3Notify = undefined;
        callbacks.onLink3StatusError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }

    return {
      modelNumber,
      firmwareRevision,
      async exchange(opcode, payload = new Uint8Array(), timeoutMs = 5000) {
        if (stopped || !server.connected) throw new Error('Printer disconnected');
        if (pending) throw new Error('Printer already has a pending exchange');
        const packet = buildRequest(opcode, payload);
        let current!: PendingRequest;
        const responsePromise = new Promise<InstaxResponse>((resolve, reject) => {
          const timer = setTimeout(
            () => rejectPending(new Error('Printer exchange timed out'), true),
            timeoutMs
          );
          current = { opcode, resolve, reject, timer, writeComplete: false };
          pending = current;
        });
        void (async () => {
          try {
            for (let offset = 0; offset < packet.byteLength; offset += 182) {
              if (!isActive(current)) return;
              const chunk = packet.slice(offset, offset + 182);
              const buffer = new ArrayBuffer(chunk.byteLength);
              new Uint8Array(buffer).set(chunk);
              if (withoutResponse) await write.writeValueWithoutResponse!(buffer);
              else await write.writeValueWithResponse!(buffer);
            }
            if (!isActive(current)) return;
            current.writeComplete = true;
            completePending();
          } catch (error) {
            rejectPending(error instanceof Error ? error : new Error(String(error)), true);
          }
        })();
        return responsePromise;
      },
      async disconnect() {
        if (!stopped) {
          stopped = true;
          rejectPending(new Error('Printer disconnected'));
        }
        device.removeEventListener('gattserverdisconnected', onDisconnect);
        notify.removeEventListener('characteristicvaluechanged', onNotification);
        link3Notify?.removeEventListener('characteristicvaluechanged', onLink3Notification);
        await link3Notify?.stopNotifications?.();
        await notify.stopNotifications?.();
        if (server.connected) server.disconnect();
      },
    };
  } catch (error) {
    if (server.connected) server.disconnect();
    throw new Error(
      `Bluetooth ${stage}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
