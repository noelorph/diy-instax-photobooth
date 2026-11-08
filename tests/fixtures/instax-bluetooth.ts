import type { BrowserContext } from '@playwright/test';
import { activePrint, instaxStatus, knownEmptyError } from './instax-responses';

/** Synthetic Web Bluetooth boundary; it never delegates to the host API or stores upload bytes. */
export async function installInstaxBluetooth(context: BrowserContext) {
  await context.addInitScript(
    ({ idle, active, empty }) => {
      let status = idle;
      let executeCount = 0;
      let ejects = 3;
      let chooserCount = 0;
      let buffered = new Uint8Array(0);
      const notify = Object.assign(new EventTarget(), {
        value: undefined as DataView | undefined,
        properties: { notify: true },
        startNotifications: async () => {},
        stopNotifications: async () => {},
      });
      const link = Object.assign(new EventTarget(), {
        properties: { notify: true },
        startNotifications: async () => {},
        stopNotifications: async () => {},
      });
      function respond(opcode: number, payload: number[]) {
        const bytes = new Uint8Array(7 + payload.length);
        bytes.set([0x61, 0x42, bytes.length >> 8, bytes.length & 255, opcode >> 8, opcode & 255]);
        bytes.set(payload, 6);
        bytes[bytes.length - 1] = ~bytes.subarray(0, -1).reduce((sum, byte) => sum + byte, 0) & 255;
        notify.value = new DataView(bytes.buffer);
        notify.dispatchEvent(new Event('characteristicvaluechanged'));
      }
      const write = {
        properties: { write: true, writeWithoutResponse: true },
        async writeValueWithoutResponse(value: BufferSource) {
          const bytes = ArrayBuffer.isView(value)
            ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
            : new Uint8Array(value);
          const next = new Uint8Array(buffered.length + bytes.length);
          next.set(buffered);
          next.set(bytes, buffered.length);
          buffered = next;
          if (buffered.length < 4) return;
          const length = (buffered[2]! << 8) | buffered[3]!;
          if (buffered.length < length) return;
          if (
            buffered.length !== length ||
            buffered[0] !== 0x41 ||
            buffered[1] !== 0x62 ||
            buffered[length - 1] !==
              (~buffered.subarray(0, -1).reduce((sum, byte) => sum + byte, 0) & 255)
          )
            throw Error('Invalid synthetic request framing');
          const opcode = (buffered[4]! << 8) | buffered[5]!;
          const selector = buffered[6];
          buffered = new Uint8Array(0);
          if (opcode === 0x1080) executeCount++;
          const payload =
            opcode !== 2
              ? [0]
              : selector === 0
                ? [0, 0, 2, 88, 3, 32]
                : selector === 2
                  ? status
                  : [0, 3, 0, 0, 1, 2, 0, 0, 0, ejects];
          respond(opcode, payload);
        },
      };
      const server = {
        connected: true,
        async getPrimaryService(uuid: string) {
          return {
            async getCharacteristic(characteristic: string) {
              if (uuid.includes('180a')) {
                const text = characteristic.includes('2a24') ? 'FI033' : '0102';
                return {
                  readValue: async () => new DataView(new TextEncoder().encode(text).buffer),
                };
              }
              if (uuid.includes('6287')) return link;
              return characteristic.includes('54783') ? write : notify;
            },
          };
        },
        disconnect() {
          server.connected = false;
        },
      };
      const device = Object.assign(new EventTarget(), {
        id: 'synthetic-fi033',
        name: 'INSTAX-SYNTHETIC',
        gatt: {
          connect: async () => {
            server.connected = true;
            return server;
          },
        },
      });
      Object.defineProperty(navigator, 'bluetooth', {
        configurable: true,
        value: {
          requestDevice: async () => {
            chooserCount++;
            return device;
          },
        },
      });
      Object.assign(window, {
        __instaxFixture: {
          cover: (open: boolean) => {
            status = open ? [0, 2, 0x3a, 1, 0, 0, 0, 0, 0, 0] : idle;
            if (!open) ejects++;
          },
          counts: () => ({ executeCount, chooserCount }),
          status: (value: 'idle' | 'active' | 'empty') => {
            status = value === 'active' ? active : value === 'empty' ? empty : idle;
          },
          disconnect: () => {
            server.connected = false;
            device.dispatchEvent(new Event('gattserverdisconnected'));
          },
        },
      });
    },
    {
      idle: [...instaxStatus().payload],
      active: [...activePrint().payload],
      empty: [...knownEmptyError().payload],
    }
  );
}
