import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
