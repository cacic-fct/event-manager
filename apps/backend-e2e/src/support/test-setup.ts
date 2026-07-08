import axios from 'axios';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';

let app: INestApplication | undefined;

beforeAll(async () => {
  ensureBackendE2eEnvironment();
  const { createBackendHttpApp } =
    require('@cacic-fct/backend/http-app') as typeof import('@cacic-fct/backend/http-app');
  app = await createBackendHttpApp();
  await app.listen(0);

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
