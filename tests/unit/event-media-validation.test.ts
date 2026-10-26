// @vitest-environment node
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { validateEventMedia, MediaValidationError } from '@/lib/events/media-validation';
import { paddedMedia, mediaFixture } from '../fixtures/event-media';

describe('trusted Event Media content', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'decodes a still %s using its actual content',
    async (format) => {
      const bytes = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#456' },
      })
        .toFormat(format)
        .toBuffer();
      expect(await validateEventMedia(bytes, 'background')).toEqual({
        contentType: `image/${format}`,
        byteLength: bytes.length,
        durationMs: null,
      });
    }
  );
  it.each(['animated.png', 'animated.webp'])('rejects animated %s', async (name) => {
    await expect(validateEventMedia(mediaFixture(name), 'background')).rejects.toBeInstanceOf(
      MediaValidationError
    );
  });
  it('accepts the exact image byte limit and rejects one byte over', async () => {
    const image = paddedMedia(
      await sharp({ create: { width: 8, height: 8, channels: 3, background: '#456' } })
        .png()
        .toBuffer(),
      10_000_000,
      'png'
    );
    expect((await validateEventMedia(image, 'background')).byteLength).toBe(10_000_000);
    await expect(
      validateEventMedia(Buffer.concat([image, Buffer.from([0])]), 'background')
    ).rejects.toBeInstanceOf(MediaValidationError);
  });
  it('rejects unsupported and truncated images rather than relying on metadata', async () => {
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#456' } })
      .png()
      .toBuffer();
    for (const bytes of [Buffer.from('image/png'), image.subarray(0, 50), Buffer.alloc(0)])
      await expect(validateEventMedia(bytes, 'background')).rejects.toBeInstanceOf(
        MediaValidationError
      );
  });
  it('accepts H.264 with audio and preserves positive effective duration', async () => {
    const result = await validateEventMedia(mediaFixture('avc-audio.mp4'), 'montage');
    expect(result.contentType).toBe('video/mp4');
    expect(result.durationMs).toBeGreaterThanOrEqual(2000);
    expect(result.durationMs).toBeLessThan(2100);
  });
  it('accepts exactly thirty seconds and exactly fifty million bytes', async () => {
    const video = paddedMedia(mediaFixture('avc-30s.mp4'), 50_000_000, 'mp4');
    expect(await validateEventMedia(video, 'montage')).toEqual({
      contentType: 'video/mp4',
      byteLength: 50_000_000,
      durationMs: 30_000,
    });
    await expect(
      validateEventMedia(Buffer.concat([video, Buffer.from([0])]), 'montage')
    ).rejects.toBeInstanceOf(MediaValidationError);
  });
  it('accepts a complete fragmented AVC montage', async () => {
    expect(
      (await validateEventMedia(mediaFixture('avc-fragmented-2s.mp4'), 'montage')).durationMs
    ).toBe(2000);
  });
  it.each(['hevc.mp4', 'avc-fragmented-31s.mp4', 'avc-quicktime.mov'])(
    'rejects unsupported or excessive montage %s',
    async (name) => {
      await expect(validateEventMedia(mediaFixture(name), 'montage')).rejects.toBeInstanceOf(
        MediaValidationError
      );
    }
  );
  it('preserves a positive submillisecond presentation duration', async () => {
    const short = Buffer.from(mediaFixture('avc-30s.mp4'));
    short.writeUInt32BE(1_000_000_000, short.indexOf('mvhd') + 16);
    expect((await validateEventMedia(short, 'montage')).durationMs).toBeGreaterThan(0);
  });
  it('rejects zero-duration samples and excessive edit-list presentation time', async () => {
    const zero = Buffer.from(mediaFixture('avc-30s.mp4'));
    zero.writeUInt32BE(0, zero.indexOf('stts') + 16);
    const delayed = Buffer.from(mediaFixture('avc-30s.mp4'));
    delayed.writeUInt32BE(31_000, delayed.indexOf('elst') + 12);
    const outside = Buffer.from(mediaFixture('avc-30s.mp4'));
    outside.writeUInt32BE(outside.length + 1, outside.indexOf('stco') + 12);
    for (const bytes of [zero, delayed, outside])
      await expect(validateEventMedia(bytes, 'montage')).rejects.toBeInstanceOf(
        MediaValidationError
      );
  });
  it('rejects incomplete media data and a codec-mismatched sample description', async () => {
    const video = mediaFixture('avc-audio.mp4');
    const mismatch = Buffer.from(video);
    mismatch.write('hvc1', mismatch.indexOf('avc1', mismatch.indexOf('stsd')));
    for (const bytes of [video.subarray(0, video.length - 100), mismatch, Buffer.from('video/mp4')])
      await expect(validateEventMedia(bytes, 'montage')).rejects.toBeInstanceOf(
        MediaValidationError
      );
  });
});
