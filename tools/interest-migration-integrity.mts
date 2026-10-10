import assert from 'node:assert/strict';
import type { Pool } from 'pg';

export async function assertInterestMigrationIntegrity(
  pool: Pool,
  fixture: { prefix: string; eventId: string; eventGroupId: string; majorEventId: string; personId: string },
): Promise<void> {
  const { prefix, eventId, eventGroupId, majorEventId, personId } = fixture;
  const now = new Date();
  const insert = (id: string, event: string | null, group: string | null, major: string | null) => pool.query(
    `INSERT INTO "event_interests" ("id", "personId", "eventId", "eventGroupId", "majorEventId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`, [id, personId, event, group, major, now],
  );
  const hasCode = (expected: string) => (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === expected;
  await assert.rejects(insert(`${prefix}-no-target`, null, null, null), hasCode('23514'));
  await assert.rejects(insert(`${prefix}-two-targets`, eventId, null, majorEventId), hasCode('23514'));
  await insert(`${prefix}-interest-1`, eventId, null, null);
  await assert.rejects(insert(`${prefix}-interest-2`, eventId, null, null), hasCode('23505'));

  const registrations = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM "event_subscriptions" WHERE "personId" = $1', [personId],
  );
  assert.equal(registrations.rows[0].count, '0', 'Interest must not manufacture a registration.');
  await pool.query('UPDATE "event_interests" SET "deletedAt" = $1 WHERE "id" = $2', [now, `${prefix}-interest-1`]);
  await insert(`${prefix}-interest-2`, eventId, null, null);
  await insert(`${prefix}-group-interest`, null, eventGroupId, null);
  await insert(`${prefix}-major-interest`, null, null, majorEventId);

  const defaults = await pool.query<{ major: string; event: string | null; group: string | null }>(
    `SELECT major."attendanceEligibility" AS major, event."attendanceEligibility" AS event,
            event_group."attendanceEligibility" AS "group"
     FROM "major_events" major, "events" event, "event_groups" event_group
     WHERE major.id = $1 AND event.id = $2 AND event_group.id = $3`, [majorEventId, eventId, eventGroupId],
  );
  assert.deepEqual(defaults.rows[0], { major: 'APPROVED_REGISTRATIONS_ONLY', event: null, group: null });

  const certificateCriterion = await pool.query<{ nullable: string; defaultValue: string | null }>(
    `SELECT is_nullable AS nullable, column_default AS "defaultValue"
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'certificate_configs'
       AND column_name = 'attendeeEligibility'`,
  );
  assert.deepEqual(certificateCriterion.rows, [{ nullable: 'YES', defaultValue: null }],
    'Certificates must inherit granular event rules unless an additional criterion is explicitly selected.');

  await pool.query(`INSERT INTO "event_forms" ("id", "name", "ownerEventId", "elements", "updatedAt")
    VALUES ($1, 'Interest audience fixture', $2, '[]'::jsonb, $3)`, [`${prefix}-form`, eventId, now]);
  await pool.query(`INSERT INTO "event_form_links" ("id", "formId", "targetType", "eventId", "updatedAt")
    VALUES ($1, $2, 'EVENT', $3, $4)`, [`${prefix}-link`, `${prefix}-form`, eventId, now]);
  const audience = await pool.query<{ audiences: string[] }>('SELECT "audiences"::text[] AS audiences FROM "event_form_links" WHERE id = $1', [`${prefix}-link`]);
  assert.deepEqual(audience.rows[0].audiences, ['SUBSCRIBERS', 'ATTENDEES']);
  await pool.query(`UPDATE "event_form_links" SET "audiences" = ARRAY['INTERESTED', 'SUBSCRIBERS']::"EventFormAudience"[] WHERE id = $1`, [`${prefix}-link`]);
  await assert.rejects(pool.query(`UPDATE "event_form_links" SET "audiences" = ARRAY[]::"EventFormAudience"[] WHERE id = $1`, [`${prefix}-link`]), hasCode('23514'));
}
