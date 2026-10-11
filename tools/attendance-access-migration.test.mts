import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

type AttendanceEligibility = 'ANYONE' | 'REGISTERED_ONLY';

type EventFixture = {
  id: string;
  createdAt: Date;
  allowSubscription?: boolean;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  attendanceEligibility?: AttendanceEligibility | null;
};

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/backend/prisma/migrations/20261009120000_preserve_legacy_attendance_access/migration.sql',
);
const migrationSql = await readFile(migrationPath, 'utf8');

async function createDatabase(includeMigrationTable = true): Promise<PGlite> {
  const database = new PGlite();
  await database.exec(`
    CREATE TYPE "AttendanceEligibility" AS ENUM ('ANYONE', 'REGISTERED_ONLY');

    CREATE TABLE "event_groups" (
      "id" TEXT PRIMARY KEY,
      "majorEventId" TEXT,
      "attendanceEligibility" "AttendanceEligibility"
    );

    CREATE TABLE "events" (
      "id" TEXT PRIMARY KEY,
      "createdAt" TIMESTAMPTZ NOT NULL,
      "allowSubscription" BOOLEAN NOT NULL DEFAULT false,
      "majorEventId" TEXT,
      "eventGroupId" TEXT,
      "attendanceEligibility" "AttendanceEligibility"
    );
  `);

  if (includeMigrationTable) {
    await database.exec(`
      CREATE TABLE "_prisma_migrations" (
        "migration_name" TEXT NOT NULL,
        "started_at" TIMESTAMPTZ NOT NULL,
        "finished_at" TIMESTAMPTZ
      );
    `);
  }

  return database;
}

async function insertEvent(database: PGlite, event: EventFixture): Promise<void> {
  await database.query(
    `INSERT INTO "events" (
       "id", "createdAt", "allowSubscription", "majorEventId", "eventGroupId", "attendanceEligibility"
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.id,
      event.createdAt,
      event.allowSubscription ?? false,
      event.majorEventId ?? null,
      event.eventGroupId ?? null,
      event.attendanceEligibility ?? null,
    ],
  );
}

async function readEventEligibilities(database: PGlite): Promise<Map<string, AttendanceEligibility | null>> {
  const result = await database.query<{
    id: string;
    attendanceEligibility: AttendanceEligibility | null;
  }>(`SELECT "id", "attendanceEligibility" FROM "events"`);

  return new Map(result.rows.map((event) => [event.id, event.attendanceEligibility]));
}

test('does nothing when the Prisma migration ledger is absent', async () => {
  const database = await createDatabase(false);

  try {
    await insertEvent(database, {
      id: 'legacy-event',
      createdAt: new Date(Date.now() - 60_000),
    });

    await database.exec(migrationSql);

    const eligibilities = await readEventEligibilities(database);
    assert.equal(eligibilities.get('legacy-event'), null);
  } finally {
    await database.close();
  }
});

test('does nothing until the eligibility migration has a successful application record', async () => {
  const database = await createDatabase();

  try {
    const now = Date.now();
    await database.query(
      `INSERT INTO "_prisma_migrations" ("migration_name", "started_at", "finished_at")
       VALUES ($1, $2, $3), ($4, $5, $6)`,
      [
        '20260913120000_event_interest_attendance_eligibility',
        new Date(now - 120_000),
        null,
        'unrelated_migration',
        new Date(now - 60_000),
        new Date(now - 30_000),
      ],
    );
    await insertEvent(database, {
      id: 'legacy-event',
      createdAt: new Date(now - 180_000),
    });

    await database.exec(migrationSql);

    const eligibilities = await readEventEligibilities(database);
    assert.equal(eligibilities.get('legacy-event'), null);
  } finally {
    await database.close();
  }
});

test('preserves eligible legacy access while respecting cutoff dates and inherited policies', async () => {
  const database = await createDatabase();

  try {
    const cutoff = new Date(Date.now() - 60_000);
    await database.query(
      `INSERT INTO "_prisma_migrations" ("migration_name", "started_at", "finished_at")
       VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)`,
      [
        '20260913120000_event_interest_attendance_eligibility',
        new Date(cutoff.getTime() - 60_000),
        null,
        '20260913120000_event_interest_attendance_eligibility',
        cutoff,
        new Date(cutoff.getTime() + 60_000),
        '20260913120000_event_interest_attendance_eligibility',
        new Date(cutoff.getTime() + 60_000),
        new Date(cutoff.getTime() + 120_000),
      ],
    );

    await database.query(
      `INSERT INTO "event_groups" ("id", "majorEventId", "attendanceEligibility")
       VALUES ($1, NULL, NULL), ($2, NULL, 'ANYONE'), ($3, NULL, 'REGISTERED_ONLY'), ($4, $5, NULL)`,
      ['standalone-group', 'anyone-policy-group', 'registered-policy-group', 'major-event-group', 'major-1'],
    );

    const olderThanCutoff = new Date(cutoff.getTime() - 1_000);
    await insertEvent(database, { id: 'legacy-standalone', createdAt: olderThanCutoff });
    await insertEvent(database, { id: 'legacy-at-cutoff', createdAt: cutoff });
    await insertEvent(database, {
      id: 'legacy-standalone-group',
      createdAt: olderThanCutoff,
      eventGroupId: 'standalone-group',
    });
    await insertEvent(database, {
      id: 'created-after-cutoff',
      createdAt: new Date(cutoff.getTime() + 1_000),
    });
    await insertEvent(database, {
      id: 'explicit-event-policy',
      createdAt: olderThanCutoff,
      attendanceEligibility: 'REGISTERED_ONLY',
    });
    await insertEvent(database, {
      id: 'subscription-allowed',
      createdAt: olderThanCutoff,
      allowSubscription: true,
    });
    await insertEvent(database, {
      id: 'major-event-child',
      createdAt: olderThanCutoff,
      majorEventId: 'major-1',
    });
    await insertEvent(database, {
      id: 'group-with-major-event',
      createdAt: olderThanCutoff,
      eventGroupId: 'major-event-group',
    });
    await insertEvent(database, {
      id: 'inherits-anyone-group-policy',
      createdAt: olderThanCutoff,
      eventGroupId: 'anyone-policy-group',
    });
    await insertEvent(database, {
      id: 'inherits-registered-group-policy',
      createdAt: olderThanCutoff,
      eventGroupId: 'registered-policy-group',
    });

    await database.exec(migrationSql);

    const eligibilities = await readEventEligibilities(database);
    for (const id of ['legacy-standalone', 'legacy-at-cutoff', 'legacy-standalone-group']) {
      assert.equal(eligibilities.get(id), 'ANYONE', `${id} should preserve its legacy access.`);
    }

    for (const id of [
      'created-after-cutoff',
      'subscription-allowed',
      'major-event-child',
      'group-with-major-event',
      'inherits-anyone-group-policy',
      'inherits-registered-group-policy',
    ]) {
      assert.equal(eligibilities.get(id), null, `${id} should keep inheriting or retain its current scope.`);
    }

    assert.equal(eligibilities.get('explicit-event-policy'), 'REGISTERED_ONLY');
  } finally {
    await database.close();
  }
});
