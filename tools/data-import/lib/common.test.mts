import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  decodePrismaPostgresUrl,
  normalizeWgs84Coordinates,
  sanitizePostgresUrl,
  resolveDatabaseUrlFromEnvOptions,
} from './common.mts';

test('normalizes only complete WGS 84 coordinate pairs', () => {
  assert.deepEqual(normalizeWgs84Coordinates(-22.1211, -51.4086), {
    latitude: -22.1211,
    longitude: -51.4086,
  });
  assert.deepEqual(normalizeWgs84Coordinates(null, null), { latitude: null, longitude: null });
  assert.throws(() => normalizeWgs84Coordinates(-22.1, null, 'event legacy-1'), /both latitude and longitude/);
  assert.throws(() => normalizeWgs84Coordinates(-91, -51.4, 'event legacy-1'), /latitude outside/);
  assert.throws(() => normalizeWgs84Coordinates(-22.1, 181, 'event legacy-1'), /longitude outside/);
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
