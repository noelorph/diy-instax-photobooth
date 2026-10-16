import 'server-only';
import { z } from 'zod';
import { adminArgs, adminOperation } from './admin-route';
import { revisionSchema } from './admin-validation';
import { operationId } from './validation';
import { createPrivilegedClient } from './privileged-client';

type RemovalResult = {
  event_id: string;
  revision: number;
  media_removal_state: 'pending' | 'complete';
};
const redactionSchema = revisionSchema.extend({
  replacementTitle: z.string().trim().min(1).max(1000).optional(),
});

// Event Media is private branding only. Guest photos never reach Storage.
// Future uploads must use this UUID prefix and reject redacted/deleted Events.
async function removeEventMedia(
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

export async function redactEvent(
  request: Request,
  eventId: string,
  action: 'redact_client' | 'delete_draft'
) {
  return adminOperation(
    request,
    action === 'redact_client' ? redactionSchema : revisionSchema,
    async (input, admin) => {
      const id = operationId(eventId);
      const client = createPrivilegedClient();
      const args = { ...adminArgs(admin, input.operationKey), event_id: id };
      const { data, error } = await client.rpc('begin_event_redaction', {
        ...args,
        expected_revision: input.expectedRevision,
        action,
        ...('replacementTitle' in input
          ? { replacement_title: input.replacementTitle as string }
          : {}),
      });
      if (error) throw error;
      let result = data as RemovalResult;
      // Begin receipts replay the original pending result. Consult the durable
      // state before touching Storage so a completed retry cannot regress.
      const current = await client
        .from('events')
        .select('revision,media_removal_state')
        .eq('id', id)
        .single();
      if (current.error) throw current.error;
      if (current.data.media_removal_state !== 'complete') {
        try {
          await removeEventMedia(client, result.event_id);
        } catch {
          // Never log Storage errors or paths, which may contain legacy names.
          // Identity stays erased; the persisted cleanup remains retryable.
          return {
            eventId: result.event_id,
            revision: result.revision,
            mediaRemovalState: 'pending',
          };
        }
      }
      const completed = await client.rpc('complete_event_redaction', args);
      if (completed.error) throw completed.error;
      result = completed.data as RemovalResult;
      return {
        eventId: id,
        revision: result.revision,
        mediaRemovalState: result.media_removal_state,
      };
    },
    eventId
  );
}
