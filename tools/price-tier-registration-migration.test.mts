import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = await readFile(
  new URL(
    '../apps/backend/prisma/migrations/20261012000000_price_tier_registration_rules/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

test('tier migration preserves existing rows and accepts zero and unlimited limits', async () => {
  const database = new PGlite();
  try {
    await database.exec('CREATE TABLE "price_tiers" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL);');
    await database.query('INSERT INTO "price_tiers" VALUES ($1, $2)', ['legacy', 'Aluno']);
    await database.exec(migrationSql);
    const { rows } = await database.query('SELECT * FROM "price_tiers"');
    assert.deepEqual(rows, [
      {
        id: 'legacy',
        name: 'Aluno',
        restrictEventSelection: false,
        allowedEventIds: [],
        customizeSubscriptionLimits: false,
        maxCoursesPerAttendee: null,
        maxLecturesPerAttendee: null,
        maxUncategorizedPerAttendee: null,
      },
    ]);
    await database.exec(`UPDATE "price_tiers" SET "customizeSubscriptionLimits" = true,
      "maxCoursesPerAttendee" = 0, "maxLecturesPerAttendee" = 3;`);
    for (const column of ['maxCoursesPerAttendee', 'maxLecturesPerAttendee', 'maxUncategorizedPerAttendee']) {
      await assert.rejects(database.exec(`UPDATE "price_tiers" SET "${column}" = -1`));
    }
  } finally {
    await database.close();
  }
});
