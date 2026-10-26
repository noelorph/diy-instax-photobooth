import { commitEventMedia } from '@/lib/events/media';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; assetId: string }> }
) {
  const { eventId, assetId } = await params;
  return commitEventMedia(request, eventId, assetId);
}
export const DELETE = POST;
