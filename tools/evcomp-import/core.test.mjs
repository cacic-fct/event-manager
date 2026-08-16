import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertConfig,
  createUuidV7,
  normalizeAcademicId,
  normalizeEmail,
  normalizeName,
  quoteMysqlIdentifier,
  resolvePerson,
  toSourceBoolean,
} from './core.mjs';

const person = (overrides = {}) => ({
  id: 'target-1',
  name: 'João da Silva',
  email: 'joao@unesp.br',
  secondaryEmails: [],
  academicId: '123456789',
  ...overrides,
});

test('normalizes identifiers without making names an automatic identity key', () => {
  assert.equal(normalizeEmail(' JOAO@UNESP.BR '), 'joao@unesp.br');
  assert.equal(normalizeAcademicId(' 12 345 '), '12345');
  assert.equal(normalizeName('  João   da SILVA '), 'joao da silva');
});

test('creates fct-app IDs as RFC 9562 UUIDv7 values', () => {
  const timestamp = 1_800_000_000_123;
  const id = createUuidV7(timestamp);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16), timestamp);
});

test('parses MySQL booleans without treating string zero as true', () => {
  assert.equal(toSourceBoolean(1), true);
  assert.equal(toSourceBoolean('0'), false);
  assert.throws(() => toSourceBoolean('false'), /Unexpected EvComp boolean/);
});

test('matches by academic ID when email has no match', () => {
  const result = resolvePerson(
    { academicId: '123456789', email: 'missing@example.com', name: 'Other' },
    [person(), person({ id: 'target-2', academicId: null, email: 'other@example.com' })],
  );
  assert.equal(result.status, 'matched');
  assert.equal(result.person.id, 'target-1');
  assert.equal(result.matchedBy, 'academicId');
});

test('reports conflicting email and academic ID instead of guessing', () => {
  const result = resolvePerson(
    { academicId: '123456789', email: 'other@example.com', name: 'Other' },
    [person(), person({ id: 'target-2', academicId: null, email: 'other@example.com' })],
  );
  assert.equal(result.status, 'conflict');
  assert.deepEqual(result.candidates.map((candidate) => candidate.id), ['target-1', 'target-2']);
});

test('matches primary and secondary emails case-insensitively', () => {
  const result = resolvePerson(
    { academicId: null, email: 'ALT@EXAMPLE.COM', name: 'Other' },
    [person({ academicId: null, secondaryEmails: ['alt@example.com'] })],
  );
  assert.equal(result.status, 'matched');
  assert.equal(result.matchedBy, 'email');
});

test('reports ambiguous identifiers instead of choosing a person', () => {
  const result = resolvePerson(
    { academicId: '123', email: '', name: 'Same' },
    [person({ academicId: '123' }), person({ id: 'target-2', academicId: '123' })],
  );
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates.length, 2);
});

test('uses equal names only as manual-review candidates', () => {
  const result = resolvePerson(
    { academicId: null, email: 'missing@example.com', name: 'Joao da Silva' },
    [person()],
  );
  assert.equal(result.status, 'unmatched');
  assert.deepEqual(result.nameCandidates.map((candidate) => candidate.id), ['target-1']);
});

test('validates mappings and MySQL identifiers', () => {
  assert.doesNotThrow(() =>
    assertConfig({
      eventMappings: [{ sourceEventId: 1, targetMajorEventId: '00000000-0000-7000-8000-000000000001' }],
      activityMappings: [{ sourceActivityId: 2, targetEventId: '00000000-0000-7000-8000-000000000002' }],
    }),
  );
  assert.equal(quoteMysqlIdentifier('inscrição'), '`inscrição`');
  assert.throws(() => quoteMysqlIdentifier('users; DROP TABLE users'), /Unsafe MySQL identifier/);
});
