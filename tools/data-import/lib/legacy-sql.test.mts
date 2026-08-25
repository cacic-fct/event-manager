import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  deterministicPrefixedId,
  decimalToInt,
  normalizePersonName,
  parseInsertRowsByTable,
  parseMysqlDate,
  parseMysqlDatetime,
  parseMysqlTime,
  parseSqlLiteral,
  parseValuesBlock,
  writeLegacySqlPayload,
} from './legacy-sql.mts';
import type { LegacyImportPayload, LegacyPostgresClient } from './legacy-sql.mts';

test('parses quoted parentheses, commas, escapes, and NULL values', () => {
  assert.deepEqual(parseValuesBlock("(1,'Ana (teste), D\\'Ávila',NULL),(2,'a''b',-3.50)"), [
    [1, "Ana (teste), D'Ávila", null],
    [2, "a'b", '-3.50'],
  ]);
});

test('decodes backslash escapes once so literal backslashes are preserved', () => {
  assert.equal(parseSqlLiteral(String.raw`'C:\\temp'`), String.raw`C:\temp`);
});

test('reads expected INSERT tables and ignores malformed row widths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'legacy-sql-'));
  const path = join(directory, 'dump.sql');
  await writeFile(
    path,
    "INSERT INTO `users` (`idUser`,`name`) VALUES (1,'Ana; A'),(2,'B');\nINSERT INTO `ignored` (`id`) VALUES (3);",
    'utf8',
  );
  try {
    const parsed = await parseInsertRowsByTable(path, new Set(['users']));
    assert.deepEqual(parsed.users, [
      { idUser: 1, name: 'Ana; A' },
      { idUser: 2, name: 'B' },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('parses MySQL temporal values as UTC and normalizes legacy names', () => {
  assert.equal(parseMysqlDate('2026-08-16')?.toISOString(), '2026-08-16T00:00:00.000Z');
  assert.deepEqual(parseMysqlTime('14:30'), { hours: 14, minutes: 30, seconds: 0 });
  assert.equal(parseMysqlDatetime('2026-08-16 14:30:00')?.toISOString(), '2026-08-16T14:30:00.000Z');
  assert.equal(normalizePersonName('MARIA DA SILVA II'), 'Maria da Silva II');
});

test('keeps the old URL-namespace UUIDv5 seed contract', () => {
  assert.equal(
    deterministicPrefixedId('SYCOMPP-1-', 'legacy1-major-sub:1:2'),
    'SYCOMPP-1-49fb14d1-1ed1-57c1-9e8c-7d3599764c8d',
  );
});

test('truncates decimal text without floating-point rounding', () => {
  assert.equal(decimalToInt('1.999999999999999999'), 1);
  assert.equal(decimalToInt('9007199254740992'), null);
});

test('commits successful writes and rolls back failed writes with an injected client', async () => {
  const emptyPayload: LegacyImportPayload = {
    majorEvents: [],
    eventGroups: [],
    events: [],
    people: [],
    majorEventSubscriptions: [],
    eventSubscriptions: [],
    eventAttendances: [],
    eventLecturers: [],
    skippedMajorSubscriptions: 0,
    skippedEventSubscriptions: 0,
    skippedAttendances: 0,
    skippedLecturers: 0,
  };
  const successfulQueries: string[] = [];
  const successfulClient: LegacyPostgresClient = {
    async query(text: string) {
      successfulQueries.push(text);
      return { rows: [] };
    },
  };
  await writeLegacySqlPayload(successfulClient, structuredClone(emptyPayload));
  assert.deepEqual(successfulQueries, ['BEGIN', 'COMMIT']);

  const failedQueries: string[] = [];
  const failedClient: LegacyPostgresClient = {
    async query(text: string) {
      failedQueries.push(text);
      if (text === 'COMMIT') throw new Error('commit failed');
      return { rows: [] };
    },
  };
  await assert.rejects(writeLegacySqlPayload(failedClient, structuredClone(emptyPayload)), /commit failed/);
  assert.deepEqual(failedQueries, ['BEGIN', 'COMMIT', 'ROLLBACK']);
});
