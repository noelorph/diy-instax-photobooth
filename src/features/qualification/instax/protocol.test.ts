import { describe, expect, it } from 'vitest';
import { buildRequest, InstaxResponseStream, INSTAX_OPCODES, parseResponse } from './protocol';

function responseFrame(opcode: number, payload: number[] = []): Uint8Array {
  const bytes = new Uint8Array([
    0x61,
    0x42,
    0,
    7 + payload.length,
    opcode >> 8,
    opcode & 255,
    ...payload,
    0,
  ]);
  bytes[bytes.length - 1] = ~bytes.subarray(0, -1).reduce((sum, byte) => sum + byte, 0) & 255;
  return bytes;
}

describe('Instax packet framing', () => {
  it('builds request magic, big-endian length and opcode, and checksum', () => {
    expect([...buildRequest(INSTAX_OPCODES.downloadStart, new Uint8Array([2, 3]))]).toEqual([
      0x41, 0x62, 0, 9, 0x10, 0, 2, 3, 0x3e,
    ]);
  });

  it('reassembles split responses', () => {
    const stream = new InstaxResponseStream();
    const packet = responseFrame(INSTAX_OPCODES.handshake, [0]);
    expect(stream.push(packet.subarray(0, 3))).toEqual([]);
    expect(stream.push(packet.subarray(3))).toEqual([
      { opcode: INSTAX_OPCODES.handshake, payload: new Uint8Array([0]) },
    ]);
  });

  it('rejects bad magic, declared length and checksum', () => {
    const valid = responseFrame(INSTAX_OPCODES.handshake);
    const invalidMagic = valid.slice();
    invalidMagic[0] = 0;
    const invalidLength = valid.slice();
    invalidLength[3] = 8;
    const invalidChecksum = valid.slice();
    invalidChecksum[6] ^= 1;
    expect(() => parseResponse(invalidMagic)).toThrow('magic');
    expect(() => parseResponse(invalidLength)).toThrow('length');
    expect(() => parseResponse(invalidChecksum)).toThrow('checksum');
  });

  it('rejects an impossible declared stream length before buffering payload', () => {
    expect(() => new InstaxResponseStream().push(new Uint8Array([0x61, 0x42, 0xff, 0xff]))).toThrow(
      'length'
    );
  });
});
