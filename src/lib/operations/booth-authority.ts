import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, type NextResponse } from 'next/server';
import { createPrivilegedClient } from './privileged-client';
import { OperationError, type BoothAuthority } from './types';
import { operationErrorResponse } from './responses';

// Only an authoritative rejection invalidates the browser's recoverable proof.
export class InvalidBoothGrantError extends OperationError {}
export function boothErrorResponse(error: unknown) {
  const response = operationErrorResponse(error);
  return error instanceof InvalidBoothGrantError ? clearBoothCookie(response) : response;
}
export const boothCookie = '__Host-booth-grant';
export const deviceCookie = '__Host-booth-device';
export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
};
export const newSecret = () => randomBytes(32).toString('hex');
export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
export function readSecret(request: Request, name: string) {
  const value = new NextRequest(request.url, { headers: request.headers }).cookies.get(name)?.value;
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}
export function grantHash(request: Request) {
  const secret = readSecret(request, boothCookie);
  if (!secret) throw new InvalidBoothGrantError('unauthorized');
  return hashSecret(secret);
}
export function clearBoothCookie(response: NextResponse) {
  response.cookies.set(boothCookie, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
export async function requireBoothGrant(request: Request) {
  const hash = grantHash(request),
    client = createPrivilegedClient();
  const { data: grant, error } = await client
    .from('booth_grants')
    .select('event_id,run_id,state,expires_at,revoked_at')
    .eq('secret_hash', hash)
    .maybeSingle();
  if (error) throw error;
  if (!grant || grant.state === 'Revoked' || grant.revoked_at)
    throw new InvalidBoothGrantError('forbidden');
  if (Date.parse(grant.expires_at) <= Date.now()) throw new InvalidBoothGrantError('grant_expired');
  return { grantHash: hash, runId: grant.run_id, eventId: grant.event_id, state: grant.state };
}
export async function requireBoothRequest(request: Request): Promise<BoothAuthority> {
  const grant = await requireBoothGrant(request);
  // Inactive proof is still needed to confirm; PauseRequested proof may still
  // report a pending attempt through its separate database-guarded operation.
  if (grant.state !== 'Active') throw new OperationError('forbidden');
  const client = createPrivilegedClient();
  const { data: run, error: runError } = await client
    .from('booth_runs')
    .select('state,event_id')
    .eq('id', grant.runId)
    .eq('event_id', grant.eventId)
    .maybeSingle();
  const { data: event, error: eventError } = await client
    .from('events')
    .select('state,deleted_at')
    .eq('id', grant.eventId)
    .maybeSingle();
  if (runError) throw runError;
  if (eventError) throw eventError;
  if (
    !run ||
    !event ||
    event.state !== 'Live' ||
    event.deleted_at ||
    ['Paused', 'Ended'].includes(run.state)
  )
    throw new InvalidBoothGrantError('forbidden');
  if (run.state !== 'Active') throw new OperationError('forbidden');
  return { grantHash: grant.grantHash, runId: grant.runId, eventId: grant.eventId };
}
