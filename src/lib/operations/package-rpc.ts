import 'server-only';
import type { Json } from '@/lib/supabase/database.types';
import { createPrivilegedClient } from './privileged-client';
import { PackageError, packageErrorStatus } from './package-contract';

export function packageRpcError(error: { message: string } | null): never {
  const code = error?.message;
  if (code && Object.hasOwn(packageErrorStatus, code))
    throw new PackageError(code as keyof typeof packageErrorStatus);
  throw new PackageError('operation_unavailable');
}

export async function packageRpc(
  name:
    | 'package_admin_operation'
    | 'package_booth_operation'
    | 'package_issue_handoff'
    | 'package_fail_handoff'
    | 'package_admin_read'
    | 'package_booth_read'
    | 'package_setup_read',
  args: Record<string, Json>
) {
  const { data, error } = await createPrivilegedClient().rpc(name as never, args as never);
  if (error) packageRpcError(error);
  return data as Record<string, unknown>;
}
