import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import pg from 'pg';
import type { Client as PgClient } from 'pg';

const { Client } = pg;

const UNSUPPORTED_POSTGRES_URL_PARAMS = new Set([
  'schema',
  'connection_limit',
  'pool_timeout',
  'max_idle_connection_lifetime',
  'socket_timeout',
]);

export interface DatabaseOptions {
  databaseUrl?: string;
  dbUser?: string;
  dbPassword?: string;
  dbHost?: string;
  dbPort?: number | string;
  dbName?: string;
  envFile?: string;
}

interface JsonObject {
  [key: string]: unknown;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value && typeof value.code === 'string';
}

export function databaseUrlFromOptions(options: DatabaseOptions = {}): string {
  if (options?.databaseUrl) return options.databaseUrl;

  const user = encodeURIComponent(options?.dbUser ?? 'postgres');
  const password = encodeURIComponent(options?.dbPassword ?? 'postgres');
  const host = options?.dbHost ?? 'localhost';
  const port = options?.dbPort ?? 5432;
  const name = options?.dbName ?? 'postgres';
  return `postgresql://${user}:${password}@${host}:${port}/${name}`;
}

export function connectPostgres(databaseUrl: string): Promise<PgClient> {
  const client = new Client({ connectionString: databaseUrl });
  return client.connect().then(() => client);
}

export function chunks<T>(items: readonly T[], size: number): IterableIterator<T[]> {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('Chunk size must be a positive integer.');
  }

  return (function* chunkGenerator() {
    for (let index = 0; index < items.length; index += size) {
      yield items.slice(index, index + size);
    }
  })();
}

export function formatCounter(
  counter: ReadonlyMap<string, number> | Readonly<Record<string, number>> | null | undefined,
): string {
  const entries = counter instanceof Map ? [...counter.entries()] : Object.entries(counter ?? {});
  if (entries.length === 0) return 'none';
  return entries.sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join(', ');
}

export function parseEnvFile(envPath: string): Record<string, string> {
  let content;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(`.env file not found: ${envPath}`);
    }
    throw error;
  }

  const values: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const separator = line.indexOf('=');
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function decodePrismaPostgresUrl(prismaUrl: string): string {
  const parsed = new URL(prismaUrl);
  const apiKey = parsed.searchParams.get('api_key') ?? '';
  if (!apiKey) {
    throw new Error('DATABASE_URL uses prisma+postgres but does not contain api_key with databaseUrl.');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(apiKey, 'base64url').toString('utf8'));
  } catch (error) {
    throw new Error('Could not decode databaseUrl from prisma+postgres DATABASE_URL.', { cause: error });
  }
  if (!isJsonObject(payload) || typeof payload.databaseUrl !== 'string' || !payload.databaseUrl) {
    throw new Error('Could not decode databaseUrl from prisma+postgres DATABASE_URL.');
  }
  return payload.databaseUrl;
}

export function sanitizePostgresUrl(databaseUrl: string): string {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') return databaseUrl;

  for (const key of UNSUPPORTED_POSTGRES_URL_PARAMS) parsed.searchParams.delete(key);
  return parsed.toString();
}

export function resolveDatabaseUrlFromEnvOptions(options: Pick<DatabaseOptions, 'databaseUrl' | 'envFile'> = {}): string {
  if (options?.databaseUrl) return options.databaseUrl;
  const envPath = options?.envFile ?? '.env';
  const envValues = parseEnvFile(envPath);
  let databaseUrl = (envValues.DATABASE_URL ?? '').trim();
  if (!databaseUrl) throw new Error(`DATABASE_URL is missing in ${envPath}`);
  if (databaseUrl.startsWith('prisma+postgres://')) databaseUrl = decodePrismaPostgresUrl(databaseUrl);
  return sanitizePostgresUrl(databaseUrl);
}

export function isMain(importMetaUrl: string, entryPoint: string | undefined = process.argv[1]): boolean {
  if (!entryPoint) return false;
  try {
    return resolve(fileURLToPath(importMetaUrl)) === resolve(entryPoint);
  } catch {
    return importMetaUrl === pathToFileURL(entryPoint).href;
  }
}
