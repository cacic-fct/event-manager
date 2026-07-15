import type { ConfigService } from '@nestjs/config';
import { CACIC_ANALYTICS_CONSENT_COOKIE_NAME } from '@cacic-fct/account-manager-m2m-contracts';
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

  it('refreshes shared tracking cookies when analytics tracking is enabled', async () => {
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

  it('does not require cookie banner acceptance before refreshing tracking cookies', async () => {
    const response = createResponse();
    accountManagerPrivacySync.getUserPrivacySettings.mockResolvedValue({
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
      settings: {
        analytics_tracking: true,
        cookie_banner_accepted: false,
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

    expect(result).toMatchObject({
      analyticsAllowed: true,
      cookieBannerAccepted: false,
      userId: 'keycloak-subject',
    });
    expect(response.cookie).toHaveBeenCalled();
  });

  it('refreshes identity cookies without allowing analytics when analytics tracking is explicitly disabled', async () => {
    const response = createResponse();
    accountManagerPrivacySync.getUserPrivacySettings.mockResolvedValue({
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
      settings: {
        analytics_tracking: false,
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

    expect(result).toEqual({
      analyticsAllowed: false,
      cookieBannerAccepted: true,
      expiresAt: expect.any(Date),
      userId: 'keycloak-subject',
    });
    expect(response.cookie).toHaveBeenCalled();
    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it('rejects tracking refresh when the authenticated user has no subject id', async () => {
    await expect(controller.refreshSessionTracking({ user: {} } as never, createResponse())).rejects.toThrow(
      'Authenticated user is missing a subject identifier.',
    );

    expect(accountManagerPrivacySync.getUserPrivacySettings).not.toHaveBeenCalled();
  });

  it('falls back to the current date when Account Manager returns an invalid update timestamp', async () => {
    const response = createResponse();
    accountManagerPrivacySync.getUserPrivacySettings.mockResolvedValue({
      updatedAt: 'not-a-date',
      settings: {
        analytics_tracking: true,
        cookie_banner_accepted: true,
        error_debugging: false,
        performance_monitoring: false,
      },
    });

    const before = Date.now();
    const result = await controller.refreshSessionTracking(
      {
        user: {
          sub: 'keycloak-subject',
        },
      } as never,
      response,
    );
    const after = Date.now();
    const consentCookieCall = (response.cookie as jest.Mock).mock.calls.find(
      ([cookieName]) => cookieName === CACIC_ANALYTICS_CONSENT_COOKIE_NAME,
    );
    const consentPayload = JSON.parse(consentCookieCall?.[1] as string) as { updatedAt: string };
    const consentUpdatedAt = new Date(consentPayload.updatedAt).getTime();

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.expiresAt.getTime()).toBeGreaterThan(after);
    expect(consentUpdatedAt).toBeGreaterThanOrEqual(before);
    expect(consentUpdatedAt).toBeLessThanOrEqual(after);
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
    get: jest.fn((key: string) => (key === 'BACKEND_URL' ? 'https://eventos.cacic.com.br/api' : undefined)),
  } as unknown as ConfigService;
}
