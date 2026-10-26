import sharp from 'sharp';
import { BoxParser, createFile, type MP4BoxBuffer } from 'mp4box';
import type { MediaKind } from './media-types';

export class MediaValidationError extends Error {
  constructor() {
    super(
      'Choose a valid still JPEG, PNG or WebP up to 10 MB, or an H.264 MP4 up to 50 MB and 30 seconds.'
    );
  }
}
const invalid = (): never => {
  throw new MediaValidationError();
};

function rejectApng(bytes: Buffer) {
  // libvips may expose only APNG's first frame; reject its animation control chunk.
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    if (size > bytes.length - offset - 12) invalid();
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') invalid();
    offset += size + 12;
  }
  if (offset !== bytes.length) invalid();
}

function montageDuration(bytes: Buffer) {
  const file = createFile(true);
  file.onError = invalid;
  const buffer = Uint8Array.from(bytes).buffer as MP4BoxBuffer;
  buffer.fileStart = 0;
  file.appendBuffer(buffer, true);
  file.flush();
  const info = file.getInfo();
  if (!info.hasMoov || !info.videoTracks.length || !file.ftyp || info.timescale <= 0) invalid();
  if (!info.brands.some((brand) => /^(isom|iso[2-9]|mp4[12]|avc1|dash|cmf[cf2]|M4V )$/.test(brand)))
    invalid();
  const last = file.boxes.at(-1);
  if (!last || last.start === undefined || last.start + last.size !== bytes.length) invalid();
  let duration = info.duration / info.timescale;
  if (info.fragment_duration)
    duration = Math.max(duration, info.fragment_duration.num / info.fragment_duration.den);
  for (const track of info.tracks) {
    const samples = file.getTrackSamplesInfo(track.id);
    if (!samples.length || track.timescale <= 0) invalid();
    let end = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      if (
        sample.size <= 0 ||
        sample.duration <= 0 ||
        !Number.isSafeInteger(sample.offset) ||
        !file.mdats.some(
          (m) =>
            m.start !== undefined &&
            m.hdr_size !== undefined &&
            sample.offset >= m.start + m.hdr_size &&
            sample.offset + sample.size <= m.start + m.size
        )
      )
        invalid();
      if (track.video) {
        const description = sample.description;
        if (
          !(description instanceof BoxParser.sampleEntry.avc1) &&
          !(description instanceof BoxParser.sampleEntry.avc3)
        )
          return invalid();
        const config = description.avcC;
        if (
          !config ||
          config.configurationVersion !== 1 ||
          !config.SPS.length ||
          !config.PPS.length
        )
          invalid();
      }
      const extracted = file.getTrackSample(track.id, i);
      if (!extracted?.data || extracted.data.length !== sample.size) invalid();
      end = Math.max(end, (sample.cts + sample.duration) / track.timescale);
    }
    if (track.edits?.length) {
      // Edit durations use the movie clock, including empty edits (presentation delays).
      end = track.edits.reduce((sum, edit) => {
        if (edit.segment_duration < 0 || edit.media_time < -1) invalid();
        return sum + edit.segment_duration / info.timescale;
      }, 0);
    }
    duration = Math.max(duration, end, track.movie_duration / info.timescale);
  }
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30) invalid();
  // Preserve a positive presentation when storing whole-millisecond metadata.
  return Math.ceil(duration * 1000);
}

export async function validateEventMedia(
  bytes: Uint8Array,
  kind: MediaKind
): Promise<{ contentType: string; byteLength: number; durationMs: number | null }> {
  try {
    if (!bytes.byteLength || bytes.byteLength > (kind === 'background' ? 10_000_000 : 50_000_000))
      invalid();
    const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (kind === 'montage')
      return {
        contentType: 'video/mp4',
        byteLength: bytes.byteLength,
        durationMs: montageDuration(data),
      };
    rejectApng(data);
    const image = sharp(data, { failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
      invalid();
    await image.raw().toBuffer();
    return {
      contentType: `image/${metadata.format}`,
      byteLength: bytes.byteLength,
      durationMs: null,
    };
  } catch {
    throw new MediaValidationError();
  }
}
