import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { OperationError } from './types';
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
