import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  decimalToCents,
  decimalToInt,
  normalizePersonName,
  parseInsertRowsByTable,
  parseMysqlDate,
  parseMysqlDatetime,
  parseMysqlTime,
  parseSqlLiteral,
  parseValuesBlock,
} from './legacy-sql.mts';

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
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  const dateText = date.toISOString().slice(0, 10);
  const dateTimeText = `${dateText} 14:30:00`;
  assert.equal(parseMysqlDate(dateText)?.toISOString(), `${dateText}T00:00:00.000Z`);
  assert.deepEqual(parseMysqlTime('14:30'), { hours: 14, minutes: 30, seconds: 0 });
  assert.equal(parseMysqlDatetime(dateTimeText)?.toISOString(), `${dateText}T14:30:00.000Z`);
  assert.equal(normalizePersonName('MARIA DA SILVA II'), 'Maria da Silva II');
});

test('truncates decimal text without floating-point rounding', () => {
  assert.equal(decimalToInt('1.999999999999999999'), 1);
  assert.equal(decimalToInt('9007199254740992'), null);
});

test('converts BRL amounts to integer centavos without truncating decimals', () => {
  assert.equal(decimalToCents('0'), 0);
  assert.equal(decimalToCents('50'), 5000);
  assert.equal(decimalToCents('19.9'), 1990);
  assert.equal(decimalToCents('19.99'), 1999);
  assert.equal(decimalToCents('21474836.47'), 2147483647);
  assert.equal(decimalToCents('1.999'), null);
  assert.equal(decimalToCents('-1.00'), null);
  assert.equal(decimalToCents('21474836.48'), null);
});
