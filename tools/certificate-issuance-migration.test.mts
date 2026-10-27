import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../apps/backend/prisma/migrations/20261027010000_certificate_issuance_runs/migration.sql', import.meta.url),
  'utf8',
);

test('certificate issuance migration preserves historical revocations, recipients, and the one-active-run constraint', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      CREATE TABLE people (id TEXT PRIMARY KEY);
      CREATE TABLE certificate_configs (id TEXT PRIMARY KEY, "issuedTo" TEXT NOT NULL);
      CREATE TABLE certificates (
        id TEXT PRIMARY KEY, "configId" TEXT NOT NULL, "personId" TEXT NOT NULL,
        "issuedById" TEXT, "deletedAt" TIMESTAMP(3), "lgpdDeletionRequestId" TEXT
      );
      INSERT INTO people VALUES ('active-person'), ('removed-person');
      INSERT INTO certificate_configs VALUES ('manual', 'OTHER'), ('automatic', 'ATTENDEE');
      INSERT INTO certificates VALUES
        ('active-certificate', 'manual', 'active-person', 'admin', NULL, NULL),
        ('removed-certificate', 'manual', 'removed-person', 'admin', CURRENT_TIMESTAMP, NULL);
    `);
    await database.exec(migration);
    const historical = await database.query<{ revocationReason: string; revokedAt: Date }>(
      'SELECT "revocationReason", "revokedAt" FROM certificates WHERE id = $1',
      ['removed-certificate'],
    );
    assert.equal(historical.rows[0].revocationReason, 'ADMIN');
    assert.ok(historical.rows[0].revokedAt);
    const recipients = await database.query<{ personId: string }>(
      'SELECT "personId" FROM certificate_manual_recipients',
    );
    assert.deepEqual(recipients.rows, [{ personId: 'active-person' }]);

    const insert = `INSERT INTO certificate_issuance_runs (id, "configId", "configUpdatedAt", "updatedAt") VALUES ($1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
    await database.query(insert, ['first-run']);
    await assert.rejects(database.query(insert, ['duplicate-run']), /certificate_issuance_runs_active_config_key/);
    await database.exec(`UPDATE certificate_issuance_runs SET status = 'COMPLETED' WHERE id = 'first-run'`);
    await database.query(insert, ['second-run']);
    await database.exec(`UPDATE certificate_issuance_runs SET status = 'PROCESSING' WHERE id = 'second-run'`);
    await assert.rejects(database.query(insert, ['third-run']), /certificate_issuance_runs_active_config_key/);
    await database.exec(`UPDATE certificate_issuance_runs SET status = 'CANCELLED' WHERE id = 'second-run'`);
    await database.query(insert, ['third-run']);
    await database.transaction(async (transaction) => {
      await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['["manual","active-person"]']);
    });
  } finally {
    await database.close();
  }
});
