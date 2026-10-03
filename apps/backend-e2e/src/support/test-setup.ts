import axios from 'axios';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';

let app: INestApplication | undefined;

beforeAll(async () => {
  const currentTestPath = (expect.getState() as unknown as { testPath?: string }).testPath ?? '';
  const isTicketingHttpSpec = currentTestPath.includes('ticketing.spec.ts');
  if (isTicketingHttpSpec && process.env['TICKETING_HTTP_E2E_TEST'] !== '1') return;
  if (process.env['TICKETING_HTTP_E2E_TEST'] === '1') {
    useTicketingDisposableDatabase();
    process.env['BACKEND_E2E_IN_MEMORY_INFRA'] = 'true';
    process.env['BACKEND_E2E_REQUIRE_REAL_INFRA'] = 'false';
  }
  ensureBackendE2eEnvironment();
  const { createBackendHttpApp } =
    require('@cacic-fct/backend/http-app') as typeof import('@cacic-fct/backend/http-app');
  app = await createBackendHttpApp();
  await app.listen(0);
  await assertRealInfrastructureWhenRequested();

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error('Expected backend E2E server to expose a listen address.');
  }

  axios.defaults.baseURL = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app?.close();
  app = undefined;
  axios.defaults.baseURL = undefined;
});

export function getBackendE2eApp(): INestApplication {
  if (!app) throw new Error('The backend E2E application is not running for this test file.');
  return app;
}

function ensureBackendE2eEnvironment(): void {
  process.env['NODE_ENV'] ??= 'test';
  process.env['BACKEND_E2E_IN_MEMORY_INFRA'] ??= 'true';
  process.env['DATABASE_URL'] ??= 'postgresql://postgres:postgres@localhost:5432/fct_app_test';
  process.env['REDIS_URL'] ??= 'redis://localhost:6379';
}

function useTicketingDisposableDatabase(): void {
  const databaseUrl = process.env['TICKETING_TEST_DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('Set TICKETING_TEST_DATABASE_URL to the disposable fct_app_ticketing_test database.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('TICKETING_TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('TICKETING_TEST_DATABASE_URL must use PostgreSQL.');
  }
  if (databaseName !== 'fct_app_ticketing_test') {
    throw new Error('Ticketing HTTP E2E only runs against the fct_app_ticketing_test database.');
  }
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error('Ticketing HTTP E2E requires a loopback-hosted disposable database.');
  }

  process.env['DATABASE_URL'] = databaseUrl;
}

async function assertRealInfrastructureWhenRequested(): Promise<void> {
  if (process.env['BACKEND_E2E_REQUIRE_REAL_INFRA'] !== 'true') {
    return;
  }

  if (process.env['BACKEND_E2E_IN_MEMORY_INFRA'] === 'true') {
    throw new Error('Real backend E2E infrastructure was requested but in-memory infrastructure is enabled.');
  }

  const redis = app?.get(Redis);
  if (!redis || redis.constructor.name === 'InMemoryRedisClient') {
    throw new Error('Real backend E2E infrastructure was requested but the Redis provider is in memory.');
  }
  await redis.ping();
}
