import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AccountManagerPrivacySyncService } from './account-manager-privacy-sync.service';
import { TrackingController } from './tracking.controller';

describe('TrackingController', () => {
  let accountManagerPrivacySync: {
    getUserPrivacySettings: jest.Mock;
  };
  let controller: TrackingController;

  beforeEach(() => {
    accountManagerPrivacySync = {
      getUserPrivacySettings: jest.fn(),
    };

    controller = new TrackingController(
      accountManagerPrivacySync as unknown as AccountManagerPrivacySyncService,
      createConfigService(),
    );
  });

  it('refreshes shared tracking cookies from Account Manager privacy settings', async () => {
    const response = createResponse();
    accountManagerPrivacySync.getUserPrivacySettings.mockResolvedValue({
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
      settings: {
        analytics_tracking: true,
        cookie_banner_accepted: true,
        error_debugging: false,
        performance_monitoring: false,
      },
    });

    const result = await controller.refreshSessionTracking(
      {
        user: {
          sub: 'keycloak-subject',
        },
      } as never,
      response,
    );

    expect(accountManagerPrivacySync.getUserPrivacySettings).toHaveBeenCalledWith('keycloak-subject');
    expect(result).toMatchObject({
      analyticsAllowed: true,
      cookieBannerAccepted: true,
      userId: 'keycloak-subject',
    });
    expect(response.cookie).toHaveBeenCalled();
  });

  it('clears tracking cookies during logout without requiring a user session', () => {
    const response = createResponse();

    expect(controller.clearTrackingCookies(response)).toEqual({ cleared: true });
    expect(response.clearCookie).toHaveBeenCalled();
  });
});

function createResponse(): Response {
  return {
    clearCookie: jest.fn(),
    cookie: jest.fn(),
  } as unknown as Response;
}

function createConfigService(): ConfigService {
  return {
    get: jest.fn((key: string) => (key === 'BACKEND_URL' ? 'https://eventos.cacic.dev.br/api' : undefined)),
  } as unknown as ConfigService;
}
