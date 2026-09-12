import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveImportPeople } from './people.mjs';

function person(id, overrides = {}) {
  return {
    id,
    name: 'Pessoa existente',
    email: null,
    secondaryEmails: [],
    academicId: null,
    deletedAt: null,
    mergedIntoId: null,
    ...overrides,
  };
}

function targetWith(initialPeople = [], initialProvenance = []) {
  const people = new Map(initialPeople.map((item) => [item.id, { ...item }]));
  const provenance = new Map(initialProvenance.map(([sourceId, targetId]) => [String(sourceId), targetId]));
  const calls = [];

  return {
    people,
    provenance,
    calls,
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });

      if (sql.includes('FROM external_import_records')) {
        const targetId = provenance.get(String(parameters[2]));
        return { rows: targetId == null ? [] : [{ targetId }], rowCount: targetId == null ? 0 : 1 };
      }

      if (sql.startsWith('SELECT id, name, email, "secondaryEmails", "academicId", "deletedAt"')) {
        const ids = new Set(parameters[0].map(String));
        const rows = [...people.values()].filter((item) => ids.has(item.id));
        return { rows, rowCount: rows.length };
      }

      if (sql.startsWith('SELECT id, name, email, "secondaryEmails", "academicId"')) {
        const academicIds = new Set(parameters[0]);
        const emails = new Set(parameters[1]);
        const names = new Set(parameters[2]);
        const ids = new Set(parameters[3].map(String));
        const rows = [...people.values()].filter((item) => {
          const academicId = String(item.academicId ?? '')
            .replace(/\s+/g, '')
            .toUpperCase();
          const itemEmails = [item.email, ...(item.secondaryEmails ?? [])]
            .map((value) =>
              String(value ?? '')
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean);
          return (
            ids.has(item.id) ||
            academicIds.has(academicId) ||
            itemEmails.some((value) => emails.has(value)) ||
            names.has(
              String(item.name ?? '')
                .trim()
                .toLowerCase(),
            )
          );
        });
        return {
          rows: rows.filter((item) => item.deletedAt == null && item.mergedIntoId == null),
          rowCount: rows.length,
        };
      }

      if (sql.startsWith('INSERT INTO people')) {
        const [id, name, email, academicId] = parameters;
        const created = person(id, { name, email, academicId });
        people.set(id, created);
        return { rows: [created], rowCount: 1 };
      }

      if (sql.startsWith('INSERT INTO external_import_records')) {
        provenance.set(String(parameters[2]), parameters[3]);
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test('reuses an existing person by academic ID and records provenance', async () => {
  const target = targetWith([person('person-1', { name: 'Ana', email: 'ana@example.com', academicId: 'RA 001' })]);
  const result = await resolveImportPeople(
    target,
    [{ sourceId: 10, name: 'Ana', email: 'ANA@example.com', academicId: 'RA001' }],
    new Map(),
    { apply: true, sourceNamespace: 'evcomp-test' },
  );

  assert.equal(result.resolutions.get('10').status, 'matched');
  assert.equal(result.resolutions.get('10').person.id, 'person-1');
  assert.equal(result.resolutions.get('10').matchedBy, 'email+academicId');
  assert.deepEqual(result.counters, { created: 0, reused: 1, planned: 0, unresolved: 0 });
  assert.equal(target.provenance.get('10'), 'person-1');
});

test('leaves ambiguous and conflicting identifiers unresolved', async () => {
  const target = targetWith([
    person('person-1', { name: 'Ana', email: 'ana@example.com', academicId: '001' }),
    person('person-2', { name: 'Bruna', email: 'bruna@example.com', academicId: '001' }),
    person('person-3', { name: 'Caio', email: 'caio@example.com', academicId: '003' }),
  ]);
  const result = await resolveImportPeople(
    target,
    [
      { sourceId: 10, name: 'Ana', email: 'unknown@example.com', academicId: '001' },
      { sourceId: 11, name: 'Caio', email: 'bruna@example.com', academicId: '003' },
    ],
    new Map(),
    { apply: true },
  );

  assert.equal(result.resolutions.get('10').status, 'ambiguous');
  assert.equal(result.resolutions.get('11').status, 'conflict');
  assert.equal(result.counters.created, 0);
  assert.equal(result.counters.unresolved, 2);
  assert.equal(target.people.size, 3);
});

test('does not trust an email when the populated academic ID belongs to another identity', async () => {
  const target = targetWith([person('person-1', { name: 'Ana', email: 'ana@example.com', academicId: '002' })]);
  const result = await resolveImportPeople(
    target,
    [{ sourceId: 10, name: 'Ana', email: 'ana@example.com', academicId: '001' }],
    new Map(),
    { apply: true },
  );

  assert.equal(result.resolutions.get('10').status, 'conflict');
  assert.equal(result.counters.created, 0);
  assert.equal(result.counters.unresolved, 1);
});

test('creates once and reuses the evolving candidate for duplicate identities', async () => {
  const target = targetWith();
  const result = await resolveImportPeople(
    target,
    [
      { sourceId: 10, name: 'Ana', email: 'NEW@example.com', academicId: '001' },
      { sourceId: 11, name: 'Ana', email: 'new@example.com', academicId: ' 001 ' },
    ],
    new Map(),
    { apply: true },
  );

  const first = result.resolutions.get('10');
  const second = result.resolutions.get('11');
  assert.equal(first.status, 'matched');
  assert.equal(first.matchedBy, 'created');
  assert.equal(second.status, 'matched');
  assert.equal(second.person.id, first.person.id);
  assert.deepEqual(result.counters, { created: 1, reused: 1, planned: 0, unresolved: 0 });
  assert.equal(target.provenance.get('10'), first.person.id);
  assert.equal(target.provenance.get('11'), first.person.id);
});

test('plans a missing person during dry runs and reuses the provisional candidate', async () => {
  const target = targetWith();
  const result = await resolveImportPeople(
    target,
    [
      { sourceId: 10, name: 'Ana', email: 'NEW@example.com', academicId: '001' },
      { sourceId: 11, name: 'Ana', email: 'new@example.com', academicId: '001' },
    ],
    new Map(),
    { apply: false },
  );

  const first = result.resolutions.get('10');
  const second = result.resolutions.get('11');
  assert.equal(first.matchedBy, 'planned');
  assert.equal(second.person.id, first.person.id);
  assert.deepEqual(result.counters, { created: 0, reused: 1, planned: 1, unresolved: 0 });
  assert.equal(target.people.size, 0);
  assert.equal(target.provenance.size, 0);
});

test('does not create a name-only person or a person without a name', async () => {
  const target = targetWith();
  const result = await resolveImportPeople(
    target,
    [
      { sourceId: 10, name: 'Pessoa sem identificador', email: null, academicId: null },
      { sourceId: 11, name: '', email: 'new@example.com', academicId: null },
    ],
    new Map(),
    { apply: true },
  );

  assert.equal(result.resolutions.get('10').status, 'unmatched');
  assert.equal(result.resolutions.get('10').reason, 'unmatched_person');
  assert.equal(result.resolutions.get('11').reason, 'missing_name');
  assert.deepEqual(result.counters, { created: 0, reused: 0, planned: 0, unresolved: 2 });
  assert.equal(target.people.size, 0);
});

test('treats a stale provenance target as unresolved instead of creating a duplicate', async () => {
  const target = targetWith([], [['10', 'deleted-person']]);
  const result = await resolveImportPeople(
    target,
    [{ sourceId: 10, name: 'Ana', email: 'ana@example.com', academicId: '001' }],
    new Map(),
    { apply: true },
  );

  assert.equal(result.resolutions.get('10').status, 'unmatched');
  assert.equal(result.resolutions.get('10').reason, 'stale_import_mapping');
  assert.deepEqual(result.counters, { created: 0, reused: 0, planned: 0, unresolved: 1 });
  assert.equal(target.people.size, 0);
});

test('does not insert provenance twice on an idempotent rerun', async () => {
  const target = targetWith(
    [person('person-1', { name: 'Ana', email: 'ana@example.com', academicId: '001' })],
    [['10', 'person-1']],
  );
  const result = await resolveImportPeople(
    target,
    [{ sourceId: 10, name: 'Ana', email: 'ana@example.com', academicId: '001' }],
    new Map(),
    { apply: true },
  );

  assert.equal(result.resolutions.get('10').matchedBy, 'provenance');
  assert.equal(result.counters.reused, 1);
  assert.equal(target.calls.filter((call) => call.sql.startsWith('INSERT INTO external_import_records')).length, 0);
});

test('keeps an academic ID match when a later source email differs', async () => {
  const target = targetWith([person('person-1', { name: 'Ana', email: 'old@example.com', academicId: '001' })]);
  const sourcePerson = { sourceId: 10, name: 'Ana', email: 'new@example.com', academicId: '001' };
  const first = await resolveImportPeople(target, [sourcePerson], new Map(), { apply: true });
  const second = await resolveImportPeople(target, [sourcePerson], new Map(), { apply: true });

  assert.equal(first.resolutions.get('10').matchedBy, 'academicId');
  assert.equal(second.resolutions.get('10').matchedBy, 'provenance');
  assert.equal(second.resolutions.get('10').person.id, 'person-1');
  assert.equal(target.calls.filter((call) => call.sql.startsWith('INSERT INTO external_import_records')).length, 1);
});
