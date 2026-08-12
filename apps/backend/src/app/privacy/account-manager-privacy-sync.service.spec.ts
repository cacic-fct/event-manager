import type { AccountManagerGrpcClient } from '../grpc/account-manager-grpc.client';
import {
  AccountManagerPrivacySyncService,
  createEventManagerDefaultPrivacySettings,
} from './account-manager-privacy-sync.service';

describe('AccountManagerPrivacySyncService', () => {
  const accountManager = {
    recordCookieConsent: jest.fn(),
    getPrivacySettings: jest.fn(),
  };
  const service = new AccountManagerPrivacySyncService(accountManager as unknown as AccountManagerGrpcClient);

  beforeEach(() => jest.clearAllMocks());

  it('records cookie consent through the gRPC client', async () => {
    accountManager.recordCookieConsent.mockResolvedValue(undefined);
    await expect(service.recordCookieConsent('user-1')).resolves.toBeUndefined();
    expect(accountManager.recordCookieConsent).toHaveBeenCalledWith('user-1');
  });

  it('maps Account Manager settings over Event Manager defaults', async () => {
    accountManager.getPrivacySettings.mockResolvedValue([
      {
        settingType: 'analytics_tracking',
        enabled: false,
        lastUpdated: '2026-07-25T10:00:00.000Z',
      },
      {
        settingType: 'cookie_banner_accepted',
        enabled: true,
        lastUpdated: '2026-07-25T11:00:00.000Z',
      },
    ]);

    await expect(service.getUserPrivacySettings('user-1')).resolves.toMatchObject({
      userId: 'user-1',
      settings: {
        ...createEventManagerDefaultPrivacySettings(),
        analytics_tracking: false,
        cookie_banner_accepted: true,
      },
      updatedAt: new Date('2026-07-25T11:00:00.000Z'),
    });
  });

  it('enables analytics and monitoring when Account Manager omits settings', async () => {
    accountManager.getPrivacySettings.mockResolvedValue([]);

    await expect(service.getUserPrivacySettings('user-1')).resolves.toMatchObject({
      settings: {
        analytics_tracking: true,
        error_debugging: true,
        performance_monitoring: true,
        cookie_banner_accepted: false,
      },
    });
  });

  it('uses the fallback timestamp when Account Manager returns an invalid update timestamp', async () => {
    const before = Date.now();
    accountManager.getPrivacySettings.mockResolvedValue([
      {
        settingType: 'analytics_tracking',
        enabled: false,
        lastUpdated: 'not-a-date',
      },
    ]);

    const result = await service.getUserPrivacySettings('user-1');

    expect(result.settings.analytics_tracking).toBe(false);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.updatedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
