import { describe, expect, it } from 'vitest';
import { coverCrop, validateTrialJpeg } from './image';

function jpeg(marker = 0xc0, width = 600, height = 800): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    marker,
    0,
    17,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0,
    0xff,
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
    expect(() => validateTrialJpeg(jpeg(0xc2))).toThrow('baseline');
  });

  it('rejectsWrongSize', () => {
    expect(() => validateTrialJpeg(jpeg(0xc0, 800, 600))).toThrow('600');
    expect(() => validateTrialJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow('frame');
    expect(() => validateTrialJpeg(new Uint8Array([0, 0, 0]))).toThrow('JPEG');
  });

  it('rejectsOversize', () => {
    const tooLarge = new Uint8Array(55_001);
    tooLarge.set(jpeg());
    expect(() => validateTrialJpeg(tooLarge)).toThrow('55,000');
    expect(() => validateTrialJpeg(jpeg())).not.toThrow();
  });
});
