const MIN_PACKET_BYTES = 7;
const MAX_RESPONSE_BYTES = 4096;
export const INSTAX_IMAGE_CHUNK_BYTES = 900;

export const INSTAX_BLE_UUIDS = {
  printService: '70954782-2d83-473d-9e5f-81e1d02d5273',
  writeCharacteristic: '70954783-2d83-473d-9e5f-81e1d02d5273',
  notifyCharacteristic: '70954784-2d83-473d-9e5f-81e1d02d5273',
} as const;

export const INSTAX_OPCODES = {
  handshake: 0x0000,
  supportFunctionInfo: 0x0002,
  downloadStart: 0x1000,
  downloadData: 0x1001,
  downloadEnd: 0x1002,
  printImage: 0x1080,
} as const;

export type InstaxOpcode = (typeof INSTAX_OPCODES)[keyof typeof INSTAX_OPCODES];
export type InstaxResponse = { opcode: number; payload: Uint8Array };

function checksum(bytes: Uint8Array): number {
  return ~bytes.reduce((sum, byte) => sum + byte, 0) & 255;
}

export function buildRequest(
  opcode: InstaxOpcode,
  payload: Uint8Array = new Uint8Array()
): Uint8Array {
  const length = MIN_PACKET_BYTES + payload.byteLength;
  if (length > 65535) throw new RangeError('Instax request length exceeds packet limit');
  const packet = new Uint8Array(length);
  packet.set([0x41, 0x62]);
  new DataView(packet.buffer).setUint16(2, length, false);
  new DataView(packet.buffer).setUint16(4, opcode, false);
  packet.set(payload, 6);
  packet[length - 1] = checksum(packet.subarray(0, -1));
  return packet;
}

export function parseResponse(packet: Uint8Array): InstaxResponse {
  if (packet.byteLength < MIN_PACKET_BYTES) throw new Error('Instax response length is too short');
  if (packet[0] !== 0x61 || packet[1] !== 0x42) throw new Error('Instax response magic is invalid');
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  if (view.getUint16(2, false) !== packet.byteLength || packet.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error('Instax response length is invalid');
  }
  if (packet[packet.length - 1] !== checksum(packet.subarray(0, -1))) {
    throw new Error('Instax response checksum is invalid');
  }
  return { opcode: view.getUint16(4, false), payload: packet.slice(6, -1) };
}

export class InstaxResponseStream {
  private pending = new Uint8Array<ArrayBufferLike>(new ArrayBuffer(0));

  push(chunk: Uint8Array): InstaxResponse[] {
    if (this.pending.byteLength + chunk.byteLength > MAX_RESPONSE_BYTES * 2) {
      throw new Error('Instax response buffer length is invalid');
    }
    const next = new Uint8Array(this.pending.byteLength + chunk.byteLength);
    next.set(this.pending);
    next.set(chunk, this.pending.byteLength);
    this.pending = next;
    const responses: InstaxResponse[] = [];
    while (this.pending.byteLength >= 4) {
      if (this.pending[0] !== 0x61 || this.pending[1] !== 0x42) {
        this.pending = this.pending.slice(1);
        continue;
      }
      const length = new DataView(this.pending.buffer, this.pending.byteOffset).getUint16(2, false);
      if (length < MIN_PACKET_BYTES || length > MAX_RESPONSE_BYTES) {
        this.pending = new Uint8Array();
        throw new Error('Instax response length is invalid');
      }
      if (this.pending.byteLength < length) break;
      responses.push(parseResponse(this.pending.slice(0, length)));
      this.pending = this.pending.slice(length);
    }
    return responses;
  }
}
