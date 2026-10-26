import assert from 'node:assert/strict';

export function assertClean({ objects, sessions, files, pending = 0 }) {
  assert.equal(pending, 0, 'pending requests');
  assert.equal(objects.length, 0, 'objects remain');
  assert.equal(sessions.length, 0, 'sessions remain');
  assert.equal(files.length, 0, 'physical files remain');
}
