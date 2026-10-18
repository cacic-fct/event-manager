import assert from 'node:assert/strict';
import test from 'node:test';
import { createUuidV5 } from './ids.mts';

test('matches Python UUIDv5 values used by the Firestore importer', () => {
  assert.equal(createUuidV5('person:u1'), '26f7553a-5c50-517f-ab81-2ff78d19af20');
  assert.equal(createUuidV5('event:e1'), 'bf580800-abae-58e1-8538-98315847f4df');
});
