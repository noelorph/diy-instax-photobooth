import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crc32 } from 'node:zlib';

export const mediaFixture = (name: string) =>
  readFileSync(resolve('tests/fixtures/event-media', name));

// Valid ancillary padding exercises transfer/size boundaries without large checked-in fixtures.
export function paddedMedia(bytes: Buffer, length: number, format: 'png' | 'mp4') {
  const padding = Buffer.alloc(length - bytes.length);
  if (format === 'mp4') {
    padding.writeUInt32BE(padding.length);
    padding.write('free', 4);
    return Buffer.concat([bytes, padding]);
  }
  padding.writeUInt32BE(padding.length - 12);
  padding.write('tEXt', 4);
  padding.write('Padding\0', 8);
  padding.writeUInt32BE(crc32(padding.subarray(4, -4)), padding.length - 4);
  return Buffer.concat([bytes.subarray(0, -12), padding, bytes.subarray(-12)]);
}
