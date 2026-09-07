import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyUpdates,
  selectChangedAttendances,
  buildLegacyAttendances,
  parseArgs,
  resolveLectureCategory,
  resolveShortcourseCategory,
} from './reevaluate-secompp-attendance-categories.mts';

test('supports CLI help and inline values containing equals signs', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(
    parseArgs(['--database-url=postgresql://db/app?options=a=b']).databaseUrl,
    'postgresql://db/app?options=a=b',
  );
});

test('resolves payment and subscription category precedence', () => {
  const paymentRequired = new Set([10]);
  const paid = new Set(['1\u000010']);
  const confirmedShortcourse = new Set(['1\u000010\u00002']);
  assert.equal(resolveLectureCategory(2, 10, paymentRequired, paid), 'NON_PAYING');
  assert.equal(resolveLectureCategory(1, 10, paymentRequired, paid), 'REGULAR');
  assert.equal(resolveShortcourseCategory(2, 10, 2, paymentRequired, paid, confirmedShortcourse), 'NON_PAYING');
  assert.equal(resolveShortcourseCategory(1, 10, 2, paymentRequired, paid, confirmedShortcourse), 'REGULAR');
  assert.equal(resolveShortcourseCategory(1, 11, 2, new Set(), paid, confirmedShortcourse), 'NON_SUBSCRIBED');
});

test('builds and deduplicates legacy attendance intents', () => {
  const parsed = {
    users: [
      { idUser: 1, idDetailFK: 7 },
      { idUser: 2, idDetailFK: 7 },
    ],
    lectures: [{ idLecture: 3, idEventFK: 10 }],
    shortcourses: [{ idShortcourse: 4, idEventFK: 10 }],
    users_registered: [{ idUserFK: 1, idEventFK: 10, amount: 25, status: 'S' }],
    users_registered_shortcourses: [{ idUserFK: 1, idEventFK: 10, idShortcourseFK: 4, status: 'S' }],
    presence_lectures: [
      { idUserFK: 1, idLectureFK: 3 },
      { idUserFK: 2, idLectureFK: 3 },
    ],
    presence_shortcourses: [{ idUserFK: 1, idShortcourseFK: 4 }],
  };
  const result = buildLegacyAttendances(parsed);
  assert.equal(result.skippedAttendances, 0);
  assert.equal(result.legacyAttendances.length, 2);
  assert.deepEqual(result.legacyAttendances.map((row) => row.category).sort(), ['NON_PAYING', 'REGULAR']);
  const attendance = result.legacyAttendances[0];
  assert.ok(attendance);
  assert.equal(attendance.eventId.startsWith('SYSCOMPP-1-event-'), true);
});

test('writes replacement categories with assessments and skips an unchanged rerun', async () => {
  const parsed = {
    users: [{ idUser: 1, idDetailFK: 7 }],
    lectures: [{ idLecture: 3, idEventFK: 10 }],
    shortcourses: [{ idShortcourse: 4, idEventFK: 11 }],
    users_registered: [{ idUserFK: 2, idEventFK: 10, amount: 25, status: 'S' }],
    users_registered_shortcourses: [],
    presence_lectures: [{ idUserFK: 1, idLectureFK: 3 }],
    presence_shortcourses: [{ idUserFK: 1, idShortcourseFK: 4 }],
  };
  const rows = buildLegacyAttendances(parsed).legacyAttendances.map((row) => ({ ...row, personId: 'p1' }));
  const saved: Record<string, unknown>[] = [];
  const db = {
    async query<Row = Record<string, unknown>>(sql: string, parameters?: readonly unknown[]) {
      if (sql.startsWith('UPDATE')) {
        assert.match(sql, /"currentAssessment" = \$4::"AttendanceCurrentAssessment"/);
        assert.equal(parameters?.[0], 'NON_REGULAR');
        saved.push({ category: parameters?.[0], personId: parameters?.[1], eventId: parameters?.[2], currentAssessment: parameters?.[3] });
        return { rows: [] as Row[] };
      }
      return { rows: saved as Row[] };
    },
  };
  await applyUpdates(db, rows);
  assert.deepEqual(saved.map((row) => row.currentAssessment).sort(), ['ACTIVITY_SUBSCRIPTION_MISSING', 'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED']);
  assert.deepEqual(await selectChangedAttendances(db, rows, true), []);
  const firstSaved = saved[0];
  assert.ok(firstSaved);
  firstSaved.currentAssessment = 'REQUIREMENTS_CURRENTLY_MET';
  assert.equal((await selectChangedAttendances(db, rows, true)).length, 1);
  assert.deepEqual(await selectChangedAttendances(db, rows), []);
});
