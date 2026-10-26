import { beginEventMediaUpload } from '@/lib/events/media';
export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  return beginEventMediaUpload(request, (await params).eventId);
}
