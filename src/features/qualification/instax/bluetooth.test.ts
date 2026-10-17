import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectMiniLink3, type WebBluetoothPort } from './bluetooth';
import { INSTAX_OPCODES } from './protocol';

function responseFrame(opcode: number): Uint8Array {
  const bytes = new Uint8Array([0x61, 0x42, 0, 7, opcode >> 8, opcode & 255, 0]);
  bytes[6] = ~bytes.subarray(0, 6).reduce((sum, byte) => sum + byte, 0) & 255;
  return bytes;
}

function fixture(model = 'FI033', link3Available = true) {
  const reads: string[] = [];
  const notify = Object.assign(new EventTarget(), {
    value: undefined as DataView | undefined,
    properties: { notify: true },
    startNotifications: vi.fn(async () => undefined),
    stopNotifications: vi.fn(async () => undefined),
  });
  const link3Notify = Object.assign(new EventTarget(), {
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
  const link3Status = { getCharacteristic: vi.fn(async () => link3Notify) };
  const server = {
    connected: true,
    getPrimaryService: vi.fn(async (uuid: string) => {
      if (uuid.includes('6287') && !link3Available) throw new Error('service unavailable');
      return uuid.includes('180a') ? info : uuid.includes('6287') ? link3Status : print;
    }),
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
  function emitLink3(bytes: Uint8Array) {
    link3Notify.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    link3Notify.dispatchEvent(new Event('characteristicvaluechanged'));
  }
  return {
    bluetooth,
    device,
    server,
    reads,
    print,
    notify,
    link3Notify,
    link3Status,
    write,
    writes,
    emit,
    emitLink3,
  };
}

afterEach(() => vi.useRealTimers());

describe('Mini Link 3 Bluetooth connection', () => {
  it('identifies a numeric failure before the device chooser opens', async () => {
    const f = fixture();
    vi.mocked(f.bluetooth.requestDevice).mockRejectedValueOnce(2);

    await expect(
      connectMiniLink3(f.bluetooth, { onResponse: vi.fn(), onDisconnect: vi.fn() })
    ).rejects.toMatchObject({ message: 'Bluetooth device selection: 2' });
  });

  it('identifies a numeric GATT connection failure', async () => {
    const f = fixture();
    vi.spyOn(f.device.gatt, 'connect').mockRejectedValueOnce(2);

    await expect(
      connectMiniLink3(f.bluetooth, { onResponse: vi.fn(), onDisconnect: vi.fn() })
    ).rejects.toMatchObject({ message: 'Bluetooth GATT connection: 2' });
  });

  it('identifies a numeric device information failure', async () => {
    const f = fixture();
    vi.mocked(f.server.getPrimaryService).mockRejectedValueOnce(2);

    await expect(
      connectMiniLink3(f.bluetooth, { onResponse: vi.fn(), onDisconnect: vi.fn() })
    ).rejects.toMatchObject({ message: 'Bluetooth device information service: 2' });
    expect(f.server.disconnect).toHaveBeenCalledOnce();
  });

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

  it('records read-only Link 3 status notifications and stops them on disconnect', async () => {
    const f = fixture();
    const onLink3Status = vi.fn();
    const onLink3StatusReady = vi.fn();
    const connection = await connectMiniLink3(f.bluetooth, {
      onResponse: vi.fn(),
      onDisconnect: vi.fn(),
      onLink3Status,
      onLink3StatusReady,
    });
    expect(f.bluetooth.requestDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        optionalServices: expect.arrayContaining(['00006287-3c17-d293-8e48-14fe2e4da212']),
      })
    );
    expect(f.link3Notify.startNotifications).toHaveBeenCalledOnce();
    expect(onLink3StatusReady).toHaveBeenCalledOnce();
    const status = new Uint8Array([0x12, 0x7f, 0x00]);
    f.emitLink3(status);
    expect(onLink3Status).toHaveBeenCalledWith(status);
    await connection.disconnect();
    expect(f.link3Notify.stopNotifications).toHaveBeenCalledOnce();
  });

  it('keeps the print connection when the optional Link 3 status service is unavailable', async () => {
    const f = fixture('FI033', false);
    const onLink3StatusError = vi.fn();
    const connection = await connectMiniLink3(f.bluetooth, {
      onResponse: vi.fn(),
      onDisconnect: vi.fn(),
      onLink3StatusError,
    });
    expect(connection.modelNumber).toBe('FI033');
    expect(onLink3StatusError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'service unavailable' })
    );
    const pending = connection.exchange(INSTAX_OPCODES.handshake);
    f.emit(responseFrame(INSTAX_OPCODES.handshake));
    await expect(pending).resolves.toMatchObject({ opcode: INSTAX_OPCODES.handshake });
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
