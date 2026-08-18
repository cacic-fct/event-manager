import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyUpdates,
  buildFirestoreAttendances,
  filterExistingAttendances,
  matchAttendances,
  normalizeName,
  selectChangedAttendances,
} from './reevaluate-attendance-categories.mts';
import type {
  DatabaseClient,
} from './firestore-to-postgres.mts';
import type {
  AttendanceUpdateRow,
  FirestoreAttendanceRow,
} from './reevaluate-attendance-categories.mts';

const timestamp = (seconds: number) => ({ __datatype__: 'timestamp', value: { _seconds: seconds } });

test('applies attendance category precedence in source collection order', () => {
  const rows = buildFirestoreAttendances({
    e1: {
      name: 'Evento',
      eventStartDate: timestamp(100),
      allowSubscription: true,
      __collections__: {
        subscriptions: { u1: {} },
        attendance: { u1: {}, u2: {}, u3: {} },
        'non-subscribed-attendance': { u2: {} },
        'non-paying-attendance': { u3: {} },
      },
    },
  });
  assert.deepEqual(rows.map((row) => [row.legacyPersonId, row.category]), [
    ['u1', 'REGULAR'],
    ['u2', 'NON_SUBSCRIBED'],
    ['u3', 'NON_PAYING'],
  ]);
});

test('matches accented names and millisecond-normalized timestamps', async () => {
  assert.equal(normalizeName('João Café'), 'joao cafe');
  const sourceRows: FirestoreAttendanceRow[] = [{
    legacyEventId: 'legacy-event',
    eventName: 'João Café',
    eventStartDate: new Date(1_700_000_000_123),
    legacyPersonId: 'legacy-person',
    category: 'REGULAR',
  }];
  const db: DatabaseClient = {
    async query(sql: string) {
      if (sql.includes('FROM events')) return { rows: [{ id: 'event-1', name: 'Joao Cafe', startDate: new Date(1_700_000_000_123) }] };
      if (sql.includes('FROM people')) return { rows: [{ id: 'person-1', externalRef: 'legacy-person' }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const result = await matchAttendances(db, sourceRows);
  const [matched] = result.matched;
  assert.ok(matched);
  assert.equal(matched.eventId, 'event-1');
  assert.equal(matched.personId, 'person-1');
  assert.equal(result.unmatchedEvents.length, 0);
});

test('filters changed UNKNOWN rows and supports non-unknown override', async () => {
  const matched: AttendanceUpdateRow[] = [
    { personId: 'p1', eventId: 'e1', category: 'REGULAR' },
    { personId: 'p2', eventId: 'e2', category: 'NON_PAYING' },
    { personId: 'p3', eventId: 'e3', category: 'REGULAR' },
  ];
  const db: DatabaseClient = {
    async query(sql: string) {
      if (sql.includes('category::text')) {
        return { rows: [
          { personId: 'p1', eventId: 'e1', category: 'UNKNOWN' },
          { personId: 'p2', eventId: 'e2', category: 'REGULAR' },
          { personId: 'p3', eventId: 'e3', category: 'REGULAR' },
        ] };
      }
      return { rows: [
        { personId: 'p1', eventId: 'e1' },
        { personId: 'p2', eventId: 'e2' },
        { personId: 'p3', eventId: 'e3' },
      ] };
    },
  };
  const existing = (await filterExistingAttendances(db, matched)).existing;
  assert.deepEqual((await selectChangedAttendances(db, existing)).map((row) => row.personId), ['p1']);
  assert.deepEqual((await selectChangedAttendances(db, existing, { includeNonUnknown: true })).map((row) => row.personId), ['p1', 'p2']);
});

test('applies only category updates with parameters', async () => {
  const calls: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  const db: DatabaseClient = {
    async query(sql: string, parameters?: readonly unknown[]) {
      calls.push(parameters === undefined ? { sql } : { sql, parameters });
    },
  };
  await applyUpdates(db, [{ personId: 'p1', eventId: 'e1', category: 'REGULAR' }]);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call);
  assert.deepEqual(call.parameters, ['REGULAR', 'p1', 'e1']);
  assert.match(call.sql, /UPDATE event_attendances/);
});
