import type { z } from 'zod';
import { PackageError } from './package-contract';
import { parseOperation } from './validation';
export * from './package-action-schemas';

export async function parsePackageOperation<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  try {
    return await parseOperation(request, schema);
  } catch {
    throw new PackageError('invalid_input');
  }
}
