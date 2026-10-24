import 'server-only';
import type { z } from 'zod';
import type { Json } from '@/lib/supabase/database.types';
import { boothErrorResponse, requireBoothRequest } from './booth-authority';
import { operationResponse } from './responses';
import { parseOperation, requireSameOrigin } from './validation';
import { availability } from './admin-route';
import type { BoothAuthority } from './types';
export async function boothOperation<T>(
  request: Request,
  schema: z.ZodType<T>,
  run: (input: T, booth: BoothAuthority) => Promise<unknown>
) {
  try {
    requireSameOrigin(request);
    const booth = await requireBoothRequest(request);
    const input = await parseOperation(request, schema);
    return operationResponse(await run(input, booth));
  } catch (error) {
    return boothErrorResponse(error);
  }
}
export function sessionResult(data: Json) {
  const value = data as {
    session_id: string;
    state: string;
    availability: Parameters<typeof availability>[0];
  };
  return {
    sessionId: value.session_id,
    state: value.state,
    availability: availability(value.availability),
  };
}
