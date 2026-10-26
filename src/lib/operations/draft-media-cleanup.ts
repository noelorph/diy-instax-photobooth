import 'server-only';
import { createPrivilegedClient } from './privileged-client';

// Event Media is private branding only. Guest photos never reach Storage.
export async function removeEventMedia(
  client: ReturnType<typeof createPrivilegedClient>,
  eventId: string
) {
  const event = await client.from('events').select('state,deleted_at').eq('id', eventId).single();
  if (event.error) throw event.error;
  const assets = await client
    .from('event_media_assets')
    .select('path,state')
    .eq('event_id', eventId);
  if (assets.error) throw assets.error;
  const deleting = event.data.state === 'Draft' && event.data.deleted_at !== null;
  const retired = new Set(
    assets.data.filter((asset) => asset.state === 'cleanup_pending').map((asset) => asset.path)
  );
  const bucket = await client.storage.getBucket('event_media');
  if (bucket.error) {
    if (
      String(bucket.error.statusCode) === '404' &&
      bucket.error.message === 'Bucket not found' &&
      !assets.data.length
    )
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
        else if (deleting || retired.has(path)) paths.push(path);
      }
      if (data.length < 100) break;
    }
  }
  await collectPrefix(eventId);
  for (let start = 0; start < paths.length; start += 100) {
    const { error } = await storage.remove(paths.slice(start, start + 100));
    if (error) throw error;
  }
  const remaining = await storage.list(eventId, { limit: 1 });
  if (remaining.error) throw remaining.error;
  if (deleting && (remaining.data.length || assets.data.length)) {
    // ADR-0030: no supported transfer inventory/backend drain proof exists yet.
    throw new Error('Media cleanup remains pending.');
  }
}
