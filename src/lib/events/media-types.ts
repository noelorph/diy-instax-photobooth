export type MediaKind = 'background' | 'montage';
export type EventMediaAsset = {
  id: string;
  kind: MediaKind;
  url: string;
  expiresAt: string;
  contentType: string;
};
export type EventMedia = { background: EventMediaAsset | null; montage: EventMediaAsset | null };
