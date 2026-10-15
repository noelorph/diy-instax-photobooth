import 'server-only';

// A deployment chooses one approved application origin. Never derive it from
// Host/Origin headers, search parameters, form fields, or a redirect argument.
export function recoveryCallbackUrl() {
  const configured = process.env.ADMIN_AUTH_ORIGIN;
  if (!configured) throw new Error('Admin Auth origin is not configured.');
  const origin = new URL(configured);
  const local = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';
  if (
    (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('Admin Auth origin must be an approved application origin.');
  }
  return new URL('/auth/callback', origin.origin).href;
}
