import { BackendFeatureFlagService } from './backend-feature-flags';

describe('BackendFeatureFlagService', () => {
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
