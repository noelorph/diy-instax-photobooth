import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, type NextResponse } from 'next/server';
import { createPrivilegedClient } from './privileged-client';
import { OperationError, type BoothAuthority } from './types';
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
  if (!secret) throw new OperationError('unauthorized');
  return hashSecret(secret);
}
export function clearBoothCookie(response: NextResponse) {
  response.cookies.set(boothCookie, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
export async function requireBoothRequest(request: Request): Promise<BoothAuthority> {
  const hash = grantHash(request),
    client = createPrivilegedClient();
  const { data: grant, error } = await client
    .from('booth_grants')
    .select('event_id,run_id,state,expires_at,revoked_at')
    .eq('secret_hash', hash)
    .maybeSingle();
  if (error || !grant || grant.state !== 'Active' || grant.revoked_at)
    throw new OperationError('forbidden');
  if (Date.parse(grant.expires_at) <= Date.now()) throw new OperationError('grant_expired');
  const { data: run, error: runError } = await client
    .from('booth_runs')
    .select('state,event_id')
    .eq('id', grant.run_id)
    .eq('event_id', grant.event_id)
    .maybeSingle();
  const { data: event, error: eventError } = await client
    .from('events')
    .select('state,deleted_at')
    .eq('id', grant.event_id)
    .maybeSingle();
  if (
    runError ||
    eventError ||
    !run ||
    run.state !== 'Active' ||
    !event ||
    event.state !== 'Live' ||
    event.deleted_at
  )
    throw new OperationError('forbidden');
  return { grantHash: hash, runId: grant.run_id, eventId: grant.event_id };
}
