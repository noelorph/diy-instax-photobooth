// Loaded only by browser-server.mjs. Never imported by application code.
import { existsSync } from 'node:fs';
const fetchNormally = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (
    url.origin === 'http://127.0.0.1:56321' &&
    url.pathname === '/rest/v1/events' &&
    method.toUpperCase() === 'GET' &&
    existsSync(process.env.EVENTS_READ_FAULT_FILE)
  ) {
    return Promise.resolve(
      new Response(JSON.stringify({ message: 'Test read outage' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
  return fetchNormally(input, init);
};
