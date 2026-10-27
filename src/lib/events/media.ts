import 'server-only';
import { z } from 'zod';
import { requireAdminRequest } from '@/lib/operations/admin-authority';
import { requireSameOrigin, operationId, parseOperation } from '@/lib/operations/validation';
import { packageRpc } from '@/lib/operations/package-rpc';
import { packageErrorResponse } from '@/lib/operations/package-route';
import { operationResponse } from '@/lib/operations/responses';
import { PackageError } from '@/lib/operations/package-contract';
import { createPrivilegedClient } from '@/lib/operations/privileged-client';
import { removeEventMedia } from '@/lib/operations/draft-media-cleanup';
import { validateEventMedia, MediaValidationError } from './media-validation';
import type { MediaKind } from './media-types';
import {
  EVENT_MEDIA_UPLOADS_AVAILABLE,
  EVENT_MEDIA_UNAVAILABLE_MESSAGE,
} from './media-availability';

const mutation = z.strictObject({
  operationId: z.uuid(),
  expectedRevision: z.number().int().min(1).max(2147483646),
});
const begin = mutation.extend({ kind: z.enum(['background', 'montage']) });

export async function beginEventMediaUpload(request: Request, eventId: string): Promise<Response> {
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const { operationId: key, ...payload } = await parseOperation(request, begin);
    operationId(eventId);
    if (!EVENT_MEDIA_UPLOADS_AVAILABLE)
      return operationResponse(
        { code: 'operation_unavailable', message: EVENT_MEDIA_UNAVAILABLE_MESSAGE },
        503
      );
    return operationResponse(
      await packageRpc('event_media_operation', {
        p_admin_user_id: admin.userId,
        p_admin_session_id: admin.sessionId,
        p_operation: 'begin_upload',
        p_operation_id: key,
        p_payload: { eventId: operationId(eventId), ...payload },
      })
    );
  } catch (error) {
    return packageErrorResponse(error);
  }
}

async function download(path: string, limit: number) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/event_media/${path}`,
    {
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        apikey: process.env.SUPABASE_SECRET_KEY!,
      },
      cache: 'no-store',
    }
  );
  if (!response.ok || !response.body) throw new PackageError('operation_unavailable');
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new MediaValidationError();
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}

export async function commitEventMedia(
  request: Request,
  eventId: string,
  assetId: string
): Promise<Response> {
  let cleanupId: string | undefined;
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const { operationId: key, expectedRevision } = await parseOperation(request, mutation);
    const id = operationId(assetId),
      eid = operationId(eventId);
    const client = createPrivilegedClient();
    const { data: asset, error } = await client
      .from('event_media_assets')
      .select('*')
      .eq('id', id)
      .eq('event_id', eid)
      .maybeSingle();
    if (error) throw new PackageError('operation_unavailable');
    if (!asset) throw new PackageError('operation_forbidden');
    if (request.method === 'DELETE') {
      const result = await packageRpc('event_media_operation', {
        p_admin_user_id: admin.userId,
        p_admin_session_id: admin.sessionId,
        p_operation: 'remove',
        p_operation_id: key,
        p_payload: { eventId: eid, assetId: id, expectedRevision },
      });
      try {
        await removeEventMedia(client, eid);
      } catch {
        /* Durable cleanup_pending remains retryable. */
      }
      return operationResponse(result);
    }
    if (asset.uploaded_by !== admin.userId) throw new PackageError('operation_forbidden');
    // Saved metadata can recover an existing receipt; the database rejects every fresh attach.
    if (!EVENT_MEDIA_UPLOADS_AVAILABLE && !asset.content_type)
      return operationResponse(
        { code: 'operation_unavailable', message: EVENT_MEDIA_UNAVAILABLE_MESSAGE },
        503
      );
    cleanupId = id;
    if (!asset.content_type) {
      const event = await client
        .from('events')
        .select('state,deleted_at,revision')
        .eq('id', eid)
        .single();
      if (event.error) throw new PackageError('operation_unavailable');
      if (event.data.state !== 'Draft' || event.data.deleted_at)
        throw new PackageError('invalid_transition');
      if (event.data.revision !== expectedRevision) throw new PackageError('stale_revision');
    }
    // Saved metadata permits receipt recovery even after a later replacement was cleaned up.
    const validated = asset.content_type
      ? {
          contentType: asset.content_type,
          byteLength: asset.byte_length!,
          durationMs: asset.duration_ms,
        }
      : await validateEventMedia(
          await download(asset.path, asset.kind === 'background' ? 10_000_000 : 50_000_000),
          asset.kind as MediaKind
        );
    const result = await packageRpc('event_media_operation', {
      p_admin_user_id: admin.userId,
      p_admin_session_id: admin.sessionId,
      p_operation: 'attach',
      p_operation_id: key,
      p_payload: { eventId: eid, assetId: id, expectedRevision, ...validated },
    });
    try {
      await removeEventMedia(client, eid);
    } catch {
      /* Preserve the committed attachment and cleanup state. */
    }
    return operationResponse(result);
  } catch (error) {
    if (
      cleanupId &&
      (error instanceof MediaValidationError ||
        (error instanceof PackageError &&
          ['stale_revision', 'invalid_transition', 'operation_forbidden'].includes(error.code)))
    ) {
      // Cleanup failure leaves the durable upload record retryable; never retire an attached asset.
      await createPrivilegedClient().rpc('event_media_cleanup', {
        p_asset_id: cleanupId,
        p_removed: false,
      });
    }
    return error instanceof MediaValidationError
      ? operationResponse({ code: 'invalid_media', message: error.message }, 400)
      : packageErrorResponse(error);
  }
}
