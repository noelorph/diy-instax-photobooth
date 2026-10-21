import 'server-only';
import { requireAdminRequest } from './admin-authority';
import { grantHash } from './booth-authority';
import { createPrivilegedClient } from './privileged-client';
import { operationId } from './validation';
import { PackageError } from './package-contract';

export async function isPackageEvent(request: Request, eventId: string) {
  await requireAdminRequest(request);
  const { data, error } = await createPrivilegedClient()
    .from('events')
    .select('accounting_version')
    .eq('id', operationId(eventId))
    .maybeSingle();
  if (error) throw new PackageError('operation_unavailable');
  return data?.accounting_version === 2;
}
export async function isPackageAttempt(request: Request, attemptId: string) {
  await requireAdminRequest(request);
  const { data, error } = await createPrivilegedClient()
    .from('print_attempts')
    .select('accounting_version')
    .eq('id', operationId(attemptId))
    .maybeSingle();
  if (error) throw new PackageError('operation_unavailable');
  return data?.accounting_version === 2;
}
export async function isPackageGrant(request: Request) {
  const { data, error } = await createPrivilegedClient()
    .from('booth_grants')
    .select('accounting_version')
    .eq('secret_hash', grantHash(request))
    .maybeSingle();
  if (error) throw new PackageError('operation_unavailable');
  return data?.accounting_version === 2;
}
