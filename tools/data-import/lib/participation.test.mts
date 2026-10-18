import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeParticipationResources } from './participation.mts';

test('dedupes normalized exact person references only within the same target', () => {
  const result = dedupeParticipationResources([
    {
      kind: 'event-subscription',
      key: 'first',
      data: { eventId: 'event-1', person: { name: 'Ana Silva', email: 'ana@example.com', academicId: 'RA-1' } },
    },
    {
      kind: 'event-subscription',
      key: 'duplicate',
      data: { eventId: 'event-1', person: { name: 'ANA SILVA', email: 'ANA@example.com', academicId: 'ra-1' } },
    },
    {
      kind: 'event-subscription',
      key: 'other-target',
      data: { eventId: 'event-2', person: { name: 'Ana Silva', email: 'ana@example.com', academicId: 'RA-1' } },
    },
  ]);

  assert.deepEqual(
    result.resources.map(({ key }) => key),
    ['first', 'other-target'],
  );
  assert.equal(result.duplicateResourcesRemoved, 1);
  assert.equal(result.sameNameReferenceGroups, 0);
});

test('preserves distinct identifiers for a same-name participant group', () => {
  const result = dedupeParticipationResources([
    {
      kind: 'event-subscription',
      key: 'first',
      data: { eventId: 'event-1', person: { name: 'Ana Silva', email: 'ana@example.com', identityDocument: 'CPF-1' } },
    },
    {
      kind: 'event-subscription',
      key: 'second-person',
      data: {
        eventId: 'event-1',
        person: { name: 'ANA SILVA', email: 'other@example.com', identityDocument: 'CPF-2' },
      },
    },
  ]);

  assert.deepEqual(
    result.resources.map(({ key }) => key),
    ['first', 'second-person'],
  );
  assert.equal(result.duplicateResourcesRemoved, 0);
  assert.equal(result.sameNameReferenceGroups, 1);
});

test('rejects repeated name-only refs for a lookup name with conflicting identities', () => {
  assert.throws(
    () =>
      dedupeParticipationResources(
        [
          {
            kind: 'group-subscription',
            key: 'first',
            data: { eventGroupId: 'group-1', person: { name: 'João Silva' } },
          },
          {
            kind: 'group-subscription',
            key: 'second',
            data: { eventGroupId: 'group-1', person: { name: 'JOAO SILVA' } },
          },
        ],
        new Set(['joao silva']),
      ),
    /Repeated participation rows for ambiguous person.*Resolve the person identifiers or remove the duplicate source rows/,
  );
});
