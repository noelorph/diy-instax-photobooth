import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coverCrop, validateTrialJpeg } from './image';

const encodedJpeg = new Uint8Array(
  readFileSync('src/features/qualification/fixtures/baseline-600x800.jpg')
);
const frameOffset = encodedJpeg.findIndex(
  (byte, index) => byte === 0xff && encodedJpeg[index + 1] === 0xc0
);

function malformedFrameOnlyJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 3, 32, 2, 88, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff,
    0xd9,
  ]);
}

describe('qualification printable image', () => {
  it('centersLandscapeCrop', () => {
    expect(coverCrop(1600, 900, 600, 800)).toEqual({ x: 462.5, y: 0, width: 675, height: 900 });
    expect(coverCrop(900, 1600, 600, 800)).toEqual({ x: 0, y: 200, width: 900, height: 1200 });
  });

  it('rejectsZeroDimensions', () => {
    expect(() => coverCrop(0, 900, 600, 800)).toThrow('dimensions');
    expect(() => coverCrop(900, 1600, 0, 800)).toThrow('dimensions');
  });

  it('rejectsProgressiveJpeg', () => {
    const progressive = encodedJpeg.slice();
    progressive[frameOffset + 1] = 0xc2;
    expect(() => validateTrialJpeg(progressive)).toThrow('baseline');
  });

  it('rejectsWrongSize', () => {
    const wrongSize = encodedJpeg.slice();
    wrongSize[frameOffset + 7] = 3;
    expect(() => validateTrialJpeg(wrongSize)).toThrow('600');
    expect(() => validateTrialJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow('frame');
    expect(() => validateTrialJpeg(new Uint8Array([0, 0, 0]))).toThrow('JPEG');
  });

  it('rejectsOversize', () => {
    const tooLarge = new Uint8Array(55_001);
    tooLarge.set(encodedJpeg);
    expect(() => validateTrialJpeg(tooLarge)).toThrow('55,000');
    expect(() => validateTrialJpeg(encodedJpeg)).not.toThrow();
  });

  it('rejects a frame header without JPEG tables, scan, or image data', () => {
    expect(() => validateTrialJpeg(malformedFrameOnlyJpeg())).toThrow('scan');
  });
});
