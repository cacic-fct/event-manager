import assert from 'node:assert/strict';
import test from 'node:test';
import { createTransferDocuments } from './lib/transfer.mts';
import {
  buildPayload,
  buildMajorEventPriceRows,
  coerceBool,
  inferIsPaymentRequired,
  mapSubscriptionStatus,
  parseFirestoreTimestamp,
  parseInteger,
  normalizePhone,
  buildTransferResources,
  parseArgs,
  toCents,
} from './firestore-to-json.mts';
import type { UuidGenerator } from './firestore-to-json.mts';

const now = new Date();
const fixtureSeconds = Math.floor(now.getTime() / 1000);

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
          eventStartDate: timestamp(fixtureSeconds),
          eventEndDate: timestamp(fixtureSeconds + 100),
          createdOn: timestamp(fixtureSeconds),
          paymentInfo: {
            bankName: 'Banco',
            agency: '123',
            accountNumber: '456',
            name: 'CACiC',
            document: '00.000.000/0001-00',
          },
          price: {
            tiers: [
              { name: 'Student', price: 10 },
              { title: 'Visitor', price: '20' },
            ],
          },
          __collections__: {
            subscriptions: {
              u1: {
                time: timestamp(fixtureSeconds + 10),
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
          eventStartDate: timestamp(fixtureSeconds + 10),
          eventEndDate: timestamp(fixtureSeconds + 20),
          createdOn: timestamp(fixtureSeconds),
          inMajorEvent: 'm1',
          location: { lat: '-22.1211', lon: -51.4086, description: 'FCT/Unesp' },
          eventGroup: { groupDisplayName: 'Group', mainEventID: 'e1', groupEventIDs: ['e1', 'e2'] },
          __collections__: {
            subscriptions: { u1: { time: timestamp(fixtureSeconds + 10), author: 'admin' } },
            attendance: { u1: { time: timestamp(fixtureSeconds + 30) } },
            'non-paying-attendance': { u2: { time: timestamp(fixtureSeconds + 31) } },
          },
        },
        e2: {
          name: 'Closing',
          eventStartDate: timestamp(fixtureSeconds + 40),
          eventEndDate: timestamp(fixtureSeconds + 50),
          createdOn: timestamp(fixtureSeconds),
          inMajorEvent: 'missing-major',
          eventGroup: { groupDisplayName: 'Group', mainEventID: 'e1', groupEventIDs: ['e1', 'e2'] },
          __collections__: { subscriptions: { u2: { time: timestamp(fixtureSeconds + 41) } }, attendance: { u3: {} } },
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
  const payload = buildPayload(fixture(), { now: now });
  assert.equal(payload.majorEvents.length, 1);
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
  assert.equal(
    payload.eventAttendances.every((row) => !Object.hasOwn(row, 'category')),
    true,
  );
  const [majorEvent] = payload.majorEvents;
  const [majorEventSubscription] = payload.majorEventSubscriptions;
  assert.ok(majorEvent);
  assert.ok(majorEventSubscription);
  assert.equal(majorEvent.updatedAt.toISOString(), now.toISOString());
  assert.equal(majorEventSubscription.subscriptionStatus, 'CONFIRMED');
  assert.equal(payload.eventSubscriptions.filter((row) => row.eventGroupSubscriptionId).length, 2);
  assert.deepEqual(
    payload.events.map(({ latitude, longitude, locationDescription }) => ({
      latitude,
      longitude,
      locationDescription,
    })),
    [
      { latitude: -22.1211, longitude: -51.4086, locationDescription: 'FCT/Unesp' },
      { latitude: null, longitude: null, locationDescription: null },
    ],
  );
});

test('rejects Firestore coordinates that cannot become WGS 84 points', () => {
  const input = fixture();
  input.__collections__.events.e1.location.lat = '-91';
  assert.throws(() => buildPayload(input, { now: now }), /event e1 has a latitude outside/);
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
  assert.deepEqual(singleTiers[0], {
    id: 'price-tier:m1:0',
    priceId: 'major-event-price:m1',
    name: 'Valor único',
    value: 2500,
  });
});

test('exports only current JSON fields and participant identifiers', () => {
  const result = buildTransferResources(buildPayload(fixture()));
  const documents = createTransferDocuments(result.resources);
  assert.ok(documents.length);
  const subscription = result.resources.find((row) => row.kind === 'major-event-subscription');
  assert.ok(subscription);
  assert.equal(subscription.data.amountPaid, 1000);
  assert.deepEqual(subscription.data.person, { name: 'User One', email: 'one@example.test' });
  assert.equal(subscription.id, undefined);
  assert.ok(subscription.key);
  assert.equal((subscription.data.selectedEventIds as string[]).length, 1);
  const attendance = result.resources.filter((row) => row.kind === 'event-attendance');
  assert.equal(attendance.length, 2);
  assert.ok(attendance.every((row) => row.data.status === 'PRESENT'));
  assert.doesNotMatch(
    JSON.stringify(result.resources),
    /onlineAttendanceCode|bankName|externalRef|createdById|Legacy Person/,
  );
  assert.ok((result.report.issues as unknown[]).length);
});

test('converts fractional BRL values without truncating cents', () => {
  assert.equal(toCents('25.99'), 2599);
  assert.equal(toCents('25,90'), 2590);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(null), null);
  assert.equal(toCents('  '), null);
  assert.throws(() => toCents('21474836.48'), /integer range/);
  assert.throws(() => toCents('-1'), /Invalid BRL/);
  assert.throws(() => toCents('1.001'), /Invalid BRL/);
});

test('CLI accepts only source and JSON output options', () => {
  assert.deepEqual(parseArgs(['--input=source.json', '--output', 'export']), {
    input: 'source.json',
    output: 'export',
    help: false,
  });
  assert.throws(() => parseArgs(['--database-url', 'unused']), /Unknown option/);
  assert.throws(() => parseArgs(['--dry-run']), /Unknown option/);
  assert.throws(() => parseArgs(['--output=']), /requires a value/);
});

test('retains email-only references without inventing names', () => {
  const input = fixture();
  input.__collections__.users.u1.fullName = '';
  const result = buildTransferResources(buildPayload(input));
  const subscription = result.resources.find((row) => row.kind === 'major-event-subscription');
  assert.deepEqual(subscription?.data.person, { email: 'one@example.test' });
  assert.ok(
    (result.report.issues as Array<{ reason: string }>).some((issue) => issue.reason === 'missing_source_person_name'),
  );
});

test('fractional prices require payment and tier identities survive edits', () => {
  assert.equal(inferIsPaymentRequired({}, 0.5), true);
  assert.equal(inferIsPaymentRequired({}, { tiers: [{ price: '0.50' }] }), true);
  assert.equal(inferIsPaymentRequired({}, { single: 0, tiers: [{ price: '0.50' }] }), true);
  const generator: UuidGenerator = { forSeed: (seed) => seed };
  const [, first] = buildMajorEventPriceRows('major', { tiers: [{ name: 'Student', price: 10 }] }, generator, now);
  const [, edited] = buildMajorEventPriceRows('major', { tiers: [{ name: 'Renamed', price: 20 }] }, generator, now);
  assert.equal(first[0]?.id, edited[0]?.id);
});

test('uses only the major subscription source selections, and separates implicit child writes', () => {
  const input = fixture();
  input.__collections__.majorEvents.m1.__collections__.subscriptions.u1.subscribedToEvents = [];
  const result = buildTransferResources(buildPayload(input));
  assert.deepEqual(result.resources.find((row) => row.kind === 'major-event-subscription')?.data.selectedEventIds, []);
  const documents = createTransferDocuments(result.resources);
  for (const file of documents) {
    const kinds = new Set(file.resources.map((row) => row.kind));
    if (kinds.has('event-subscription')) {
      assert.equal(kinds.has('major-event-subscription'), false);
      assert.equal(kinds.has('group-subscription'), false);
    }
  }
});

test('preserves international phone country codes and normalizes local Brazilian numbers', () => {
  assert.equal(normalizePhone('+1 202 555 0123'), '+12025550123');
  assert.equal(normalizePhone('0012025550123'), '+12025550123');
  assert.equal(normalizePhone('(11) 99999-1234'), '+5511999991234');
  assert.equal(normalizePhone('+1234567890123456'), null);
});
