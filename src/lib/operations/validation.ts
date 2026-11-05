import { z } from 'zod';
import { OperationError } from './types';
import { recoveryCallbackUrl } from '@/features/admin/auth/config';
export function requireSameOrigin(request: Request) {
  let expectedOrigin: string;
  try {
    // Next may construct an internal localhost URL behind the public origin.
    // Reuse the deployment-origin validator; never trust forwarded headers.
    expectedOrigin =
      process.env.ADMIN_AUTH_ORIGIN !== undefined
        ? new URL(recoveryCallbackUrl()).origin
        : new URL(request.url).origin;
  } catch {
    throw new OperationError('forbidden');
  }
  if (
    request.headers.get('origin') !== expectedOrigin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new OperationError('forbidden');
}
export function operationId(value: string) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new OperationError('validation_error');
  return parsed.data;
}
export async function parseOperation<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new OperationError('validation_error');
  // Bound reads even when a caller omits or lies about Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new OperationError('validation_error');
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) {
        await reader.cancel();
        throw new OperationError('validation_error');
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = schema.safeParse(body);
    if (!result.success) throw new OperationError('validation_error');
    return result.data;
  } catch {
    throw new OperationError('validation_error');
  }
}
