import { BadRequestException } from '@nestjs/common';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { PrivacyController } from './privacy.controller';
import { ALLOW_NON_ONBOARDED_KEY, IS_PUBLIC_KEY } from '../auth/auth.constants';

describe('PrivacyController', () => {
  let accountManagerPrivacySync: {
    getUserPrivacySettings: jest.Mock;
    recordCookieConsent: jest.Mock;
  };
  let controller: PrivacyController;

  beforeEach(() => {
    accountManagerPrivacySync = {
      getUserPrivacySettings: jest.fn(),
      recordCookieConsent: jest.fn(),
    };
    controller = new PrivacyController(accountManagerPrivacySync as never);
  });

  it('keeps both privacy routes behind the default authenticated boundary', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PrivacyController)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PrivacyController.prototype.getPrivacySettings)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PrivacyController.prototype.acceptCookieBanner)).toBeUndefined();
    expect(Reflect.getMetadata(ALLOW_NON_ONBOARDED_KEY, PrivacyController)).toBeUndefined();
  });

  it('returns the privacy projection for the authenticated subject without augmenting or leaking data', async () => {
    const updatedAt = new Date(publicFixtureDateFromNow(1));
    const privacySettings = {
      id: 'subject-1',
      userId: 'subject-1',
      settings: {
        analytics_tracking: false,
        cookie_banner_accepted: true,
        error_debugging: true,
        performance_monitoring: false,
      },
      metadata: { source: 'account-manager-m2m' },
      createdAt: new Date(publicFixtureDateFromNow()),
      updatedAt,
    };
    accountManagerPrivacySync.getUserPrivacySettings.mockResolvedValue(privacySettings);

    await expect(controller.getPrivacySettings({ user: { sub: 'subject-1' } } as never)).resolves.toBe(privacySettings);

    expect(accountManagerPrivacySync.getUserPrivacySettings).toHaveBeenCalledWith('subject-1');
  });

  it('records cookie-banner acceptance for the authenticated subject and returns only the sync acknowledgement', async () => {
    accountManagerPrivacySync.recordCookieConsent.mockResolvedValue(undefined);

    await expect(controller.acceptCookieBanner({ user: { sub: 'subject-1' } } as never)).resolves.toEqual({
      synced: true,
    });

    expect(accountManagerPrivacySync.recordCookieConsent).toHaveBeenCalledWith('subject-1');
    expect(accountManagerPrivacySync.getUserPrivacySettings).not.toHaveBeenCalled();
  });

  it.each([
    ['settings', (request: never) => controller.getPrivacySettings(request)],
    ['cookie-banner acceptance', (request: never) => controller.acceptCookieBanner(request)],
  ] as const)('rejects %s when the authenticated request has no subject identifier', async (_operation, invoke) => {
    await expect(invoke({ user: {} } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(invoke({ user: { sub: '' } } as never)).rejects.toThrow(
      'Authenticated user is missing a subject identifier.',
    );

    expect(accountManagerPrivacySync.getUserPrivacySettings).not.toHaveBeenCalled();
    expect(accountManagerPrivacySync.recordCookieConsent).not.toHaveBeenCalled();
  });

  it('propagates Account Manager privacy errors without exposing a fallback response', async () => {
    const failure = new Error('Account Manager unavailable.');
    accountManagerPrivacySync.getUserPrivacySettings.mockRejectedValue(failure);

    await expect(controller.getPrivacySettings({ user: { sub: 'subject-1' } } as never)).rejects.toBe(failure);
  });

  it('propagates cookie-consent synchronization errors without claiming the consent was saved', async () => {
    const failure = new Error('Cookie consent synchronization failed.');
    accountManagerPrivacySync.recordCookieConsent.mockRejectedValue(failure);

    await expect(controller.acceptCookieBanner({ user: { sub: 'subject-1' } } as never)).rejects.toBe(failure);
  });
});
