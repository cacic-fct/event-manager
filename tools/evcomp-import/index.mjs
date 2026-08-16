#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import mysql from 'mysql2/promise';
import pg from 'pg';
import {
  assertConfig,
  configFingerprint,
  createUuidV7,
  normalizeAcademicId,
  resolvePerson,
  toSourceBoolean,
} from './core.mjs';
import { readEvcompSnapshot } from './source-adapter.mjs';
import { readEvcompSqlDump } from './sql-dump-adapter.mjs';

const { Pool } = pg;

export async function runImport({ config, source, snapshot: providedSnapshot, target, apply }) {
  assertConfig(config);
  const snapshot = providedSnapshot ?? (await readEvcompSnapshot(source, config.sourceSchema));
  const explicitPersonMappings = new Map(
    (config.personMappings ?? []).map((item) => [String(item.sourcePersonId), item.targetPersonId]),
  );
  const targetPeople = await findTargetPeople(target, snapshot.people, [...explicitPersonMappings.values()]);
  const resolutions = new Map();
  const unmatchedPeople = [];

  for (const sourcePerson of snapshot.people) {
    const explicitTargetId = explicitPersonMappings.get(String(sourcePerson.sourceId));
    const explicitPerson = explicitTargetId ? targetPeople.find((person) => person.id === explicitTargetId) : null;
    if (explicitTargetId && !explicitPerson) {
      throw new Error(`Mapped target person does not exist, is deleted, or is merged: ${explicitTargetId}`);
    }
    const resolution = explicitPerson
      ? { status: 'matched', person: explicitPerson, matchedBy: 'explicitMapping' }
      : resolvePerson(sourcePerson, targetPeople);
    resolutions.set(String(sourcePerson.sourceId), resolution);
    if (resolution.status !== 'matched') {
      unmatchedPeople.push(toUnmatchedPerson(sourcePerson, resolution, snapshot));
    }
  }

  const eventMappings = new Map(config.eventMappings.map((item) => [String(item.sourceEventId), item.targetMajorEventId]));
  const activityMappings = new Map(
    config.activityMappings.map((item) => [String(item.sourceActivityId), item.targetEventId]),
  );
  const targetEventParents = await validateTargetMappings(target, eventMappings, activityMappings);

  const operations = buildOperations(snapshot, resolutions, eventMappings, activityMappings);
  validateOperationRelationships(operations, targetEventParents);
  const counters = emptyCounters();
  if (apply) {
    await target.query('BEGIN');
    try {
      await target.query("SELECT pg_advisory_xact_lock(hashtext('evcomp-import'))");
      for (const operation of operations) await applyOperation(target, operation, config.actorId ?? null, counters);
      await refreshDerivedData(target, operations);
      await target.query('COMMIT');
    } catch (error) {
      await target.query('ROLLBACK');
      throw error;
    }
  } else {
    for (const operation of operations) counters[operation.kind].pending += 1;
  }

  return {
    mode: apply ? 'apply' : 'dry-run',
    configFingerprint: configFingerprint(config),
    sourceCounts: Object.fromEntries(Object.entries(snapshot).map(([key, rows]) => [key, rows.length])),
    people: {
      matched: [...resolutions.values()].filter((item) => item.status === 'matched').length,
      unmatched: unmatchedPeople.length,
    },
    operations: counters,
    skippedSourceRows: operations.skippedSourceRows,
    unmatchedPeople,
  };
}

export function buildOperations(snapshot, resolutions, eventMappings, activityMappings) {
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
    if (!toSourceBoolean(registration.active)) continue;
    const resolution = resolutions.get(String(registration.sourcePersonId));
    const majorEventId = eventMappings.get(String(registration.sourceEventId));
    if (resolution?.status !== 'matched' || !majorEventId) {
      skippedSourceRows.push({ kind: 'registration', sourceId: registration.sourceId, reason: reason(resolution, majorEventId) });
      continue;
    }
    operations.push({
      kind: 'majorEventSubscriptions',
      personId: resolution.person.id,
      targetId: majorEventId,
      occurredAt: registration.createdAt,
    });
    for (const sourceActivityId of new Set(registration.activityIds)) {
      const eventId = activityMappings.get(sourceActivityId);
      if (!eventId) {
        skippedSourceRows.push({ kind: 'eventSubscription', sourceId: registration.sourceId, sourceActivityId, reason: 'unmapped_activity' });
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
      skippedSourceRows.push({ kind: 'attendance', sourceId: attendance.sourceId, reason: reason(resolution, eventId) });
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
      skippedSourceRows.push({ kind: 'lecturer', sourceActivityId: lecturer.sourceActivityId, reason: reason(resolution, eventId) });
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
      exists: 'SELECT "subscriptionStatus" FROM major_event_subscriptions WHERE "majorEventId"=$1 AND "personId"=$2 AND "deletedAt" IS NULL',
      insert: `INSERT INTO major_event_subscriptions
        (id, "majorEventId", "personId", "createdAt", "createdById", "createdByMethod", "subscriptionStatus", "subscriptionFlow", "imageLicenseAgreementAccepted", "updatedAt")
        VALUES ($3,$1,$2,COALESCE($4,NOW()),$5,'UNKNOWN','CONFIRMED','REGULAR',false,NOW())`,
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
    await target.query(definition.insert, [operation.targetId, operation.personId, createUuidV7(), operation.occurredAt, actorId]);
  }
  counters[operation.kind].imported += 1;
}

async function findTargetPeople(target, sourcePeople, explicitIds) {
  const academicIds = sourcePeople.map((person) => normalizeAcademicId(person.academicId)).filter(Boolean);
  const emails = sourcePeople.map((person) => String(person.email ?? '').trim().toLowerCase()).filter(Boolean);
  const names = sourcePeople.map((person) => String(person.name ?? '').trim()).filter(Boolean);
  const result = await target.query(
    `SELECT id, name, email, "secondaryEmails", "academicId"
     FROM people
     WHERE "deletedAt" IS NULL AND "mergedIntoId" IS NULL
       AND (id = ANY($4::text[]) OR regexp_replace(upper(coalesce("academicId",'')), '\\s', '', 'g') = ANY($1::text[]) OR lower(email) = ANY($2::text[])
         OR EXISTS (SELECT 1 FROM unnest("secondaryEmails") item WHERE lower(item) = ANY($2::text[]))
         OR lower(name) = ANY(SELECT lower(item) FROM unnest($3::text[]) item))`,
    [academicIds, emails, names, explicitIds],
  );
  return result.rows;
}

async function validateTargetMappings(target, eventMappings, activityMappings) {
  const majorIds = [...new Set(eventMappings.values())];
  const eventIds = [...new Set(activityMappings.values())];
  const [majorEvents, events] = await Promise.all([
    target.query('SELECT id FROM major_events WHERE id = ANY($1::text[]) AND "deletedAt" IS NULL', [majorIds]),
    target.query('SELECT id, "majorEventId" FROM events WHERE id = ANY($1::text[]) AND "deletedAt" IS NULL', [eventIds]),
  ]);
  assertAllTargetsExist('major event', majorIds, majorEvents.rows.map((row) => row.id));
  assertAllTargetsExist('event', eventIds, events.rows.map((row) => row.id));
  return new Map(events.rows.map((row) => [row.id, row.majorEventId]));
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
    reason: resolution.status,
    candidatePeople: (resolution.candidates ?? resolution.nameCandidates ?? []).map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      academicId: person.academicId,
    })),
    relatedRows: {
      registrations: new Set(snapshot.registrations.filter((row) => String(row.sourcePersonId) === sourceId).map((row) => row.sourceId)).size,
      attendances: snapshot.attendances.filter((row) => String(row.sourcePersonId) === sourceId).length,
      lectures: snapshot.lecturers.filter((row) => String(row.sourcePersonId) === sourceId).length,
    },
  };
}

function reason(resolution, mapping) {
  if (!mapping) return 'unmapped_source_record';
  if (resolution?.status === 'ambiguous') return 'ambiguous_person';
  if (resolution?.status === 'conflict') return 'conflicting_person_identifiers';
  return 'unmatched_person';
}

function emptyCounters() {
  return Object.fromEntries(
    ['majorEventSubscriptions', 'eventSubscriptions', 'eventSelections', 'attendances', 'lecturers'].map((kind) => [
      kind,
      { pending: 0, imported: 0, skipped: 0 },
    ]),
  );
}

async function refreshDerivedData(target, operations) {
  const eventIds = [
    ...new Set(
      operations
        .filter((item) => item.kind !== 'majorEventSubscriptions')
        .map((item) => item.targetId)
        .filter(Boolean),
    ),
  ];
  if (!eventIds.length) return;
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
    `UPDATE event_attendances attendance SET category=CASE
      WHEN event."majorEventId" IS NOT NULL AND major_event."isPaymentRequired"=true
        AND NOT EXISTS (SELECT 1 FROM major_event_subscriptions item WHERE item."majorEventId"=event."majorEventId"
          AND item."personId"=attendance."personId" AND item."deletedAt" IS NULL AND item."subscriptionStatus"='CONFIRMED')
        THEN 'NON_PAYING'::"AttendanceCategory"
      WHEN event."allowSubscription"=true AND NOT EXISTS
        (SELECT 1 FROM event_subscriptions item WHERE item."eventId"=event.id AND item."personId"=attendance."personId" AND item."deletedAt" IS NULL)
        THEN 'NON_SUBSCRIBED'::"AttendanceCategory"
      ELSE 'REGULAR'::"AttendanceCategory" END
     FROM events event LEFT JOIN major_events major_event ON major_event.id=event."majorEventId"
     WHERE attendance."eventId"=event.id AND event.id=ANY($1::text[])`,
    [eventIds],
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || !valueAfter('--config')) {
    process.stdout.write(
      'Usage: node tools/evcomp-import/index.mjs --config <file> [--source-sql <dump.sql>] [--apply] [--report <file>]\n',
    );
    process.exitCode = args.has('--help') ? 0 : 2;
    return;
  }
  const sourceSqlPath = valueAfter('--source-sql');
  if (!sourceSqlPath && !process.env.EVCOMP_DATABASE_URL) {
    throw new Error('EVCOMP_DATABASE_URL or --source-sql is required.');
  }
  const targetUrl = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error('TARGET_DATABASE_URL or DATABASE_URL is required.');

  const configPath = resolve(valueAfter('--config'));
  const reportPath = resolve(valueAfter('--report') ?? 'evcomp-import-report.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
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
    const report = await runImport({ config, source, snapshot, target, apply: args.has('--apply') });
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
