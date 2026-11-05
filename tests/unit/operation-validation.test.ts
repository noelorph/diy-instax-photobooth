// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { parseOperation, requireSameOrigin } from '@/lib/operations/validation';
import { packageActionSchemas } from '@/lib/operations/package-action-schemas';
import { operationResponse, operationErrorResponse } from '@/lib/operations/responses';
const key = '11111111-1111-4111-8111-111111111111';
const schema = packageActionSchemas.complete;
const request = (body: unknown) =>
  new Request('https://booth.test/api/op', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://booth.test' },
    body: JSON.stringify(body),
  });
describe('operation input boundary', () => {
  it('rejects a revision outside the database integer range', async () => {
    await expect(
      parseOperation(
        request({
          operationId: key,
          expectedRevision: 2147483648,
          readinessWindowId: key,
          printerId: 'simulator',
          connectionGeneration: 1,
        }),
        packageActionSchemas.start
      )
    ).rejects.toMatchObject({ code: 'validation_error' });
  });
  it('accepts only the exact operation shape', async () => {
    expect(
      await parseOperation(request({ operationId: key, expectedRevision: 1 }), schema)
    ).toEqual({ operationId: key, expectedRevision: 1 });
  });
  it.each([
    { operationKey: key, expectedRevision: 1 },
    { operationId: 'bad', expectedRevision: 1 },
    { operationId: key, expectedRevision: 0 },
    { operationId: key, expectedRevision: 1, photo: 'data:image/jpeg;base64,secret' },
    { operationId: key, expectedRevision: 1, adminUserId: key },
  ])('rejects invalid or additional fields', async (body) => {
    await expect(parseOperation(request(body), schema)).rejects.toMatchObject({
      code: 'validation_error',
    });
  });
  it('rejects malformed JSON and unsupported body types without echoing input', async () => {
    for (const body of ['{', '"data:image/jpeg;base64,secret"']) {
      await expect(
        parseOperation(
          new Request('https://booth.test', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          }),
          schema
        )
      ).rejects.toMatchObject({ code: 'validation_error' });
    }
  });
  it('rejects missing and foreign origins', () => {
    for (const origin of ['', 'https://evil.test'])
      expect(() =>
        requireSameOrigin(new Request('https://booth.test/api/op', { headers: { origin } }))
      ).toThrow();
    expect(() => requireSameOrigin(request({}))).not.toThrow();
  });
  it.each([
    ['unauthorized', 401],
    ['forbidden', 403],
    ['grant_expired', 401],
    ['validation_error', 400],
    ['state_conflict', 409],
    ['pending_attempt', 409],
    ['allowance_exhausted', 409],
    ['stock_exhausted', 409],
    ['printer_busy', 409],
    ['idempotency_conflict', 409],
    ['invalid_evidence', 400],
  ])('maps %s to a private stable error', async (code, status) => {
    const response = operationErrorResponse({ message: code });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(response.headers.get('cache-control')).toContain('private, no-store');
  });
  it('never returns unknown database diagnostics', async () => {
    const response = operationErrorResponse({ message: 'secret database relation' });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'operation_unavailable' });
    expect(operationResponse({ state: 'Prepared' }).headers.get('cache-control')).toContain(
      'private, no-store'
    );
  });
});
it('uses a validated configured origin despite an internal runtime hostname, and rejects cross-site', () => {
  vi.stubEnv('ADMIN_AUTH_ORIGIN', 'http://127.0.0.1:1439');
  try {
    const request = (origin: string, site = 'same-origin') =>
      new Request('http://localhost:1439/api/op', { headers: { origin, 'sec-fetch-site': site } });
    expect(() => requireSameOrigin(request('http://127.0.0.1:1439'))).not.toThrow();
    expect(() => requireSameOrigin(request('http://127.0.0.1:1439', 'cross-site'))).toThrow();
    expect(() => requireSameOrigin(request('http://localhost:1439'))).toThrow();
    for (const value of [
      'not a URL',
      'https://example.test/path',
      'https://user:pass@example.test',
      'https://example.test?x=y',
    ]) {
      vi.stubEnv('ADMIN_AUTH_ORIGIN', value);
      expect(() => requireSameOrigin(request('http://127.0.0.1:1439'))).toThrow();
    }
  } finally {
    vi.unstubAllEnvs();
  }
});
