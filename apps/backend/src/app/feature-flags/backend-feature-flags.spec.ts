import { ConfigService } from '@nestjs/config';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { BACKEND_FEATURE_FLAGS, BackendFeatureFlagService } from './backend-feature-flags';
const { jest } = import.meta;

describe('BackendFeatureFlagService', () => {
  it('requests identity encoding and reads toggles if the proxy sends gzip anyway', async () => {
    const encodings: (string | undefined)[] = [];
    const body = gzipSync(
      JSON.stringify({
        toggles: [{ name: BACKEND_FEATURE_FLAGS.onlineAttendanceNotificationsEnabled, enabled: true }],
      }),
    );
    const server = createServer((request, response) => {
      encodings.push(request.headers['accept-encoding']);
      response.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
      response.end(body);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Expected a TCP address for the Unleash test server.');
    }
    const service = new BackendFeatureFlagService(
      new ConfigService({
        UNLEASH_BACKEND_API_URL: `http://127.0.0.1:${address.port}/api/frontend`,
        UNLEASH_BACKEND_CLIENT_KEY: 'test-client-key',
      }),
    );

    try {
      await service.onModuleInit();
      expect(encodings).toEqual(['identity']);
      expect(service.isEnabled('onlineAttendanceNotificationsEnabled')).toBe(true);
    } finally {
      service.onModuleDestroy();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('uses fail-safe defaults while asynchronous initialization is pending', async () => {
    const service = new BackendFeatureFlagService({
      get: jest.fn((key: string, fallback?: string) =>
        key === 'UNLEASH_BACKEND_CLIENT_KEY' ? 'client-key' : fallback,
      ),
    } as never);
    let resolveStart!: () => void;
    const start = new Promise<void>((resolve) => {
      resolveStart = resolve;
    });
    (service as unknown as { startClient: () => Promise<void> }).startClient = async () => {
      await start;
      (service as unknown as { initialized: boolean }).initialized = true;
    };

    const initialization = service.onModuleInit();
    expect(service.isEnabled('onlineAttendanceNotificationsEnabled')).toBe(false);
    resolveStart();
    await initialization;
    expect(service.isEnabled('onlineAttendanceNotificationsEnabled')).toBe(false);
  });

  it('keeps notifications disabled when no provider key is configured', async () => {
    const service = new BackendFeatureFlagService({ get: jest.fn(() => undefined) } as never);
    await service.onModuleInit();
    expect(service.isEnabled('requiredSubscriptionFormNotificationsEnabled')).toBe(false);
    expect(() => service.onModuleDestroy()).not.toThrow();
  });
});
