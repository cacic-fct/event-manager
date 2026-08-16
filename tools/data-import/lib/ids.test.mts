import assert from 'node:assert/strict';
import test from 'node:test';
import { createUuidV5, createUuidV7 } from './ids.mts';

test('matches Python UUIDv5 values used by the Firestore importer', () => {
  assert.equal(createUuidV5('person:u1'), '26f7553a-5c50-517f-ab81-2ff78d19af20');
  assert.equal(createUuidV5('event:e1'), 'bf580800-abae-58e1-8538-98315847f4df');
});

test('creates UUIDv7 with the requested timestamp', () => {
  const id = createUuidV7(1_800_000_000_123);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16), 1_800_000_000_123);
});
