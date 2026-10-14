import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectMiniLink3, type WebBluetoothPort } from './bluetooth';
import { INSTAX_OPCODES } from './protocol';

function responseFrame(opcode: number): Uint8Array {
  const bytes = new Uint8Array([0x61, 0x42, 0, 7, opcode >> 8, opcode & 255, 0]);
  bytes[6] = ~bytes.subarray(0, 6).reduce((sum, byte) => sum + byte, 0) & 255;
  return bytes;
}

function fixture(model = 'FI033') {
  const reads: string[] = [];
  const notify = Object.assign(new EventTarget(), {
    value: undefined as DataView | undefined,
    properties: { notify: true },
    startNotifications: vi.fn(async () => undefined),
    stopNotifications: vi.fn(async () => undefined),
  });
  const writes: Uint8Array[] = [];
  const write = {
    properties: { writeWithoutResponse: true, write: true },
    writeValueWithoutResponse: vi.fn(async (value: BufferSource) => {
      writes.push(new Uint8Array(value as ArrayBuffer).slice());
    }),
  };
  const info = {
    getCharacteristic: vi.fn(async (uuid: string) => {
      reads.push(uuid);
      const text = uuid.includes('2a24') ? model : '1.2.3';
      return { readValue: async () => new DataView(new TextEncoder().encode(text).buffer) };
    }),
  };
  const print = {
    getCharacteristic: vi.fn(async (uuid: string) => (uuid.includes('54783') ? write : notify)),
  };
  const server = {
    connected: true,
    getPrimaryService: vi.fn(async (uuid: string) => (uuid.includes('180a') ? info : print)),
    disconnect: vi.fn(),
  };
  const device = Object.assign(new EventTarget(), {
    name: 'INSTAX-123',
    gatt: { connect: async () => server },
  });
  const bluetooth = { requestDevice: vi.fn(async () => device) } as unknown as WebBluetoothPort;
  function emit(bytes: Uint8Array) {
    notify.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    notify.dispatchEvent(new Event('characteristicvaluechanged'));
  }
  return { bluetooth, device, server, reads, print, notify, write, writes, emit };
}

afterEach(() => vi.useRealTimers());

describe('Mini Link 3 Bluetooth connection', () => {
  it('connectsAndReadsFirmware', async () => {
    const f = fixture();
    const connection = await connectMiniLink3(f.bluetooth, {
      onResponse: vi.fn(),
      onDisconnect: vi.fn(),
    });
    expect(connection.modelNumber).toBe('FI033');
    expect(connection.firmwareRevision).toBe('1.2.3');
    expect(f.reads).toEqual([
      '00002a24-0000-1000-8000-00805f9b34fb',
      '00002a26-0000-1000-8000-00805f9b34fb',
    ]);
    expect(f.notify.startNotifications).toHaveBeenCalledOnce();
  });

  it('rejectsWrongModel', async () => {
    const f = fixture('OTHER');
    await expect(
      connectMiniLink3(f.bluetooth, { onResponse: vi.fn(), onDisconnect: vi.fn() })
    ).rejects.toThrow('FI033');
    expect(f.print.getCharacteristic).not.toHaveBeenCalled();
    expect(f.server.disconnect).toHaveBeenCalledOnce();
  });

  it('reassemblesNotifications', async () => {
    const f = fixture();
    const onResponse = vi.fn();
    const connection = await connectMiniLink3(f.bluetooth, { onResponse, onDisconnect: vi.fn() });
    const pending = connection.exchange(INSTAX_OPCODES.handshake);
    const frame = responseFrame(INSTAX_OPCODES.handshake);
    f.emit(frame.subarray(0, 3));
    f.emit(frame.subarray(3));
    await expect(pending).resolves.toMatchObject({ opcode: INSTAX_OPCODES.handshake });
    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(f.writes).toHaveLength(1);
  });

  it('reportsUnsolicitedResponse', async () => {
    const f = fixture();
    const onResponse = vi.fn();
    await connectMiniLink3(f.bluetooth, { onResponse, onDisconnect: vi.fn() });
    f.emit(responseFrame(INSTAX_OPCODES.handshake));
    expect(onResponse).toHaveBeenCalledWith({
      opcode: INSTAX_OPCODES.handshake,
      payload: new Uint8Array(),
    });
  });

  it('rejectsConcurrentExchange', async () => {
    const f = fixture();
    const connection = await connectMiniLink3(f.bluetooth, {
      onResponse: vi.fn(),
      onDisconnect: vi.fn(),
    });
    const pending = connection.exchange(INSTAX_OPCODES.handshake);
    await expect(connection.exchange(INSTAX_OPCODES.handshake)).rejects.toThrow('pending');
    f.emit(responseFrame(INSTAX_OPCODES.handshake));
    await pending;
  });

  it('abortsOnDisconnect', async () => {
    const f = fixture();
    const onDisconnect = vi.fn();
    const connection = await connectMiniLink3(f.bluetooth, { onResponse: vi.fn(), onDisconnect });
    const pendingExchange = connection.exchange(INSTAX_OPCODES.handshake);
    f.device.dispatchEvent(new Event('gattserverdisconnected'));
    await expect(pendingExchange).rejects.toThrow('disconnected');
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('bounds a hung BLE write with the exchange timeout', async () => {
    vi.useFakeTimers();
    const f = fixture();
    let release!: () => void;
    f.write.writeValueWithoutResponse.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const connection = await connectMiniLink3(f.bluetooth, {
      onResponse: vi.fn(),
      onDisconnect: vi.fn(),
    });
    const pending = connection.exchange(INSTAX_OPCODES.handshake, undefined, 10);
    const outcome = pending.then(
      () => 'resolved',
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(11);
    const resultAtDeadline = await Promise.race([outcome, Promise.resolve('still pending')]);
    release();
    await outcome;
    expect(resultAtDeadline).toContain('timed out');
    await expect(connection.exchange(INSTAX_OPCODES.handshake)).rejects.toThrow('disconnected');
  });

  it('does not write later BLE slices after timeout or disconnect', async () => {
    vi.useFakeTimers();
    for (const failure of ['timeout', 'disconnect']) {
      const f = fixture();
      let release!: () => void;
      f.write.writeValueWithoutResponse.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );
      const connection = await connectMiniLink3(f.bluetooth, {
        onResponse: vi.fn(),
        onDisconnect: vi.fn(),
      });
      const pending = connection.exchange(INSTAX_OPCODES.downloadData, new Uint8Array(900), 10);
      const outcome = pending.then(
        () => 'resolved',
        (error: Error) => error.message
      );
      if (failure === 'timeout') await vi.advanceTimersByTimeAsync(11);
      else f.device.dispatchEvent(new Event('gattserverdisconnected'));
      const resultAtFailure = await outcome;
      release();
      await Promise.resolve();
      expect(resultAtFailure).not.toBe('resolved');
      expect(f.write.writeValueWithoutResponse).toHaveBeenCalledTimes(1);
    }
  });
});
