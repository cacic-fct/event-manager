import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  chunks,
  databaseUrlFromOptions,
  decodePrismaPostgresUrl,
  formatCounter,
  sanitizePostgresUrl,
  resolveDatabaseUrlFromEnvOptions,
} from './common.mts';

test('builds a PostgreSQL URL from the shared defaults and options', () => {
  assert.equal(databaseUrlFromOptions({}), 'postgresql://postgres:postgres@localhost:5432/postgres');
  assert.equal(
    databaseUrlFromOptions({ dbUser: 'user@example.com', dbPassword: 'p@ss word', dbHost: 'db', dbPort: 5433, dbName: 'fct' }),
    'postgresql://user%40example.com:p%40ss%20word@db:5433/fct',
  );
  assert.equal(databaseUrlFromOptions({ databaseUrl: 'postgresql://direct/db' }), 'postgresql://direct/db');
});

test('decodes and sanitizes Prisma PostgreSQL URLs', () => {
  const nested = 'postgresql://user:password@db:5432/app?schema=public&sslmode=require';
  const encoded = Buffer.from(JSON.stringify({ databaseUrl: nested }), 'utf8').toString('base64url');
  assert.equal(decodePrismaPostgresUrl(`prisma+postgres://accelerate.prisma-data.net/?api_key=${encoded}`), nested);
  assert.equal(sanitizePostgresUrl(nested), 'postgresql://user:password@db:5432/app?sslmode=require');
});

test('resolves a DATABASE_URL from the requested env file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fct-data-import-'));
  const path = join(directory, '.env');
  writeFileSync(path, 'DATABASE_URL="postgresql://user:password@db/app?schema=public"\n');
  try {
    assert.equal(resolveDatabaseUrlFromEnvOptions({ envFile: path }), 'postgresql://user:password@db/app');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('chunks arrays and formats sorted counters', () => {
  assert.deepEqual([...chunks([1, 2, 3, 4, 5], 2)], [[1, 2], [3, 4], [5]]);
  assert.equal(formatCounter(new Map([['REGULAR', 2], ['NON_PAYING', 1]])), 'NON_PAYING=1, REGULAR=2');
  assert.throws(() => [...chunks([1], 0)], /positive integer/);
});
