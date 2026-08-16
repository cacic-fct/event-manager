import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPayload,
  buildMajorEventPriceRows,
  coerceBool,
  mapSubscriptionStatus,
  parseFirestoreTimestamp,
  parseInteger,
  writePayload,
} from './firestore-to-postgres.mts';
import type { ImportPayload, UuidGenerator } from './firestore-to-postgres.mts';

const timestamp = (seconds: number, nanoseconds = 0) => ({
  __datatype__: 'timestamp',
  value: { _seconds: seconds, _nanoseconds: nanoseconds },
});

function fixture() {
  return {
    __collections__: {
      majorEvents: {
        m1: {
          name: 'Major Event',
          eventStartDate: timestamp(1_700_000_000),
          eventEndDate: timestamp(1_700_000_100),
          createdOn: timestamp(1_700_000_000),
          paymentInfo: {
            bankName: 'Banco',
            agency: '123',
            accountNumber: '456',
            name: 'CACiC',
            document: '00.000.000/0001-00',
          },
          price: { tiers: [{ name: 'Student', price: 10 }, { title: 'Visitor', price: '20' }] },
          __collections__: {
            subscriptions: {
              u1: {
                time: timestamp(1_700_000_010),
                payment: { status: 2, price: '10', author: 'admin' },
                subscribedToEvents: ['e1'],
              },
            },
          },
        },
      },
      events: {
        e1: {
          name: 'Opening',
          eventStartDate: timestamp(1_700_000_010),
          eventEndDate: timestamp(1_700_000_020),
          createdOn: timestamp(1_700_000_000),
          inMajorEvent: 'm1',
          eventGroup: { groupDisplayName: 'Group', mainEventID: 'e1', groupEventIDs: ['e1', 'e2'] },
          __collections__: {
            subscriptions: { u1: { time: timestamp(1_700_000_010), author: 'admin' } },
            attendance: { u1: { time: timestamp(1_700_000_030) } },
            'non-paying-attendance': { u2: { time: timestamp(1_700_000_031) } },
          },
        },
        e2: {
          name: 'Closing',
          eventStartDate: timestamp(1_700_000_040),
          eventEndDate: timestamp(1_700_000_050),
          createdOn: timestamp(1_700_000_000),
          inMajorEvent: 'missing-major',
          eventGroup: { groupDisplayName: 'Group', mainEventID: 'e1', groupEventIDs: ['e1', 'e2'] },
          __collections__: { subscriptions: { u2: { time: timestamp(1_700_000_041) } }, attendance: { u3: {} } },
        },
      },
      users: {
        u1: {
          uid: 'u1',
          fullName: 'User One',
          email: 'one@example.test',
          __collections__: {
            majorEventSubscriptions: { m1: {} },
            eventSubscriptions: { e2: { reference: { __datatype__: 'documentReference', value: 'events/e2' } } },
          },
        },
        u2: { uid: 'u2', fullName: 'User Two' },
      },
    },
  };
}

test('builds deterministic rows and preserves Firestore subscription/attendance derivation', () => {
  const payload = buildPayload(fixture(), { now: new Date('2026-01-01T00:00:00.000Z') });
  assert.equal(payload.majorEvents.length, 1);
  assert.equal(payload.paymentInfos.length, 1);
  assert.equal(payload.majorEventPrices.length, 1);
  assert.equal(payload.priceTiers.length, 2);
  assert.equal(payload.eventGroups.length, 1);
  assert.equal(payload.events.length, 2);
  assert.equal(payload.people.length, 3);
  assert.equal(payload.majorEventSubscriptions.length, 1);
  assert.equal(payload.eventGroupSubscriptions.length, 1);
  assert.equal(payload.eventSubscriptions.length, 3);
  assert.equal(payload.eventAttendances.length, 3);
  assert.equal(payload.generatedFallbackPeople, 1);
  assert.equal(payload.unknownMajorEventRefs, 1);
  assert.equal(payload.skippedUserMajorEventRefs, 0);
  assert.equal(payload.skippedUserEventRefs, 0);
  assert.equal(payload.eventAttendances.every((row) => !Object.hasOwn(row, 'category')), true);
  const [majorEvent] = payload.majorEvents;
  const [majorEventSubscription] = payload.majorEventSubscriptions;
  assert.ok(majorEvent);
  assert.ok(majorEventSubscription);
  assert.equal(majorEvent.updatedAt.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(majorEventSubscription.subscriptionStatus, 'CONFIRMED');
  assert.equal(payload.eventSubscriptions.filter((row) => row.eventGroupSubscriptionId).length, 2);
});

test('matches Python-style scalar coercions and timestamp parsing', () => {
  assert.equal(parseInteger(true), 1);
  assert.equal(parseInteger('1.9'), 1);
  assert.equal(parseInteger('not-a-number'), null);
  assert.equal(coerceBool('false'), false);
  assert.equal(coerceBool('yes'), true);
  const parsedTimestamp = parseFirestoreTimestamp(timestamp(1, 500_000_000));
  assert.ok(parsedTimestamp);
  assert.equal(parsedTimestamp.toISOString(), '1970-01-01T00:00:01.500Z');
  assert.equal(parseFirestoreTimestamp({ __datatype__: 'timestamp', value: { _seconds: 'NaN' } }), null);
  assert.equal(mapSubscriptionStatus('confirmed'), 'CONFIRMED');
  assert.equal(mapSubscriptionStatus(4), 'REJECTED_NO_SLOTS');
});

test('maps scalar and tiered prices with deterministic IDs', () => {
  const generator: UuidGenerator = { forSeed: (seed: string) => seed };
  const [single, singleTiers] = buildMajorEventPriceRows('m1', 25, generator, new Date(0));
  assert.ok(single);
  assert.equal(single.type, 'SINGLE');
  assert.deepEqual(singleTiers[0], { id: 'price-tier:m1:0:Valor único:25', priceId: 'major-event-price:m1', name: 'Valor único', value: 25 });
});

test('commits successful writes and rolls back failed writes with an injected client', async () => {
  const emptyPayload: ImportPayload = {
    majorEvents: [],
    paymentInfos: [],
    majorEventPrices: [],
    priceTiers: [],
    eventGroups: [],
    events: [],
    people: [],
    majorEventSubscriptions: [],
    eventGroupSubscriptions: [],
    eventSubscriptions: [],
    eventAttendances: [],
    unknownMajorEventRefs: 0,
    skippedUserMajorEventRefs: 0,
    skippedUserEventRefs: 0,
    generatedFallbackPeople: 0,
  };
  const successfulQueries: string[] = [];
  await writePayload({
    async query(text) {
      successfulQueries.push(text);
      return { rows: [] };
    },
  }, emptyPayload);
  assert.deepEqual(successfulQueries, ['BEGIN', 'COMMIT']);

  const failedQueries: string[] = [];
  await assert.rejects(
    writePayload({
      async query(text) {
        failedQueries.push(text);
        if (text === 'COMMIT') throw new Error('commit failed');
        return { rows: [] };
      },
    }, emptyPayload),
    /commit failed/,
  );
  assert.deepEqual(failedQueries, ['BEGIN', 'COMMIT', 'ROLLBACK']);
});
