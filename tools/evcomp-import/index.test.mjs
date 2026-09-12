import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyOperation, buildOperations, refreshDerivedData, runImport } from './index.mjs';

test('uses text arrays for Prisma string IDs in PostgreSQL', async () => {
  const source = await readFile(new URL('./index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /::uuid\[\]/);
  assert.match(source, /id = ANY\(\$1::text\[\]\)/);
});

test('a later run retries a registration after its person is created', () => {
  const snapshot = {
    registrations: [{ sourceId: 10, sourcePersonId: 1, sourceEventId: 2, sourceActivityId: 3, active: 1 }],
    attendances: [],
    lecturers: [],
  };
  const mappings = {
    events: new Map([['2', '00000000-0000-7000-8000-000000000002']]),
    activities: new Map([['3', '00000000-0000-7000-8000-000000000003']]),
  };

  const firstRun = buildOperations(
    snapshot,
    new Map([['1', { status: 'unmatched', nameCandidates: [] }]]),
    mappings.events,
    mappings.activities,
  );
  assert.equal(firstRun.length, 0);
  assert.equal(firstRun.skippedSourceRows[0].reason, 'unmatched_person');

  const secondRun = buildOperations(
    snapshot,
    new Map([['1', { status: 'matched', person: { id: 'person-1' } }]]),
    mappings.events,
    mappings.activities,
  );
  assert.deepEqual(
    secondRun.map((operation) => operation.kind),
    ['majorEventSubscriptions', 'eventSubscriptions', 'eventSelections'],
  );
});

test('an already imported natural key is skipped on the next run', async () => {
  let exists = false;
  const target = {
    async query(sql) {
      if (sql.startsWith('SELECT 1')) return { rowCount: exists ? 1 : 0 };
      if (sql.startsWith('INSERT INTO event_subscriptions')) {
        exists = true;
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const counters = { eventSubscriptions: { pending: 0, imported: 0, skipped: 0 } };
  const operation = {
    kind: 'eventSubscriptions',
    personId: 'person-1',
    targetId: '00000000-0000-7000-8000-000000000003',
    occurredAt: new Date(),
  };

  await applyOperation(target, operation, null, counters);
  await applyOperation(target, operation, null, counters);
  assert.deepEqual(counters.eventSubscriptions, { pending: 0, imported: 1, skipped: 1 });
});

for (const testCase of [
  {
    kind: 'majorEventSubscriptions',
    operation: {
      kind: 'majorEventSubscriptions',
      personId: 'person-1',
      targetId: '00000000-0000-7000-8000-000000000001',
      occurredAt: new Date(),
    },
    idParameter: 2,
    existingRow: { subscriptionStatus: 'CONFIRMED' },
  },
  {
    kind: 'eventSubscriptions',
    operation: {
      kind: 'eventSubscriptions',
      personId: 'person-1',
      targetId: '00000000-0000-7000-8000-000000000002',
      occurredAt: new Date(),
    },
    idParameter: 2,
    existingRow: {},
  },
  {
    kind: 'eventSelections',
    operation: {
      kind: 'eventSelections',
      personId: 'person-1',
      majorEventId: '00000000-0000-7000-8000-000000000001',
      targetId: '00000000-0000-7000-8000-000000000002',
    },
    idParameter: 3,
    existingRow: {},
  },
]) {
  test(`${testCase.kind} generates one UUIDv7 and skips the same natural key on rerun`, async () => {
    let exists = false;
    let insertedParameters;
    const target = {
      async query(sql, parameters) {
        if (sql.trimStart().startsWith('SELECT')) {
          return { rowCount: exists ? 1 : 0, rows: exists ? [testCase.existingRow] : [] };
        }
        if (sql.trimStart().startsWith('INSERT')) {
          exists = true;
          insertedParameters = parameters;
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
    const counters = { [testCase.kind]: { pending: 0, imported: 0, skipped: 0 } };
    await applyOperation(target, testCase.operation, null, counters);
    await applyOperation(target, testCase.operation, null, counters);

    assert.match(
      insertedParameters[testCase.idParameter],
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.deepEqual(counters[testCase.kind], { pending: 0, imported: 1, skipped: 1 });
  });
}

test('refreshes attendance using current enum values and retains the assessment reason', async () => {
  const calls = [];
  await refreshDerivedData(
    {
      async query(sql, parameters) {
        calls.push({ sql, parameters });
      },
    },
    [{ kind: 'attendances', targetId: 'event-1' }],
  );
  const refresh = calls.find((call) => call.sql.includes('UPDATE event_attendances'));
  assert.ok(refresh);
  assert.doesNotMatch(refresh.sql, /'NON_PAYING'|'NON_SUBSCRIBED'/);
  assert.match(refresh.sql, /'NON_REGULAR'/);
  assert.match(refresh.sql, /cardinality\(event\."regularAttendancePriceTierIds"\) > 0/);
  assert.match(refresh.sql, /tier\.id=ANY\(event\."regularAttendancePriceTierIds"\)/);
  assert.match(refresh.sql, /price\."majorEventId"=event\."majorEventId"/);
  assert.match(refresh.sql, /lower\(btrim\(subscription\."paymentTier"\)\)=lower\(btrim\(tier\.name\)\)/);
  assert.match(refresh.sql, /'PRICE_TIER_NOT_ELIGIBLE'/);
  assert.match(refresh.sql, /'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED'/);
  assert.ok(
    refresh.sql.indexOf("THEN 'PRICE_TIER_NOT_ELIGIBLE'") <
      refresh.sql.indexOf("ELSE 'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED'"),
  );
  assert.match(refresh.sql, /'ACTIVITY_SUBSCRIPTION_MISSING'/);
  assert.match(refresh.sql, /"currentAssessment"=assessments.assessment::"AttendanceCurrentAssessment"/);
  assert.match(refresh.sql, /WHEN 'WAITING_RECEIPT_UPLOAD' THEN 'MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT'/);
  assert.match(refresh.sql, /WHEN 'RECEIPT_UNDER_REVIEW' THEN 'MAJOR_EVENT_PAYMENT_UNDER_REVIEW'/);
  assert.deepEqual(refresh.parameters, [['event-1'], [], []]);
});

const registrationFixture = (overrides = {}) => ({
  sourceId: 10,
  sourcePersonId: 1,
  sourceEventId: 2,
  sourceActivityId: 3,
  active: 1,
  sourceModalityId: 4,
  modalityName: 'Participação',
  appliedAmount: '19.90',
  ...overrides,
});
const resolutions = new Map([['1', { status: 'matched', person: { id: 'person-1' } }]]);
const events = new Map([['2', 'major-1']]);
const activities = new Map([['3', 'event-1']]);
const modalities = new Map([['4', { name: 'Participante', majorEventId: 'major-1' }]]);

test('preserves the mapped tier name and applied amount for confirmed registrations', () => {
  const snapshot = { registrations: [registrationFixture(), registrationFixture()], attendances: [], lecturers: [] };
  const operations = buildOperations(snapshot, resolutions, events, activities, modalities);
  assert.equal(operations.length, 3);
  assert.equal(operations[0].paymentTier, 'Participante');
  assert.equal(operations[0].amountPaid, 1990);
  const free = buildOperations(
    { ...snapshot, registrations: [registrationFixture({ appliedAmount: '0.00' })] },
    resolutions,
    events,
    activities,
    modalities,
  );
  assert.equal(free[0].amountPaid, 0);
});

test('reports unconfirmed and unmapped modality registrations without granting subscriptions', () => {
  const snapshot = {
    registrations: [registrationFixture(), registrationFixture({ sourceId: 11, active: 0 })],
    attendances: [],
    lecturers: [],
  };
  const operations = buildOperations(snapshot, resolutions, events, activities);
  assert.equal(operations.length, 0);
  assert.deepEqual(
    operations.skippedSourceRows.map((row) => row.reason),
    ['unmapped_modality', 'registration_not_confirmed'],
  );
});

test('rejects a price tier from a different target major event', () => {
  const snapshot = { registrations: [registrationFixture()], attendances: [], lecturers: [] };
  assert.throws(
    () =>
      buildOperations(
        snapshot,
        resolutions,
        events,
        activities,
        new Map([['4', { name: 'Participante', majorEventId: 'another-major' }]]),
      ),
    /does not belong/,
  );
});

test('inserts tier details and backfills old imports once, preserving conflicts for manual resolution', async () => {
  let stored;
  const target = {
    async query(sql, parameters) {
      if (sql.startsWith('SELECT')) return { rowCount: stored ? 1 : 0, rows: stored ? [stored] : [] };
      if (sql.startsWith('INSERT')) {
        assert.match(sql, /"paymentTier", "amountPaid"/);
        stored = { subscriptionStatus: 'CONFIRMED', paymentTier: parameters[5], amountPaid: parameters[6] };
      } else if (sql.startsWith('UPDATE')) {
        stored = { ...stored, paymentTier: parameters[2], amountPaid: parameters[3] };
      } else throw new Error(`Unexpected SQL: ${sql}`);
      return { rowCount: 1 };
    },
  };
  const counters = { majorEventSubscriptions: { imported: 0, updated: 0, skipped: 0 } };
  const operation = {
    kind: 'majorEventSubscriptions',
    personId: 'person-1',
    targetId: 'major-1',
    paymentTier: 'Participante',
    amountPaid: 1990,
  };
  await applyOperation(target, operation, null, counters);
  assert.deepEqual(stored, { subscriptionStatus: 'CONFIRMED', paymentTier: 'Participante', amountPaid: 1990 });
  stored.paymentTier = null;
  stored.amountPaid = null;
  await applyOperation(target, operation, null, counters);
  await applyOperation(target, operation, null, counters);
  assert.deepEqual(counters.majorEventSubscriptions, { imported: 1, updated: 1, skipped: 1 });
  for (const conflict of [{ paymentTier: 'Other' }, { amountPaid: 1000 }]) {
    stored = { subscriptionStatus: 'CONFIRMED', paymentTier: 'Participante', amountPaid: 1990, ...conflict };
    await assert.rejects(applyOperation(target, operation, null, counters), /conflict/);
  }
});

test('refreshes existing attendances when only a major-event subscription is imported', async () => {
  const calls = [];
  await refreshDerivedData(
    {
      async query(sql, parameters) {
        calls.push({ sql, parameters });
      },
    },
    [{ kind: 'majorEventSubscriptions', targetId: 'major-1', personId: 'person-1' }],
  );
  const refresh = calls.find((call) => call.sql.includes('UPDATE event_attendances'));
  assert.ok(refresh);
  assert.match(
    refresh.sql,
    /affected\."majorEventId"=event\."majorEventId" AND affected\."personId"=attendance\."personId"/,
  );
  assert.deepEqual(refresh.parameters, [[], ['major-1'], ['person-1']]);
});

test('dry run validates missing target price tiers before any writes', async () => {
  const id = '00000000-0000-7000-8000-000000000001';
  const calls = [];
  await assert.rejects(
    runImport({
      config: {
        eventMappings: [],
        activityMappings: [],
        modalityMappings: [{ sourceModalityId: 4, targetPriceTierId: id }],
      },
      snapshot: { people: [], registrations: [], attendances: [], lecturers: [] },
      target: {
        async query(sql) {
          calls.push(sql);
          return { rows: sql.includes('to_regclass') ? [{ table_name: 'external_import_records' }] : [] };
        },
      },
      apply: false,
    }),
    /Mapped target price tier IDs do not exist/,
  );
  assert.ok(calls.every((sql) => sql.startsWith('SELECT')));
});

test('apply rolls back when existing payment details conflict with the source modality', async () => {
  const majorId = '00000000-0000-7000-8000-000000000001';
  const tierId = '00000000-0000-7000-8000-000000000002';
  const calls = [];
  const target = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{ table_name: 'external_import_records' }] };
      if (sql.includes('FROM external_import_records')) return { rows: [] };
      if (sql.includes('INSERT INTO external_import_records')) return { rowCount: 1 };
      if (sql.includes('FROM people')) return { rows: [{ id: 'person-1', email: 'person@example.test' }] };
      if (sql.includes('SELECT id FROM major_events')) return { rows: [{ id: majorId }] };
      if (sql.includes('FROM events WHERE')) return { rows: [] };
      if (sql.includes('FROM price_tiers tier'))
        return { rows: [{ id: tierId, name: 'Participante', majorEventId: majorId }] };
      if (sql.includes('FROM major_event_subscriptions')) {
        assert.match(sql, /FOR UPDATE$/);
        return { rowCount: 1, rows: [{ subscriptionStatus: 'CONFIRMED', paymentTier: 'Other', amountPaid: 1000 }] };
      }
      if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  await assert.rejects(
    runImport({
      config: {
        eventMappings: [{ sourceEventId: 2, targetMajorEventId: majorId }],
        activityMappings: [],
        modalityMappings: [{ sourceModalityId: 4, targetPriceTierId: tierId }],
      },
      snapshot: {
        people: [{ sourceId: 1, email: 'person@example.test' }],
        registrations: [registrationFixture({ sourceActivityId: null })],
        attendances: [],
        lecturers: [],
      },
      target,
      apply: true,
    }),
    /conflict/,
  );
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.ok(!calls.includes('COMMIT'));
});

test('automatic dry run plans catalogs, a missing person and subscriptions without any mappings or writes', async () => {
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + 3600000);
  const calls = [];
  const report = await runImport({
    snapshot: {
      people: [{ sourceId: 1, name: 'Pessoa nova', email: 'new@example.test', academicId: 'RA-1' }],
      events: [{ sourceId: 2, name: 'Evento EvComp', startDate, endDate }],
      activities: [
        {
          sourceId: 3,
          sourceEventId: 2,
          name: 'Atividade EvComp',
          startDate,
          endDate,
          slots: 20,
          durationInMinutes: 60,
        },
      ],
      modalities: [{ sourceId: 4, sourceEventId: 2, name: 'Participante', amount: '19.90' }],
      registrations: [registrationFixture()],
      attendances: [],
      lecturers: [],
    },
    target: {
      async query(sql) {
        calls.push(sql);
        assert.ok(sql.trimStart().startsWith('SELECT'), `Dry run attempted a write: ${sql}`);
        return { rows: sql.includes('to_regclass') ? [{ table_name: 'external_import_records' }] : [] };
      },
    },
    apply: false,
  });
  assert.equal(report.catalog.majorEvents.planned, 1);
  assert.equal(report.catalog.events.planned, 1);
  assert.equal(report.catalog.priceTiers.planned, 1);
  assert.equal(report.people.planned, 1);
  assert.equal(report.people.unmatched, 0);
  assert.equal(report.operations.majorEventSubscriptions.pending, 1);
  assert.equal(report.operations.eventSubscriptions.pending, 1);
  assert.deepEqual(report.skippedSourceRows, []);
});
