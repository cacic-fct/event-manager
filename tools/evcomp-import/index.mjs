#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import mysql from 'mysql2/promise';
import pg from 'pg';
import { assertConfig, configFingerprint, createUuidV7, toAmountInCents, toSourceBoolean } from './core.mjs';
import { prepareCatalog } from './catalog.mjs';
import { resolveImportPeople } from './people.mjs';
import { assertProvenanceSchema } from './provenance.mjs';
import { readEvcompSnapshot } from './source-adapter.mjs';
import { readEvcompSqlDump } from './sql-dump-adapter.mjs';

const { Pool } = pg;

export async function runImport({
  config = {},
  source,
  snapshot: providedSnapshot,
  target,
  apply,
  sourceTimezone = '-03:00',
}) {
  assertConfig(config);
  const snapshot = providedSnapshot ?? (await readEvcompSnapshot(source, config.sourceSchema, sourceTimezone));
  const sourceNamespace = config.sourceNamespace ?? 'evcomp';
  await assertProvenanceSchema(target);
  if (apply) await target.query('BEGIN');
  try {
    if (apply) await target.query("SELECT pg_advisory_xact_lock(hashtext('evcomp-import'))");
    const explicitPersonMappings = new Map(
      (config.personMappings ?? []).map((item) => [String(item.sourcePersonId), item.targetPersonId]),
    );
    const catalog = await prepareImportCatalog(target, snapshot, config, {
      apply,
      sourceNamespace,
      actorId: config.actorId ?? null,
    });
    const { resolutions, counters: peopleCounters } = await resolveImportPeople(
      target,
      snapshot.people,
      explicitPersonMappings,
      { apply, sourceNamespace, actorId: config.actorId ?? null },
    );
    const unmatchedPeople = snapshot.people.flatMap((person) => {
      const resolution = resolutions.get(String(person.sourceId));
      return resolution.status === 'matched' ? [] : [toUnmatchedPerson(person, resolution, snapshot)];
    });
    const operations = buildOperations(
      snapshot,
      resolutions,
      catalog.eventMappings,
      catalog.activityMappings,
      catalog.modalityMappings,
    );
    validateOperationRelationships(operations, catalog.targetEventParents);
    const counters = emptyCounters();
    if (apply) {
      for (const operation of operations) await applyOperation(target, operation, config.actorId ?? null, counters);
      await refreshDerivedData(target, operations);
      await target.query('COMMIT');
    } else {
      for (const operation of operations) counters[operation.kind].pending += 1;
    }
    return {
      mode: apply ? 'apply' : 'dry-run',
      sourceNamespace,
      configFingerprint: configFingerprint(config),
      sourceCounts: Object.fromEntries(Object.entries(snapshot).map(([key, rows]) => [key, rows.length])),
      catalog: catalog.counters,
      people: {
        ...peopleCounters,
        matched: [...resolutions.values()].filter((item) => item.status === 'matched').length,
        unmatched: unmatchedPeople.length,
      },
      operations: counters,
      skippedSourceRows: operations.skippedSourceRows,
      unmatchedPeople,
    };
  } catch (error) {
    if (apply) await target.query('ROLLBACK');
    throw error;
  }
}

async function prepareImportCatalog(target, snapshot, config, options) {
  // Explicit mappings remain an opt-in path for earlier imports into existing events.
  if (config.eventMappings !== undefined || config.activityMappings !== undefined) {
    const eventMappings = new Map(
      (config.eventMappings ?? []).map((item) => [String(item.sourceEventId), item.targetMajorEventId]),
    );
    const activityMappings = new Map(
      (config.activityMappings ?? []).map((item) => [String(item.sourceActivityId), item.targetEventId]),
    );
    const targetEventParents = await validateTargetMappings(target, eventMappings, activityMappings);
    const modalityMappings = await resolveModalityMappings(target, config.modalityMappings ?? []);
    return { eventMappings, activityMappings, modalityMappings, targetEventParents, counters: {} };
  }
  if (!Array.isArray(snapshot.events) || !Array.isArray(snapshot.activities) || !Array.isArray(snapshot.modalities)) {
    throw new Error('Automatic import requires EvComp event, activity and modality catalogs.');
  }
  const catalog = await prepareCatalog(target, snapshot, options);
  const targetEventParents = new Map(
    snapshot.activities.map((activity) => [
      catalog.activityMappings.get(String(activity.sourceId)),
      catalog.eventMappings.get(String(activity.sourceEventId)),
    ]),
  );
  return { ...catalog, targetEventParents };
}

export function buildOperations(snapshot, resolutions, eventMappings, activityMappings, modalityMappings = new Map()) {
  const operations = [];
  const skippedSourceRows = [];
  const registrations = new Map();
  for (const row of snapshot.registrations) {
    const key = String(row.sourceId);
    const registration = registrations.get(key) ?? { ...row, activityIds: [] };
    if (row.sourceActivityId != null) registration.activityIds.push(String(row.sourceActivityId));
    registrations.set(key, registration);
  }

  for (const registration of registrations.values()) {
    if (!toSourceBoolean(registration.active)) {
      skippedSourceRows.push({
        kind: 'registration',
        sourceId: registration.sourceId,
        reason: 'registration_not_confirmed',
      });
      continue;
    }
    const resolution = resolutions.get(String(registration.sourcePersonId));
    const majorEventId = eventMappings.get(String(registration.sourceEventId));
    if (resolution?.status !== 'matched' || !majorEventId) {
      skippedSourceRows.push({
        kind: 'registration',
        sourceId: registration.sourceId,
        reason: reason(resolution, majorEventId),
      });
      continue;
    }
    const tier = modalityMappings.get(String(registration.sourceModalityId));
    if (registration.sourceModalityId != null && !tier) {
      skippedSourceRows.push({
        kind: 'registration',
        sourceId: registration.sourceId,
        sourceModalityId: registration.sourceModalityId,
        modalityName: registration.modalityName,
        reason: 'unmapped_modality',
      });
      continue;
    }
    if (tier && tier.majorEventId !== majorEventId) {
      throw new Error(
        `Mapped modality ${registration.sourceModalityId} does not belong to target major event ${majorEventId}.`,
      );
    }
    operations.push({
      kind: 'majorEventSubscriptions',
      personId: resolution.person.id,
      targetId: majorEventId,
      occurredAt: registration.createdAt,
      ...(tier ? { paymentTier: tier.name, amountPaid: toAmountInCents(registration.appliedAmount) } : {}),
    });
    for (const sourceActivityId of new Set(registration.activityIds)) {
      const eventId = activityMappings.get(sourceActivityId);
      if (!eventId) {
        skippedSourceRows.push({
          kind: 'eventSubscription',
          sourceId: registration.sourceId,
          sourceActivityId,
          reason: 'unmapped_activity',
        });
        continue;
      }
      operations.push({
        kind: 'eventSubscriptions',
        personId: resolution.person.id,
        targetId: eventId,
        occurredAt: registration.createdAt,
      });
      operations.push({
        kind: 'eventSelections',
        personId: resolution.person.id,
        majorEventId,
        targetId: eventId,
      });
    }
  }

  for (const attendance of snapshot.attendances) {
    const resolution = resolutions.get(String(attendance.sourcePersonId));
    const eventId = activityMappings.get(String(attendance.sourceActivityId));
    if (resolution?.status !== 'matched' || !eventId) {
      skippedSourceRows.push({
        kind: 'attendance',
        sourceId: attendance.sourceId,
        reason: reason(resolution, eventId),
      });
      continue;
    }
    operations.push({
      kind: 'attendances',
      personId: resolution.person.id,
      targetId: eventId,
      occurredAt: attendance.recordedAt,
      present: toSourceBoolean(attendance.present),
    });
  }

  for (const lecturer of snapshot.lecturers) {
    const resolution = resolutions.get(String(lecturer.sourcePersonId));
    const eventId = activityMappings.get(String(lecturer.sourceActivityId));
    if (resolution?.status !== 'matched' || !eventId) {
      skippedSourceRows.push({
        kind: 'lecturer',
        sourceActivityId: lecturer.sourceActivityId,
        reason: reason(resolution, eventId),
      });
      continue;
    }
    operations.push({ kind: 'lecturers', personId: resolution.person.id, targetId: eventId });
  }

  operations.skippedSourceRows = skippedSourceRows;
  return operations;
}

export async function applyOperation(target, operation, actorId, counters) {
  const definitions = {
    majorEventSubscriptions: {
      exists:
        'SELECT "subscriptionStatus", "paymentTier", "amountPaid" FROM major_event_subscriptions WHERE "majorEventId"=$1 AND "personId"=$2 AND "deletedAt" IS NULL FOR UPDATE',
      insert: `INSERT INTO major_event_subscriptions
        (id, "majorEventId", "personId", "createdAt", "createdById", "createdByMethod", "subscriptionStatus", "subscriptionFlow", "imageLicenseAgreementAccepted", "updatedAt", "paymentTier", "amountPaid")
        VALUES ($3,$1,$2,COALESCE($4,NOW()),$5,'UNKNOWN','CONFIRMED','REGULAR',false,NOW(),$6,$7)`,
    },
    eventSubscriptions: {
      exists: 'SELECT 1 FROM event_subscriptions WHERE "eventId"=$1 AND "personId"=$2 AND "deletedAt" IS NULL',
      insert: `INSERT INTO event_subscriptions
        (id, "eventId", "personId", "createdAt", "createdById", "createdByMethod", "imageLicenseAgreementAccepted")
        VALUES ($3,$1,$2,COALESCE($4,NOW()),$5,'UNKNOWN',false)`,
    },
    attendances: {
      exists: 'SELECT status FROM event_attendances WHERE "eventId"=$1 AND "personId"=$2',
      insert: `INSERT INTO event_attendances
        ("eventId", "personId", status, category, "attendedAt", "createdAt", "createdById", "createdByMethod")
        VALUES ($1,$2,$3,'UNKNOWN',COALESCE($4,NOW()),NOW(),$5,'CSV_IMPORT')`,
    },
    lecturers: {
      exists: 'SELECT 1 FROM event_lecturers WHERE "eventId"=$1 AND "personId"=$2',
      insert: `INSERT INTO event_lecturers ("eventId", "personId", "createdAt", "createdById")
        VALUES ($1,$2,NOW(),$3)`,
    },
    eventSelections: {
      exists: `SELECT 1 FROM major_event_subscription_event_selections selection
        JOIN major_event_subscriptions subscription ON subscription.id=selection."subscriptionId"
        WHERE subscription."majorEventId"=$1 AND subscription."personId"=$2
          AND subscription."deletedAt" IS NULL AND selection."eventId"=$3 AND selection."deletedAt" IS NULL`,
      insert: `INSERT INTO major_event_subscription_event_selections
        (id, "subscriptionId", "eventId", "createdAt", "createdById")
        SELECT $4, subscription.id, $3, NOW(), $5
        FROM major_event_subscriptions subscription
        WHERE subscription."majorEventId"=$1 AND subscription."personId"=$2 AND subscription."deletedAt" IS NULL
        ORDER BY subscription."createdAt" DESC LIMIT 1`,
    },
  };
  const definition = definitions[operation.kind];
  const existing = await target.query(
    definition.exists,
    operation.kind === 'eventSelections'
      ? [operation.majorEventId, operation.personId, operation.targetId]
      : [operation.targetId, operation.personId],
  );
  if (existing.rowCount) {
    const existingRow = existing.rows?.[0];
    if (operation.kind === 'majorEventSubscriptions' && existingRow?.subscriptionStatus !== 'CONFIRMED') {
      throw new Error(
        `Existing major-event subscription for person ${operation.personId} is ${existingRow.subscriptionStatus}; resolve it before importing.`,
      );
    }
    if (operation.kind === 'majorEventSubscriptions' && operation.paymentTier !== undefined) {
      if (
        (existingRow.paymentTier != null && existingRow.paymentTier !== operation.paymentTier) ||
        (existingRow.amountPaid != null && existingRow.amountPaid !== operation.amountPaid)
      ) {
        throw new Error(
          `Existing major-event payment details for person ${operation.personId} conflict with the mapped EvComp modality.`,
        );
      }
      if (existingRow.paymentTier == null || existingRow.amountPaid == null) {
        await target.query(
          `UPDATE major_event_subscriptions SET
          "paymentTier"=COALESCE("paymentTier",$3), "amountPaid"=COALESCE("amountPaid",$4), "updatedAt"=NOW()
          WHERE "majorEventId"=$1 AND "personId"=$2 AND "deletedAt" IS NULL`,
          [operation.targetId, operation.personId, operation.paymentTier, operation.amountPaid],
        );
        counters[operation.kind].updated = (counters[operation.kind].updated ?? 0) + 1;
        return;
      }
    }
    const sourceAttendanceStatus = operation.present ? 'PRESENT' : 'ABSENT';
    if (operation.kind === 'attendances' && existingRow?.status !== sourceAttendanceStatus) {
      throw new Error(
        `Existing attendance for person ${operation.personId} is ${existingRow.status}, but EvComp is ${sourceAttendanceStatus}.`,
      );
    }
    counters[operation.kind].skipped += 1;
    return;
  }

  if (operation.kind === 'eventSelections') {
    await target.query(definition.insert, [
      operation.majorEventId,
      operation.personId,
      operation.targetId,
      createUuidV7(),
      actorId,
    ]);
  } else if (operation.kind === 'attendances') {
    await target.query(definition.insert, [
      operation.targetId,
      operation.personId,
      operation.present ? 'PRESENT' : 'ABSENT',
      operation.occurredAt,
      actorId,
    ]);
  } else if (operation.kind === 'lecturers') {
    await target.query(definition.insert, [operation.targetId, operation.personId, actorId]);
  } else {
    await target.query(definition.insert, [
      operation.targetId,
      operation.personId,
      createUuidV7(),
      operation.occurredAt,
      actorId,
      ...(operation.kind === 'majorEventSubscriptions'
        ? [operation.paymentTier ?? null, operation.amountPaid ?? null]
        : []),
    ]);
  }
  counters[operation.kind].imported += 1;
}

async function validateTargetMappings(target, eventMappings, activityMappings) {
  const majorIds = [...new Set(eventMappings.values())];
  const eventIds = [...new Set(activityMappings.values())];
  const [majorEvents, events] = await Promise.all([
    target.query('SELECT id FROM major_events WHERE id = ANY($1::text[]) AND "deletedAt" IS NULL', [majorIds]),
    target.query('SELECT id, "majorEventId" FROM events WHERE id = ANY($1::text[]) AND "deletedAt" IS NULL', [
      eventIds,
    ]),
  ]);
  assertAllTargetsExist(
    'major event',
    majorIds,
    majorEvents.rows.map((row) => row.id),
  );
  assertAllTargetsExist(
    'event',
    eventIds,
    events.rows.map((row) => row.id),
  );
  return new Map(events.rows.map((row) => [row.id, row.majorEventId]));
}

async function resolveModalityMappings(target, mappings) {
  if (!mappings.length) return new Map();
  const ids = [...new Set(mappings.map((mapping) => mapping.targetPriceTierId))];
  const { rows } = await target.query(
    `SELECT tier.id, tier.name, price."majorEventId"
    FROM price_tiers tier JOIN major_event_prices price ON price.id=tier."priceId"
    JOIN major_events event ON event.id=price."majorEventId" AND event."deletedAt" IS NULL
    WHERE tier.id=ANY($1::text[])`,
    [ids],
  );
  assertAllTargetsExist(
    'price tier',
    ids,
    rows.map((row) => row.id),
  );
  const tiers = new Map(rows.map((row) => [row.id, row]));
  return new Map(mappings.map((mapping) => [String(mapping.sourceModalityId), tiers.get(mapping.targetPriceTierId)]));
}

function validateOperationRelationships(operations, targetEventParents) {
  const invalid = operations.filter(
    (operation) =>
      operation.kind === 'eventSelections' && targetEventParents.get(operation.targetId) !== operation.majorEventId,
  );
  if (invalid.length) {
    throw new Error(
      `Mapped activities do not belong to their mapped target major event: ${invalid
        .map((item) => `${item.targetId} -> ${item.majorEventId}`)
        .join(', ')}`,
    );
  }
}

function assertAllTargetsExist(label, expected, actual) {
  const actualSet = new Set(actual);
  const missing = expected.filter((id) => !actualSet.has(id));
  if (missing.length) throw new Error(`Mapped target ${label} IDs do not exist or are deleted: ${missing.join(', ')}`);
}

function toUnmatchedPerson(sourcePerson, resolution, snapshot) {
  const sourceId = String(sourcePerson.sourceId);
  return {
    sourceId: sourcePerson.sourceId,
    name: sourcePerson.name,
    email: sourcePerson.email,
    academicId: sourcePerson.academicId,
    reason: resolution.reason ?? resolution.status,
    ...(resolution.sourceTargetId ? { previousTargetPersonId: resolution.sourceTargetId } : {}),
    candidatePeople: (resolution.candidates ?? resolution.nameCandidates ?? []).map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      academicId: person.academicId,
    })),
    relatedRows: {
      registrations: new Set(
        snapshot.registrations.filter((row) => String(row.sourcePersonId) === sourceId).map((row) => row.sourceId),
      ).size,
      attendances: snapshot.attendances.filter((row) => String(row.sourcePersonId) === sourceId).length,
      lectures: snapshot.lecturers.filter((row) => String(row.sourcePersonId) === sourceId).length,
    },
  };
}

function reason(resolution, mapping) {
  if (!mapping) return 'unmapped_source_record';
  if (resolution?.status === 'ambiguous') return 'ambiguous_person';
  if (resolution?.status === 'conflict') return 'conflicting_person_identifiers';
  return resolution?.reason ?? 'unmatched_person';
}

function emptyCounters() {
  return Object.fromEntries(
    ['majorEventSubscriptions', 'eventSubscriptions', 'eventSelections', 'attendances', 'lecturers'].map((kind) => [
      kind,
      { pending: 0, imported: 0, updated: 0, skipped: 0 },
    ]),
  );
}

export async function refreshDerivedData(target, operations) {
  const majorSubscriptions = operations.filter((item) => item.kind === 'majorEventSubscriptions');
  const eventIds = [
    ...new Set(
      operations
        .filter((item) => item.kind !== 'majorEventSubscriptions')
        .map((item) => item.targetId)
        .filter(Boolean),
    ),
  ];
  if (!eventIds.length && !majorSubscriptions.length) return;
  await target.query(
    `UPDATE events event SET
      "queueCount"=(SELECT COUNT(*)::integer FROM major_event_subscription_event_selections selection
        JOIN major_event_subscriptions subscription ON subscription.id=selection."subscriptionId"
        WHERE selection."eventId"=event.id AND selection."deletedAt" IS NULL AND subscription."deletedAt" IS NULL
          AND subscription."subscriptionStatus" NOT IN ('CONFIRMED','CANCELED')),
      "slotsAvailable"=CASE WHEN event.slots IS NULL THEN NULL ELSE event.slots-
        (SELECT COUNT(*)::integer FROM event_subscriptions item WHERE item."eventId"=event.id AND item."deletedAt" IS NULL) END
     WHERE event.id=ANY($1::text[])`,
    [eventIds],
  );
  await target.query(
    `WITH assessments AS (
      SELECT attendance."personId", attendance."eventId", CASE
      WHEN cardinality(event."regularAttendancePriceTierIds") > 0 AND NOT EXISTS (
        SELECT 1 FROM major_event_subscriptions subscription
        JOIN price_tiers tier ON tier.id=ANY(event."regularAttendancePriceTierIds")
        JOIN major_event_prices price ON price.id=tier."priceId" AND price."majorEventId"=event."majorEventId"
        WHERE subscription."majorEventId"=event."majorEventId"
          AND subscription."personId"=attendance."personId" AND subscription."deletedAt" IS NULL
          AND lower(btrim(subscription."paymentTier"))=lower(btrim(tier.name)))
        THEN 'PRICE_TIER_NOT_ELIGIBLE'
      WHEN event."majorEventId" IS NOT NULL AND major_event."isPaymentRequired"=true
        AND NOT EXISTS (SELECT 1 FROM major_event_subscriptions item WHERE item."majorEventId"=event."majorEventId"
          AND item."personId"=attendance."personId" AND item."deletedAt" IS NULL AND item."subscriptionStatus"='CONFIRMED')
        THEN CASE (SELECT item."subscriptionStatus" FROM major_event_subscriptions item
          WHERE item."majorEventId"=event."majorEventId" AND item."personId"=attendance."personId"
            AND item."deletedAt" IS NULL)
          WHEN 'WAITING_RECEIPT_UPLOAD' THEN 'MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT'
          WHEN 'RECEIPT_UNDER_REVIEW' THEN 'MAJOR_EVENT_PAYMENT_UNDER_REVIEW'
          ELSE 'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED' END
      WHEN event."allowSubscription"=true AND NOT EXISTS
        (SELECT 1 FROM event_subscriptions item WHERE item."eventId"=event.id AND item."personId"=attendance."personId" AND item."deletedAt" IS NULL)
        THEN 'ACTIVITY_SUBSCRIPTION_MISSING'
      ELSE 'REQUIREMENTS_CURRENTLY_MET' END AS assessment
      FROM event_attendances attendance
      JOIN events event ON attendance."eventId"=event.id
      LEFT JOIN major_events major_event ON major_event.id=event."majorEventId"
      WHERE event."deletedAt" IS NULL AND (event.id=ANY($1::text[]) OR EXISTS (
        SELECT 1 FROM unnest($2::text[], $3::text[]) affected("majorEventId", "personId")
        WHERE affected."majorEventId"=event."majorEventId" AND affected."personId"=attendance."personId"))
    )
    UPDATE event_attendances attendance SET
      category=(CASE WHEN assessments.assessment='REQUIREMENTS_CURRENTLY_MET' THEN 'REGULAR' ELSE 'NON_REGULAR' END)::"AttendanceCategory",
      "currentAssessment"=assessments.assessment::"AttendanceCurrentAssessment"
    FROM assessments
    WHERE attendance."personId"=assessments."personId" AND attendance."eventId"=assessments."eventId"`,
    [eventIds, majorSubscriptions.map((item) => item.targetId), majorSubscriptions.map((item) => item.personId)],
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    process.stdout.write(
      'Usage: node tools/evcomp-import/index.mjs [--config <file>] [--source-sql <dump.sql>] [--source-namespace <name>] [--apply] [--report <file>]\n',
    );
    process.exitCode = 0;
    return;
  }
  for (const flag of ['--config', '--source-sql', '--source-namespace', '--report']) {
    if (args.has(flag) && !valueAfter(flag)) throw new Error(`${flag} requires a value.`);
  }
  const sourceSqlPath = valueAfter('--source-sql');
  if (!sourceSqlPath && !process.env.EVCOMP_DATABASE_URL) {
    throw new Error('EVCOMP_DATABASE_URL or --source-sql is required.');
  }
  const targetUrl = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error('TARGET_DATABASE_URL or DATABASE_URL is required.');

  const reportPath = resolve(valueAfter('--report') ?? 'evcomp-import-report.json');
  const configPath = valueAfter('--config');
  const config = configPath ? JSON.parse(await readFile(resolve(configPath), 'utf8')) : {};
  if (valueAfter('--source-namespace')) config.sourceNamespace = valueAfter('--source-namespace');
  const sourceTimezone = process.env.EVCOMP_TIMEZONE_OFFSET ?? '-03:00';
  if (!/^[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(sourceTimezone)) {
    throw new Error('EVCOMP_TIMEZONE_OFFSET must use an offset such as -03:00.');
  }
  let source;
  let snapshot;
  if (sourceSqlPath) {
    snapshot = await readEvcompSqlDump(resolve(sourceSqlPath), config.sourceSchema, sourceTimezone);
  } else {
    source = await mysql.createConnection({ uri: process.env.EVCOMP_DATABASE_URL, timezone: sourceTimezone });
  }
  const pool = new Pool({ connectionString: targetUrl, max: 1 });
  const target = await pool.connect();
  try {
    const report = await runImport({ config, source, snapshot, target, apply: args.has('--apply'), sourceTimezone });
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`Full report: ${reportPath}\n`);
  } finally {
    target.release();
    await pool.end();
    await source?.end();
  }
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    process.stderr.write(`EvComp import failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
