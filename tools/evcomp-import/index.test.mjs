import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyOperation, buildOperations, refreshDerivedData } from './index.mjs';

test('uses text arrays for Prisma string IDs in PostgreSQL', async () => {
  const source = await readFile(new URL('./index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /::uuid\[\]/);
  assert.match(source, /id = ANY\(\$4::text\[\]\)/);
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
  await refreshDerivedData({ async query(sql, parameters) { calls.push({ sql, parameters }); } }, [
    { kind: 'attendances', targetId: 'event-1' },
  ]);
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
      refresh.sql.indexOf("THEN 'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED'"),
  );
  assert.match(refresh.sql, /'ACTIVITY_SUBSCRIPTION_MISSING'/);
  assert.match(refresh.sql, /"currentAssessment"=assessments.assessment::"AttendanceCurrentAssessment"/);
  assert.deepEqual(refresh.parameters, [['event-1']]);
});
