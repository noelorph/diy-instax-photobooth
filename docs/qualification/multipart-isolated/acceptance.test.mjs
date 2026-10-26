import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertClean } from './acceptance.mjs';

test('empty public listings cannot hide residual backend metadata', () => {
  assert.throws(() => assertClean({ objects: [], sessions: [], files: [{ path: 'multiparts/opaque/metadata.json', bytes: 35 }] }), /physical files/);
});
test('cleanup requires both settled requests and empty inventories', () => {
  assert.throws(() => assertClean({ objects: [], sessions: [], files: [], pending: 1 }), /pending requests/);
  assert.throws(() => assertClean({ objects: [], sessions: [{}], files: [] }), /sessions/);
  assert.throws(() => assertClean({ objects: [{}], sessions: [], files: [] }), /objects/);
  assertClean({ objects: [], sessions: [], files: [], pending: 0 });
});
