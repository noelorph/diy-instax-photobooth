import 'server-only';
import { createPrivilegedClient } from './privileged-client';
import { packageRpc } from './package-rpc';
import { PackageError } from './package-contract';

export async function readPackageAdminState(
  admin: { userId: string; sessionId: string },
  eventId: string,
  operationId?: string
) {
  const state = await packageRpc('package_admin_read', {
    p_admin_user_id: admin.userId,
    p_admin_session_id: admin.sessionId,
    p_event_id: eventId,
    p_operation_id: operationId ?? null,
  });
  const client = createPrivilegedClient();
  const { data, error } = await client
    .from('print_attempts')
    .select('id,state,run_id')
    .eq('event_id', eventId)
    .eq('accounting_version', 2)
    .in('state', ['Reserved', 'Dispatching', 'Accepted', 'Pending']);
  if (error) throw new PackageError('operation_unavailable');
  const run = await client
    .from('booth_runs')
    .select('id,state')
    .eq('event_id', eventId)
    .eq('accounting_version', 2)
    .order('created_at', { ascending: false })
    .limit(1);
  if (run.error) throw new PackageError('operation_unavailable');
  return {
    ...state,
    revision: state.revision as number,
    receipt: state.receipt,
    mediaRemovalState: state.mediaRemovalState as string | undefined,
    runId: run.data[0]?.id ?? null,
    runState: run.data[0]?.state ?? null,
    pendingAttempts: data.map(({ id, state, run_id }) => ({ attemptId: id, state, runId: run_id })),
  };
}

export async function readPackageBoothState(hash: string, operationId?: string) {
  const state = await packageRpc('package_booth_read', {
    p_grant_hash: hash,
    p_operation_id: operationId ?? null,
  });
  const { data, error } = await createPrivilegedClient()
    .from('print_attempts')
    .select('id')
    .eq('run_id', state.runId as string)
    .eq('accounting_version', 2)
    .in('state', ['Reserved', 'Dispatching', 'Accepted', 'Pending'])
    .limit(1);
  if (error) throw new PackageError('operation_unavailable');
  if (
    !['Prepared', 'Active', 'Paused', 'Finishing'].includes(state.state as string) ||
    !Array.isArray(state.blockers) ||
    !state.blockers.every((value) => typeof value === 'string')
  )
    throw new PackageError('operation_unavailable');
  const blockers = state.blockers as string[];
  const pendingAttemptId = data[0]?.id ?? null;
  const principalStatus =
    state.state === 'Finishing'
      ? 'finishing'
      : state.state === 'Paused'
        ? 'paused'
        : pendingAttemptId
          ? 'print_pending'
          : blockers.includes('server_unreachable') || blockers.includes('readiness_stale')
            ? 'connection_unavailable'
            : blockers.includes('printer_connection')
              ? 'bluetooth_disconnected'
              : blockers.includes('camera')
                ? 'camera_disconnected'
                : blockers.includes('film_reload_needed') || blockers.includes('printer_not_safe')
                  ? 'printer_unavailable'
                  : blockers.includes('booked_prints_exhausted')
                    ? 'booked_prints_exhausted'
                    : 'welcome';
  const actions = state.allowedActions as Record<string, unknown>;
  return {
    revision: state.revision,
    runId: state.runId,
    state: state.state,
    counts: state.counts,
    readiness: state.readiness,
    blockers,
    principalStatus,
    allowedActions: {
      ...actions,
      connectPrinter: blockers.includes('printer_connection'),
      enableCamera: blockers.includes('camera'),
    },
    readinessWindowId: state.readinessWindowId,
    receipt: state.receipt,
    pendingAttemptId,
  };
}

export async function isRecognizedFinishedProof(hash: string) {
  const client = createPrivilegedClient();
  const { data: grant, error } = await client
    .from('booth_grants')
    .select('run_id,expires_at,accounting_version')
    .eq('secret_hash', hash)
    .maybeSingle();
  if (
    error ||
    !grant ||
    grant.accounting_version !== 2 ||
    Date.parse(grant.expires_at) <= Date.now()
  )
    return false;
  const { data: run, error: runError } = await client
    .from('booth_runs')
    .select('state')
    .eq('id', grant.run_id)
    .maybeSingle();
  return !runError && run?.state === 'Finished';
}
