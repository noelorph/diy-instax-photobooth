export type Crop = { x: number; y: number; width: number; height: number };
const WIDTH = 600;
const HEIGHT = 800;
const MAX_JPEG_BYTES = 55_000;

export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): Crop {
  if (
    ![sourceWidth, sourceHeight, targetWidth, targetHeight].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    throw new RangeError('Image dimensions must be positive');
  }
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / targetRatio;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

export function validateTrialJpeg(jpeg: Uint8Array): void {
  if (jpeg.byteLength > MAX_JPEG_BYTES) throw new Error('JPEG exceeds 55,000 byte trial limit');
  if (
    jpeg.byteLength < 4 ||
    jpeg[0] !== 0xff ||
    jpeg[1] !== 0xd8 ||
    jpeg[jpeg.length - 2] !== 0xff ||
    jpeg[jpeg.length - 1] !== 0xd9
  ) {
    throw new Error('Invalid JPEG markers');
  }
  let frameFound = false;
  let offset = 2;
  while (offset + 3 < jpeg.length) {
    if (jpeg[offset] !== 0xff) throw new Error('Invalid JPEG marker sequence');
    while (jpeg[offset] === 0xff) offset++;
    const marker = jpeg[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= jpeg.length) throw new Error('Truncated JPEG frame');
    const length = (jpeg[offset] << 8) | jpeg[offset + 1];
    if (length < 2 || offset + length > jpeg.length) throw new Error('Invalid JPEG segment length');
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (marker !== 0xc0) throw new Error('JPEG must use baseline encoding');
      if (length < 8) throw new Error('Invalid JPEG frame');
      const height = (jpeg[offset + 3] << 8) | jpeg[offset + 4];
      const width = (jpeg[offset + 5] << 8) | jpeg[offset + 6];
      if (width !== WIDTH || height !== HEIGHT) throw new Error('JPEG must be 600 × 800');
      frameFound = true;
    }
    offset += length;
  }
  if (!frameFound) throw new Error('JPEG baseline frame not found');
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Browser could not encode JPEG'))),
      'image/jpeg',
      quality
    );
  });
}

export async function capturePrintableFrame(
  video: HTMLVideoElement
): Promise<{ jpeg: Uint8Array; previewUrl: string }> {
  const crop = coverCrop(video.videoWidth, video.videoHeight, WIDTH, HEIGHT);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering unavailable');
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, WIDTH, HEIGHT);
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await encodeJpeg(canvas, quality);
    if (blob.size > MAX_JPEG_BYTES) continue;
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    validateTrialJpeg(jpeg);
    return { jpeg, previewUrl: URL.createObjectURL(blob) };
  }
  throw new Error('JPEG exceeds 55,000 byte trial limit');
}

export function revokePreview(url: string): void {
  URL.revokeObjectURL(url);
}
