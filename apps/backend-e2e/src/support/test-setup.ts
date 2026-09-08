import axios from 'axios';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';

let app: INestApplication | undefined;

beforeAll(async () => {
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

function ensureBackendE2eEnvironment(): void {
  process.env['NODE_ENV'] ??= 'test';
  process.env['BACKEND_E2E_IN_MEMORY_INFRA'] ??= 'true';
  process.env['DATABASE_URL'] ??= 'postgresql://postgres:postgres@localhost:5432/fct_app_test';
  process.env['REDIS_URL'] ??= 'redis://localhost:6379';
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
