import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}
if (process.env['PRISMA_MIGRATION_INTEGRATION_TEST'] !== '1') {
  throw new Error('Set PRISMA_MIGRATION_INTEGRATION_TEST=1 to run this database-mutating test.');
}

const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const fixturePrefix = `migration-integrity-${Date.now()}-${randomUUID().slice(0, 8)}`;
const personId = `${fixturePrefix}-person`;
const majorEventId = `${fixturePrefix}-major-event`;
const eventGroupId = `${fixturePrefix}-event-group`;
const eventId = `${fixturePrefix}-event`;
const invalidEventId = `${fixturePrefix}-invalid-event`;
const invalidMajorEventId = `${fixturePrefix}-invalid-major-event`;

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

async function expectPostgresError(
  label: string,
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.equal(postgresErrorCode(error), expectedCode, `${label} returned an unexpected PostgreSQL error.`);
    return true;
  });
}

async function deleteFixtures(): Promise<void> {
  await pool.query('DELETE FROM "event_subscriptions" WHERE "id" LIKE $1', [`${fixturePrefix}%`]);
  await pool.query('DELETE FROM "major_event_subscriptions" WHERE "id" LIKE $1', [`${fixturePrefix}%`]);
  await pool.query('DELETE FROM "event_group_subscriptions" WHERE "id" LIKE $1', [`${fixturePrefix}%`]);
  await pool.query('DELETE FROM "events" WHERE "id" LIKE $1', [`${fixturePrefix}%`]);
  await pool.query('DELETE FROM "event_groups" WHERE "id" LIKE $1', [`${fixturePrefix}%`]);
  await pool.query('DELETE FROM "major_events" WHERE "id" LIKE $1', [`${fixturePrefix}%`]);
  await pool.query('DELETE FROM "people" WHERE "id" LIKE $1', [`${fixturePrefix}%`]);
}

try {
  const migrationRoot = resolve(process.cwd(), 'apps/backend/prisma/migrations');
  const migrationEntries = await readdir(migrationRoot, { withFileTypes: true });
  const looseSqlFiles = migrationEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name);
  assert.deepEqual(looseSqlFiles, [], 'Prisma migrations must not contain loose SQL files.');

  const databaseInfo = await pool.query<{ databaseName: string }>('SELECT current_database() AS "databaseName"');
  const databaseName = databaseInfo.rows[0]?.databaseName;
  assert.ok(databaseName?.toLowerCase().includes('test'), 'This test may only run against a test database.');

  const indexResult = await pool.query<{ indexName: string; indexDefinition: string }>(
    `SELECT indexname AS "indexName", indexdef AS "indexDefinition"
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname IN ('event_subscription_unique_active', 'event_group_subscription_unique_active')`,
  );
  const indexes = new Map(indexResult.rows.map((row) => [row.indexName, row.indexDefinition]));
  for (const indexName of ['event_subscription_unique_active', 'event_group_subscription_unique_active']) {
    const definition = indexes.get(indexName);
    assert.ok(definition, `${indexName} must be present.`);
    assert.match(definition, /CREATE UNIQUE INDEX/);
    assert.match(definition, /WHERE \("deletedAt" IS NULL\)/);
  }

  const constraintResult = await pool.query<{
    constraintName: string;
    constraintDefinition: string;
    validated: boolean;
  }>(
    `SELECT conname AS "constraintName",
            pg_get_constraintdef(oid) AS "constraintDefinition",
            convalidated AS validated
     FROM pg_constraint
     WHERE conrelid IN ('events'::regclass, 'major_events'::regclass, 'major_event_subscriptions'::regclass)
       AND conname IN ('events_date_check', 'major_events_date_check', 'amount_paid_positive')`,
  );
  const constraints = new Map(constraintResult.rows.map((row) => [row.constraintName, row]));
  assert.match(constraints.get('events_date_check')?.constraintDefinition ?? '', /startDate.*endDate/);
  assert.match(constraints.get('major_events_date_check')?.constraintDefinition ?? '', /startDate.*endDate/);
  assert.match(constraints.get('amount_paid_positive')?.constraintDefinition ?? '', /amountPaid.*>= 0/);
  for (const constraintName of ['events_date_check', 'major_events_date_check', 'amount_paid_positive']) {
    assert.equal(
      constraints.get(constraintName)?.validated,
      true,
      `${constraintName} should validate on a fresh database.`,
    );
  }

  const now = Date.now();
  const validStart = new Date(now + 60_000);
  const validEnd = new Date(now + 120_000);
  await pool.query(`INSERT INTO "people" ("id", "name", "updatedAt") VALUES ($1, $2, $3), ($4, $5, $6)`, [
    personId,
    'Migration integrity person',
    validStart,
    `${personId}-second`,
    'Migration integrity person 2',
    validStart,
  ]);
  await pool.query(
    `INSERT INTO "major_events" ("id", "name", "startDate", "endDate", "updatedAt") VALUES ($1, $2, $3, $4, $5)`,
    [majorEventId, 'Migration integrity major event', validStart, validEnd, validStart],
  );
  await pool.query(`INSERT INTO "event_groups" ("id", "name", "updatedAt") VALUES ($1, $2, $3)`, [
    eventGroupId,
    'Migration integrity event group',
    validStart,
  ]);
  await pool.query(
    `INSERT INTO "events" ("id", "name", "startDate", "endDate", "eventGroupId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [eventId, 'Migration integrity event', validStart, validEnd, eventGroupId, validStart],
  );

  await expectPostgresError(
    'invalid event dates',
    () =>
      pool.query(
        `INSERT INTO "events" ("id", "name", "startDate", "endDate", "updatedAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [invalidEventId, 'Invalid migration integrity event', validEnd, validStart, validStart],
      ),
    '23514',
  );
  await expectPostgresError(
    'invalid major event dates',
    () =>
      pool.query(
        `INSERT INTO "major_events" ("id", "name", "startDate", "endDate", "updatedAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [invalidMajorEventId, 'Invalid migration integrity major event', validEnd, validStart, validStart],
      ),
    '23514',
  );
  await expectPostgresError(
    'negative amount',
    () =>
      pool.query(
        `INSERT INTO "major_event_subscriptions" ("id", "majorEventId", "personId", "amountPaid", "updatedAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [`${fixturePrefix}-negative-amount`, majorEventId, personId, -1, validStart],
      ),
    '23514',
  );

  const eventSubscriptionAttempts = await Promise.allSettled([
    pool.query(`INSERT INTO "event_subscriptions" ("id", "eventId", "personId") VALUES ($1, $2, $3)`, [
      `${fixturePrefix}-event-subscription-1`,
      eventId,
      personId,
    ]),
    pool.query(`INSERT INTO "event_subscriptions" ("id", "eventId", "personId") VALUES ($1, $2, $3)`, [
      `${fixturePrefix}-event-subscription-2`,
      eventId,
      personId,
    ]),
  ]);
  assert.equal(
    eventSubscriptionAttempts.filter((result) => result.status === 'fulfilled').length,
    1,
    'Exactly one concurrent event subscription insert should succeed.',
  );
  assert.equal(
    eventSubscriptionAttempts.filter(
      (result) => result.status === 'rejected' && postgresErrorCode(result.reason) === '23505',
    ).length,
    1,
    'The losing concurrent event subscription insert should fail with a unique violation.',
  );

  const groupSubscriptionAttempts = await Promise.allSettled([
    pool.query(`INSERT INTO "event_group_subscriptions" ("id", "eventGroupId", "personId") VALUES ($1, $2, $3)`, [
      `${fixturePrefix}-group-subscription-1`,
      eventGroupId,
      `${personId}-second`,
    ]),
    pool.query(`INSERT INTO "event_group_subscriptions" ("id", "eventGroupId", "personId") VALUES ($1, $2, $3)`, [
      `${fixturePrefix}-group-subscription-2`,
      eventGroupId,
      `${personId}-second`,
    ]),
  ]);
  assert.equal(
    groupSubscriptionAttempts.filter((result) => result.status === 'fulfilled').length,
    1,
    'Exactly one concurrent event-group subscription insert should succeed.',
  );
  assert.equal(
    groupSubscriptionAttempts.filter(
      (result) => result.status === 'rejected' && postgresErrorCode(result.reason) === '23505',
    ).length,
    1,
    'The losing concurrent event-group subscription insert should fail with a unique violation.',
  );

  console.log('Prisma migration integrity checks passed.');
} finally {
  try {
    await deleteFixtures();
  } finally {
    await pool.end();
  }
}
