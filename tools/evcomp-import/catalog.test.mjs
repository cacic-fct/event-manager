import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCatalog } from './catalog.mjs';

const fixtureAnchor = new Date(Date.now());
fixtureAnchor.setUTCHours(0, 0, 0, 0);
const fixtureDate = (daysFromAnchor) => {
  const date = new Date(fixtureAnchor);
  date.setUTCDate(date.getUTCDate() + daysFromAnchor);
  return date.toISOString().slice(0, 10);
};

const snapshot = (overrides = {}) => ({
  events: [
    {
      sourceId: 10,
      name: 'EvComp event',
      description: 'Description from EvComp',
      startDate: fixtureDate(30),
      endDate: fixtureDate(31),
      subscriptionStartDate: fixtureDate(1),
      subscriptionEndDate: fixtureDate(29),
      link: 'https://evcomp.example/event/10',
    },
  ],
  activities: [
    {
      sourceId: 20,
      sourceEventId: 10,
      name: 'EvComp activity',
      description: 'Activity description',
      startDate: fixtureDate(30),
      endDate: fixtureDate(30),
      location: 'Room A',
      slots: 25,
      durationInMinutes: 90,
      lecturerDurationInMinutes: 60,
    },
  ],
  modalities: [{ sourceId: 30, sourceEventId: 10, name: 'Student', amount: '19.90' }],
  ...overrides,
});

function memoryTarget() {
  const state = {
    majorEvents: new Map(),
    events: new Map(),
    prices: new Map(),
    tiers: new Map(),
    provenance: new Map(),
  };
  const calls = [];
  const target = {
    state,
    calls,
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes('SELECT "targetId" FROM external_import_records')) {
        const key = provenanceKey(parameters);
        const targetId = state.provenance.get(key);
        return { rows: targetId ? [{ targetId }] : [] };
      }
      if (sql.startsWith('INSERT INTO external_import_records')) {
        state.provenance.set(provenanceKey(parameters), parameters[3]);
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('SELECT id, "deletedAt" FROM major_events')) {
        const row = state.majorEvents.get(String(parameters[0]));
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('SELECT id, "majorEventId", "deletedAt" FROM events')) {
        const row = state.events.get(String(parameters[0]));
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('SELECT price.id, price."majorEventId", major."deletedAt"')) {
        const row = state.prices.get(String(parameters[0]));
        const major = row ? state.majorEvents.get(String(row.majorEventId)) : null;
        return {
          rows: row
            ? [{ id: row.id, majorEventId: row.majorEventId, majorEventDeletedAt: major?.deletedAt ?? null }]
            : [],
        };
      }
      if (sql.includes('SELECT id, "majorEventId"') && sql.includes('FROM major_event_prices')) {
        const row = [...state.prices.values()].find((price) => String(price.majorEventId) === String(parameters[0]));
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('SELECT tier.id, tier.name, price."majorEventId"')) {
        const tier = state.tiers.get(String(parameters[0]));
        const price = tier ? state.prices.get(String(tier.priceId)) : null;
        const major = price ? state.majorEvents.get(String(price.majorEventId)) : null;
        return {
          rows:
            tier && price
              ? [
                  {
                    id: tier.id,
                    name: tier.name,
                    majorEventId: price.majorEventId,
                    majorEventDeletedAt: major?.deletedAt ?? null,
                  },
                ]
              : [],
        };
      }
      if (sql.startsWith('INSERT INTO major_events')) {
        const [
          id,
          name,
          startDate,
          endDate,
          description,
          subscriptionStartDate,
          subscriptionEndDate,
          buttonLink,
          isPaymentRequired,
          actorId,
        ] = parameters;
        state.majorEvents.set(String(id), {
          id: String(id),
          name,
          startDate,
          endDate,
          description,
          subscriptionStartDate,
          subscriptionEndDate,
          buttonLink,
          isPaymentRequired,
          createdById: actorId,
          deletedAt: null,
        });
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('INSERT INTO events')) {
        const [
          id,
          name,
          creditMinutes,
          startDate,
          endDate,
          description,
          locationDescription,
          majorEventId,
          subscriptionStartDate,
          subscriptionEndDate,
          slots,
          actorId,
        ] = parameters;
        state.events.set(String(id), {
          id: String(id),
          name,
          creditMinutes,
          startDate,
          endDate,
          description,
          locationDescription,
          majorEventId,
          allowSubscription: true,
          subscriptionStartDate,
          subscriptionEndDate,
          slots,
          slotsAvailable: slots,
          shouldCollectAttendance: true,
          createdById: actorId,
          deletedAt: null,
        });
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('INSERT INTO major_event_prices')) {
        const [id, majorEventId] = parameters;
        state.prices.set(String(id), { id: String(id), majorEventId: String(majorEventId) });
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('INSERT INTO price_tiers')) {
        const [id, priceId, name, value] = parameters;
        state.tiers.set(String(id), { id: String(id), priceId: String(priceId), name, value });
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return target;
}

function provenanceKey(parameters) {
  return parameters.slice(0, 3).map(String).join('\0');
}

test('creates a catalog once and reuses every provenance mapping on rerun', async () => {
  const target = memoryTarget();
  const first = await prepareCatalog(target, snapshot(), {
    apply: true,
    sourceNamespace: 'evcomp-main',
    actorId: 'actor-1',
  });
  const firstIds = {
    event: first.eventMappings.get('10'),
    activity: first.activityMappings.get('20'),
    modality: first.modalityMappings.get('30').id,
  };
  assert.deepEqual(first.counters, {
    majorEvents: { created: 1, reused: 0, planned: 0 },
    events: { created: 1, reused: 0, planned: 0 },
    prices: { created: 1, reused: 0, planned: 0 },
    priceTiers: { created: 1, reused: 0, planned: 0 },
  });

  const catalogInsertCount = () =>
    target.calls.filter(({ sql }) => /^INSERT INTO (?:major_events|events|major_event_prices|price_tiers)/.test(sql))
      .length;
  assert.equal(catalogInsertCount(), 4);

  const second = await prepareCatalog(target, snapshot(), {
    apply: true,
    sourceNamespace: 'evcomp-main',
    actorId: 'actor-2',
  });
  assert.deepEqual(
    {
      event: second.eventMappings.get('10'),
      activity: second.activityMappings.get('20'),
      modality: second.modalityMappings.get('30').id,
    },
    firstIds,
  );
  assert.equal(second.modalityMappings.get('30').name, 'Student');
  assert.deepEqual(second.counters, {
    majorEvents: { created: 0, reused: 1, planned: 0 },
    events: { created: 0, reused: 1, planned: 0 },
    prices: { created: 0, reused: 1, planned: 0 },
    priceTiers: { created: 0, reused: 1, planned: 0 },
  });
  assert.equal(catalogInsertCount(), 4);
});

test('dry-run allocates provisional mappings without writes', async () => {
  const target = memoryTarget();
  const result = await prepareCatalog(target, snapshot(), { sourceNamespace: 'evcomp-main' });

  assert.match(result.eventMappings.get('10'), /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(
    result.activityMappings.get('20'),
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(result.modalityMappings.get('30').majorEventId, result.eventMappings.get('10'));
  assert.equal(
    target.calls.some(({ sql }) => /^INSERT/.test(sql)),
    false,
  );
  assert.deepEqual(result.counters.majorEvents, { created: 0, reused: 0, planned: 1 });
  assert.deepEqual(result.counters.events, { created: 0, reused: 0, planned: 1 });
  assert.deepEqual(result.counters.prices, { created: 0, reused: 0, planned: 1 });
  assert.deepEqual(result.counters.priceTiers, { created: 0, reused: 0, planned: 1 });
});

test('maps activity fields and decimal reais to cents', async () => {
  const target = memoryTarget();
  const result = await prepareCatalog(target, snapshot(), { apply: true });
  const majorEvent = target.state.majorEvents.get(result.eventMappings.get('10'));
  const activity = target.state.events.get(result.activityMappings.get('20'));
  const tier = target.state.tiers.get(result.modalityMappings.get('30').id);

  assert.equal(majorEvent.buttonLink, 'https://evcomp.example/event/10');
  assert.equal(majorEvent.isPaymentRequired, true);
  assert.equal(activity.creditMinutes, 90);
  assert.equal(activity.locationDescription, 'Room A');
  assert.equal(activity.allowSubscription, true);
  assert.equal(activity.slots, 25);
  assert.equal(activity.slotsAvailable, 25);
  assert.equal(tier.value, 1990);
  assert.equal(result.modalityMappings.get('30').majorEventId, result.eventMappings.get('10'));
  assert.equal(target.calls.filter(({ sql }) => sql.startsWith('INSERT INTO events'))[0].sql.includes("'OTHER'"), true);
  assert.equal(target.calls.filter(({ sql }) => sql.startsWith('INSERT INTO events'))[0].sql.includes("'DRAFT'"), true);
});

test('keeps the current target tier name when source metadata changes', async () => {
  const target = memoryTarget();
  await prepareCatalog(target, snapshot(), { apply: true, sourceNamespace: 'evcomp-main' });
  const rerun = await prepareCatalog(
    target,
    snapshot({ modalities: [{ sourceId: 30, sourceEventId: 10, name: 'Renamed in source', amount: '999.99' }] }),
    { apply: true, sourceNamespace: 'evcomp-main' },
  );

  assert.equal(rerun.modalityMappings.get('30').name, 'Student');
  assert.equal(target.state.tiers.get(rerun.modalityMappings.get('30').id).value, 1990);
  assert.equal(target.calls.filter(({ sql }) => sql.startsWith('UPDATE')).length, 0);
});

test('fails when provenance points to a missing target instead of recreating it', async () => {
  const target = memoryTarget();
  target.state.provenance.set('evcomp-main\0majorEvent\0' + '10', 'deleted-major');

  await assert.rejects(
    prepareCatalog(target, snapshot(), { apply: true, sourceNamespace: 'evcomp-main' }),
    /Imported major event 10 provenance points to missing or deleted target deleted-major/,
  );
  assert.equal(
    target.calls.some(({ sql }) => /^INSERT/.test(sql)),
    false,
  );
});

test('rejects activities and modalities whose source parent is absent', async () => {
  await assert.rejects(
    prepareCatalog(memoryTarget(), snapshot({ activities: [{ ...snapshot().activities[0], sourceEventId: 99 }] })),
    /EvComp activity 20 references unknown event 99/,
  );
  await assert.rejects(
    prepareCatalog(memoryTarget(), snapshot({ modalities: [{ ...snapshot().modalities[0], sourceEventId: 99 }] })),
    /EvComp modality 30 references unknown event 99/,
  );
});

test('rejects duplicate source IDs before allocating or writing catalog rows', async () => {
  const target = memoryTarget();
  const duplicate = snapshot({ events: [snapshot().events[0], { ...snapshot().events[0], name: 'Duplicate' }] });
  await assert.rejects(prepareCatalog(target, duplicate, { apply: true }), /Duplicate EvComp events source ID: 10/);
  assert.equal(target.calls.length, 0);
});
