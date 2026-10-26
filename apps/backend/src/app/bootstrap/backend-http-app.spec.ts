import { jest as jestEsm } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
const { jest } = import.meta;

jestEsm.unstable_mockModule('../app.module', () => ({ AppModule: class AppModule {} }));

const { configureBackendHttpApp, createBackendHttpApp } = await import('./backend-http-app');

describe('createBackendHttpApp ownership', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])(
    'closes an allocated app and preserves configuration failure (cleanup fails: %s)',
    async (cleanupFails) => {
      const original = new Error('configuration failed');
      const close = cleanupFails
        ? jest.fn().mockRejectedValue(new Error('cleanup failed'))
        : jest.fn().mockResolvedValue(undefined);
      const app = {
        getHttpAdapter: () => {
          throw original;
        },
        close,
      };
      jest.spyOn(NestFactory, 'create').mockResolvedValue(app as never);
      const errorLog = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);

      await expect(createBackendHttpApp()).rejects.toBe(original);

      expect(close).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledTimes(cleanupFails ? 1 : 0);
    },
  );
});

describe('configured HTTP raw-body preservation', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const http = express();
    const app = {
      getHttpAdapter: () => ({ getInstance: () => http }),
      use: http.use.bind(http),
      setGlobalPrefix: jest.fn(),
      get: jest.fn(() => ({})),
      enableCors: jest.fn(),
    };
    jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
    configureBackendHttpApp(app as never);
    http.get('/api/sports/public/teams/team-1/logo/hash', (_request, response) => {
      response.type('image/png').send('logo');
    });
    for (const route of [
      '/api/signed-webhook',
      '/api/admin/data-transfer/preview',
      '/api/a/glitchtip',
      '/api/current-user/certificates/archive.zip',
    ]) {
      http.post(route, (request, response) => {
        const rawBody = (request as typeof request & { rawBody?: Buffer }).rawBody;
        response.json({ rawBody: rawBody?.toString('utf8'), body: request.body });
      });
    }
    await new Promise<void>((resolve) => {
      server = http.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    jest.restoreAllMocks();
  });

  it.each([
    '/api/graphql',
    '/api/auth/login',
    '/api/docs',
    '/api/current-user/certificates/archive.zip',
    '/api/sports/public/matches/match-1/overlay',
    '/api/realtime/public/catalog/events',
  ])('marks API and operational responses as noindex at %s, including errors', async (route) => {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('also excludes public API image assets from indexing', async () => {
    const response = await fetch(`${baseUrl}/api/sports/public/teams/team-1/logo/hash`);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it.each(['/api/signed-webhook', '/api/admin/data-transfer/preview'])(
    'preserves the exact JSON bytes at %s for downstream signature verification',
    async (route) => {
      const body = ' { "name" : "Ação 💻", "enabled": true } ';
      const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ rawBody: body, body: { name: 'Ação 💻', enabled: true } });
    },
  );

  it('retains form-body bytes while decoding fields for existing integrations', async () => {
    const body = 'name=A%C3%A7%C3%A3o&enabled=true';
    const response = await fetch(`${baseUrl}/api/signed-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rawBody: body, body: { name: 'Ação', enabled: 'true' } });
  });

  it('accepts a large certificate selection without relaxing unrelated request limits', async () => {
    const body = JSON.stringify({
      certificateIds: Array.from({ length: 10000 }, (_, index) => `certificate-${index}`),
    });
    const selected = await fetch(`${baseUrl}/api/current-user/certificates/archive.zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(selected.status).toBe(200);
    expect((await selected.json()).body.certificateIds).toHaveLength(10000);
    const unrelated = await fetch(`${baseUrl}/api/signed-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(unrelated.status).toBe(413);
    expect(unrelated.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('keeps Sentry envelope content intact after selecting the JSON parser', async () => {
    const body = '{"event_id":"test-event"}\n{"type":"event"}\n{"message":"Ação 💻"}';
    const response = await fetch(`${baseUrl}/api/a/glitchtip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rawBody: body, body: Buffer.from(body).toJSON() });
  });
});
