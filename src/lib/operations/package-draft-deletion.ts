import 'server-only';
import { createHash } from 'node:crypto';
import { requireAdminRequest } from './admin-authority';
import { createPrivilegedClient } from './privileged-client';
import { removeEventMedia } from './draft-media-cleanup';
import { packageErrorResponse } from './package-route';
import { packageRpc } from './package-rpc';
import { readPackageAdminState } from './package-state';
import { packageActionSchemas, parsePackageOperation } from './package-validation';
import { operationResponse } from './responses';
import { operationId, requireSameOrigin } from './validation';

// A stable second key makes a lost cleanup response recoverable without a new command.
export function cleanupOperationId(operationId: string) {
  const hex = createHash('sha256').update(`complete_delete_draft:${operationId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function deletePackageDraft(request: Request, eventId: string) {
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const id = operationId(eventId);
    const input = await parsePackageOperation(request, packageActionSchemas.deleteDraft);
    const args = {
      p_admin_user_id: admin.userId,
      p_admin_session_id: admin.sessionId,
    };
    const begin = await packageRpc('package_admin_operation', {
      ...args,
      p_operation: 'begin_delete_draft',
      p_operation_id: input.operationId,
      p_payload: { eventId: id, expectedRevision: input.expectedRevision },
    });
    const state = await readPackageAdminState(admin, id);
    if (state.mediaRemovalState === 'complete') {
      const done = await readPackageAdminState(admin, id, cleanupOperationId(input.operationId));
      return operationResponse({ ...done, mediaRemovalState: 'complete' });
    }
    try {
      await removeEventMedia(createPrivilegedClient(), id);
    } catch {
      return operationResponse({ ...begin, mediaRemovalState: 'pending' });
    }
    const complete = await packageRpc('package_admin_operation', {
      ...args,
      p_operation: 'complete_delete_draft',
      p_operation_id: cleanupOperationId(input.operationId),
      p_payload: { eventId: id, expectedRevision: state.revision },
    });
    return operationResponse({ ...complete, mediaRemovalState: 'complete' });
  } catch (error) {
    return packageErrorResponse(error);
  }
}
