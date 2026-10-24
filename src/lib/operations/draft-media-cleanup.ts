import 'server-only';
import { createPrivilegedClient } from './privileged-client';

// Event Media is private branding only. Guest photos never reach Storage.
// Future uploads must use this UUID prefix and reject redacted/deleted Events.
export async function removeEventMedia(
  client: ReturnType<typeof createPrivilegedClient>,
  eventId: string
) {
  const bucket = await client.storage.getBucket('event_media');
  if (bucket.error) {
    if (String(bucket.error.statusCode) === '404' && bucket.error.message === 'Bucket not found')
      return;
    throw bucket.error;
  }
  const storage = client.storage.from('event_media');
  const paths: string[] = [];
  async function collectPrefix(prefix: string): Promise<void> {
    // Enumerate the entire tree before deleting: removing child objects can
    // also remove their virtual parent folders and shift later pages.
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      for (const item of data) {
        const path = `${prefix}/${item.name}`;
        if (item.id === null) await collectPrefix(path);
        else paths.push(path);
      }
      if (data.length < 100) break;
    }
  }
  await collectPrefix(eventId);
  for (let start = 0; start < paths.length; start += 100) {
    const { error } = await storage.remove(paths.slice(start, start + 100));
    if (error) throw error;
  }
}
