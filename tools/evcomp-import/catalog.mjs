import { createUuidV7, toAmountInCents } from './core.mjs';
import { getImportedTarget, recordImportedTarget } from './provenance.mjs';

const entityTypes = [
  ['majorEvents', 'majorEvent'],
  ['events', 'event'],
  ['prices', 'price'],
  ['priceTiers', 'priceTier'],
];

export async function prepareCatalog(
  target,
  snapshot,
  { apply = false, sourceNamespace = 'evcomp', actorId = null } = {},
) {
  if (!target || typeof target.query !== 'function') {
    throw new Error('Catalog preparation requires a target with a query method.');
  }
  const namespace = requireNamespace(sourceNamespace);
  const source = validateSnapshot(snapshot);
  const counters = emptyCounters();
  const eventMappings = new Map();
  const activityMappings = new Map();
  const modalityMappings = new Map();
  const eventsById = uniqueRows(source.events, 'events');
  const activitiesById = uniqueRows(source.activities, 'activities');
  const modalitiesById = uniqueRows(source.modalities, 'modalities');

  validateActivityParents(activitiesById, eventsById);
  validateModalityParents(modalitiesById, eventsById);

  const modalitiesByEvent = groupBySourceEvent(modalitiesById);
  for (const sourceEvent of eventsById) {
    const sourceEventId = sourceKey(sourceEvent.sourceId, 'event');
    const targetMajorEventId = await prepareMajorEvent(
      target,
      sourceEvent,
      modalitiesByEvent.get(sourceEventId) ?? [],
      namespace,
      actorId,
      apply,
      counters,
    );
    eventMappings.set(sourceEventId, targetMajorEventId);
  }

  for (const sourceActivity of activitiesById) {
    const sourceActivityId = sourceKey(sourceActivity.sourceId, 'activity');
    const sourceEventId = sourceKey(sourceActivity.sourceEventId, 'activity parent');
    const majorEventId = eventMappings.get(sourceEventId);
    if (!majorEventId) {
      throw new Error(`EvComp activity ${sourceActivityId} has no mapped source event ${sourceEventId}.`);
    }
    const targetEventId = await prepareActivity(
      target,
      sourceActivity,
      majorEventId,
      eventsById.find((item) => String(item.sourceId) === sourceEventId),
      namespace,
      actorId,
      apply,
      counters,
    );
    activityMappings.set(sourceActivityId, targetEventId);
  }

  const pricesByMajorEvent = new Map();
  for (const sourceModality of modalitiesById) {
    const sourceModalityId = sourceKey(sourceModality.sourceId, 'modality');
    const sourceEventId = sourceKey(sourceModality.sourceEventId, 'modality parent');
    const majorEventId = eventMappings.get(sourceEventId);
    if (!majorEventId) {
      throw new Error(`EvComp modality ${sourceModalityId} has no mapped source event ${sourceEventId}.`);
    }
    let price = pricesByMajorEvent.get(majorEventId);
    if (!price) {
      price = await preparePrice(target, sourceEventId, majorEventId, namespace, apply, counters);
      pricesByMajorEvent.set(majorEventId, price);
    }
    const tier = await preparePriceTier(target, sourceModality, price, namespace, apply, counters);
    modalityMappings.set(sourceModalityId, tier);
  }

  return { eventMappings, activityMappings, modalityMappings, counters };
}

async function prepareMajorEvent(target, sourceEvent, modalities, sourceNamespace, actorId, apply, counters) {
  const sourceId = sourceKey(sourceEvent.sourceId, 'event');
  const importedTargetId = await getImportedTarget(target, sourceNamespace, 'majorEvent', sourceId);
  if (importedTargetId) {
    await requireActiveMajorEvent(target, importedTargetId, sourceId);
    counters.majorEvents.reused += 1;
    return String(importedTargetId);
  }

  const targetId = createUuidV7();
  const startDate = requiredDate(sourceEvent.startDate, `EvComp event ${sourceId} startDate`);
  const endDate = requiredDate(sourceEvent.endDate, `EvComp event ${sourceId} endDate`);
  const subscriptionStartDate = optionalDate(
    sourceEvent.subscriptionStartDate,
    `EvComp event ${sourceId} subscriptionStartDate`,
  );
  const subscriptionEndDate = optionalDate(
    sourceEvent.subscriptionEndDate,
    `EvComp event ${sourceId} subscriptionEndDate`,
  );
  assertDateOrder(startDate, endDate, `EvComp event ${sourceId}`);
  if (subscriptionStartDate && subscriptionEndDate) {
    assertDateOrder(subscriptionStartDate, subscriptionEndDate, `EvComp event ${sourceId} subscription window`);
  }
  const description = optionalText(sourceEvent.description);
  const name = requiredText(sourceEvent.name, `EvComp event ${sourceId} name`);
  const link = optionalText(sourceEvent.link);
  const isPaymentRequired = modalities.some((modality) => {
    const amount = toAmountInCents(modality.amount);
    return amount > 0;
  });

  if (apply) {
    await target.query(
      `INSERT INTO major_events
        (id, name, "startDate", "endDate", description, "subscriptionStartDate", "subscriptionEndDate",
         "buttonLink", "isPaymentRequired", "publicationState", "createdById", "updatedAt", "updatedById")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10,NOW(),$10)`,
      [
        targetId,
        name,
        startDate,
        endDate,
        description,
        subscriptionStartDate,
        subscriptionEndDate,
        link,
        isPaymentRequired,
        actorId,
      ],
    );
    await recordImportedTarget(target, sourceNamespace, 'majorEvent', sourceId, targetId);
    counters.majorEvents.created += 1;
  } else {
    counters.majorEvents.planned += 1;
  }
  return targetId;
}

async function prepareActivity(
  target,
  sourceActivity,
  majorEventId,
  sourceEvent,
  sourceNamespace,
  actorId,
  apply,
  counters,
) {
  const sourceId = sourceKey(sourceActivity.sourceId, 'activity');
  const importedTargetId = await getImportedTarget(target, sourceNamespace, 'event', sourceId);
  if (importedTargetId) {
    await requireActiveActivity(target, importedTargetId, sourceId, majorEventId);
    counters.events.reused += 1;
    return String(importedTargetId);
  }

  const targetId = createUuidV7();
  const name = requiredText(sourceActivity.name, `EvComp activity ${sourceId} name`);
  const description = optionalText(sourceActivity.description);
  const startDate = requiredDate(sourceActivity.startDate, `EvComp activity ${sourceId} startDate`);
  const endDate = requiredDate(sourceActivity.endDate, `EvComp activity ${sourceId} endDate`);
  assertDateOrder(startDate, endDate, `EvComp activity ${sourceId}`);
  const location = optionalText(sourceActivity.location);
  const slots = optionalInteger(sourceActivity.slots, `EvComp activity ${sourceId} slots`);
  const creditMinutes = optionalInteger(
    sourceActivity.durationInMinutes,
    `EvComp activity ${sourceId} durationInMinutes`,
  );
  const subscriptionStartDate = optionalDate(
    sourceEvent?.subscriptionStartDate,
    `EvComp event ${sourceKey(sourceActivity.sourceEventId, 'activity parent')} subscriptionStartDate`,
  );
  const subscriptionEndDate = optionalDate(
    sourceEvent?.subscriptionEndDate,
    `EvComp event ${sourceKey(sourceActivity.sourceEventId, 'activity parent')} subscriptionEndDate`,
  );

  if (apply) {
    await target.query(
      `INSERT INTO events
        (id, name, "creditMinutes", "startDate", "endDate", type, description, "locationDescription",
         "majorEventId", "allowSubscription", "subscriptionStartDate", "subscriptionEndDate", slots,
         "slotsAvailable", "shouldCollectAttendance", "publicationState", "createdById", "updatedAt", "updatedById")
       VALUES ($1,$2,$3,$4,$5,'OTHER',$6,$7,$8,true,$9,$10,$11,$11,true,'DRAFT',$12,NOW(),$12)`,
      [
        targetId,
        name,
        creditMinutes,
        startDate,
        endDate,
        description,
        location,
        majorEventId,
        subscriptionStartDate,
        subscriptionEndDate,
        slots,
        actorId,
      ],
    );
    await recordImportedTarget(target, sourceNamespace, 'event', sourceId, targetId);
    counters.events.created += 1;
  } else {
    counters.events.planned += 1;
  }
  return targetId;
}

async function preparePrice(target, sourceEventId, majorEventId, sourceNamespace, apply, counters) {
  const importedTargetId = await getImportedTarget(target, sourceNamespace, 'price', sourceEventId);
  if (importedTargetId) {
    await requireActivePrice(target, importedTargetId, sourceEventId, majorEventId);
    counters.prices.reused += 1;
    return { id: String(importedTargetId), majorEventId };
  }

  const existing = await queryRows(
    target,
    `SELECT id, "majorEventId"
       FROM major_event_prices
      WHERE "majorEventId"=$1`,
    [majorEventId],
  );
  if (existing.length) {
    const existingPrice = existing[0];
    if (String(existingPrice.majorEventId) !== String(majorEventId)) {
      throw new Error(`Existing price ${existingPrice.id} belongs to another major event.`);
    }
    if (apply) {
      await recordImportedTarget(target, sourceNamespace, 'price', sourceEventId, existingPrice.id);
    }
    counters.prices.reused += 1;
    return { id: String(existingPrice.id), majorEventId };
  }

  const targetId = createUuidV7();
  if (apply) {
    await target.query(
      `INSERT INTO major_event_prices (id, "majorEventId", type, "createdAt")
       VALUES ($1,$2,'TIERED',NOW())`,
      [targetId, majorEventId],
    );
    await recordImportedTarget(target, sourceNamespace, 'price', sourceEventId, targetId);
    counters.prices.created += 1;
  } else {
    counters.prices.planned += 1;
  }
  return { id: targetId, majorEventId };
}

async function preparePriceTier(target, sourceModality, price, sourceNamespace, apply, counters) {
  const sourceId = sourceKey(sourceModality.sourceId, 'modality');
  const importedTargetId = await getImportedTarget(target, sourceNamespace, 'priceTier', sourceId);
  if (importedTargetId) {
    const existing = await queryRows(
      target,
      `SELECT tier.id, tier.name, price."majorEventId", major."deletedAt" AS "majorEventDeletedAt"
         FROM price_tiers tier
         JOIN major_event_prices price ON price.id=tier."priceId"
         JOIN major_events major ON major.id=price."majorEventId"
        WHERE tier.id=$1`,
      [importedTargetId],
    );
    const row = existing[0];
    if (!row || row.majorEventDeletedAt != null) {
      throw provenanceTargetError('price tier', sourceId, importedTargetId);
    }
    if (String(row.majorEventId) !== String(price.majorEventId)) {
      throw new Error(
        `Imported price tier ${sourceId} belongs to major event ${row.majorEventId}, expected ${price.majorEventId}.`,
      );
    }
    counters.priceTiers.reused += 1;
    return {
      id: String(row.id),
      name: requiredText(row.name, `target price tier ${row.id} name`),
      majorEventId: String(row.majorEventId),
    };
  }

  const name = requiredText(sourceModality.name, `EvComp modality ${sourceId} name`);
  const value = toAmountInCents(sourceModality.amount);
  const targetId = createUuidV7();
  if (apply) {
    await target.query(
      `INSERT INTO price_tiers
        (id, "priceId", name, value, "includesEventRegistration", "includesSportsRegistration")
       VALUES ($1,$2,$3,$4,true,false)`,
      [targetId, price.id, name, value],
    );
    await recordImportedTarget(target, sourceNamespace, 'priceTier', sourceId, targetId);
    counters.priceTiers.created += 1;
  } else {
    counters.priceTiers.planned += 1;
  }
  return { id: targetId, name, majorEventId: String(price.majorEventId) };
}

async function requireActiveMajorEvent(target, targetId, sourceId) {
  const rows = await queryRows(target, `SELECT id, "deletedAt" FROM major_events WHERE id=$1`, [targetId]);
  if (!rows[0] || rows[0].deletedAt != null) throw provenanceTargetError('major event', sourceId, targetId);
}

async function requireActiveActivity(target, targetId, sourceId, expectedMajorEventId) {
  const rows = await queryRows(target, `SELECT id, "majorEventId", "deletedAt" FROM events WHERE id=$1`, [targetId]);
  const row = rows[0];
  if (!row || row.deletedAt != null) throw provenanceTargetError('activity', sourceId, targetId);
  if (String(row.majorEventId) !== String(expectedMajorEventId)) {
    throw new Error(
      `Imported activity ${sourceId} belongs to major event ${row.majorEventId}, expected ${expectedMajorEventId}.`,
    );
  }
}

async function requireActivePrice(target, targetId, sourceId, expectedMajorEventId) {
  const rows = await queryRows(
    target,
    `SELECT price.id, price."majorEventId", major."deletedAt" AS "majorEventDeletedAt"
       FROM major_event_prices price
       JOIN major_events major ON major.id=price."majorEventId"
      WHERE price.id=$1`,
    [targetId],
  );
  const row = rows[0];
  if (!row || row.majorEventDeletedAt != null) throw provenanceTargetError('price', sourceId, targetId);
  if (String(row.majorEventId) !== String(expectedMajorEventId)) {
    throw new Error(
      `Imported price ${sourceId} belongs to major event ${row.majorEventId}, expected ${expectedMajorEventId}.`,
    );
  }
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('EvComp catalog snapshot must be an object.');
  for (const name of ['events', 'activities', 'modalities']) {
    if (!Array.isArray(snapshot[name])) throw new Error(`EvComp catalog snapshot must contain a ${name} array.`);
  }
  return snapshot;
}

function uniqueRows(rows, label) {
  const seen = new Set();
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`EvComp ${label}[${index}] must be an object.`);
    const id = sourceKey(row.sourceId, `${label}[${index}].sourceId`);
    if (seen.has(id)) throw new Error(`Duplicate EvComp ${label} source ID: ${id}`);
    seen.add(id);
    return row;
  });
}

function validateActivityParents(activities, events) {
  const eventIds = new Set(events.map((event) => String(event.sourceId)));
  for (const activity of activities) {
    const id = sourceKey(activity.sourceId, 'activity');
    const parent = sourceKey(activity.sourceEventId, `activity ${id} sourceEventId`);
    if (!eventIds.has(parent)) throw new Error(`EvComp activity ${id} references unknown event ${parent}.`);
  }
}

function validateModalityParents(modalities, events) {
  const eventIds = new Set(events.map((event) => String(event.sourceId)));
  for (const modality of modalities) {
    const id = sourceKey(modality.sourceId, 'modality');
    const parent = sourceKey(modality.sourceEventId, `modality ${id} sourceEventId`);
    if (!eventIds.has(parent)) throw new Error(`EvComp modality ${id} references unknown event ${parent}.`);
    requiredText(modality.name, `EvComp modality ${id} name`);
    toAmountInCents(modality.amount);
  }
}

function groupBySourceEvent(modalities) {
  const grouped = new Map();
  for (const modality of modalities) {
    const eventId = String(modality.sourceEventId);
    const values = grouped.get(eventId) ?? [];
    values.push(modality);
    grouped.set(eventId, values);
  }
  return grouped;
}

function sourceKey(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing EvComp ${label} source ID.`);
  }
  return String(value);
}

function requireNamespace(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error('sourceNamespace is required for catalog provenance.');
  }
  return String(value);
}

function requiredText(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing ${label}.`);
  }
  return String(value);
}

function optionalText(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return String(value);
}

function requiredDate(value, label) {
  const result = optionalDate(value, label);
  if (!result) throw new Error(`Missing ${label}.`);
  return result;
}

function optionalDate(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(String(value).trim().replace(' ', 'T'));
  if (Number.isNaN(result.getTime())) throw new Error(`Invalid ${label}: ${String(value)}`);
  return result;
}

function optionalInteger(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Invalid ${label}: ${String(value)}`);
  return result;
}

function assertDateOrder(startDate, endDate, label) {
  if (endDate.getTime() < startDate.getTime()) {
    throw new Error(`${label} endDate must not be before startDate.`);
  }
}

async function queryRows(target, sql, parameters) {
  const result = await target.query(sql, parameters);
  return result?.rows ?? [];
}

function provenanceTargetError(entity, sourceId, targetId) {
  return new Error(`Imported ${entity} ${sourceId} provenance points to missing or deleted target ${targetId}.`);
}

function emptyCounters() {
  return Object.fromEntries(entityTypes.map(([key]) => [key, { created: 0, reused: 0, planned: 0 }]));
}
