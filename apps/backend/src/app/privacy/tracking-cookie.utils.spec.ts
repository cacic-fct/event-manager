import type { ConfigService } from '@nestjs/config';
import {
  CACIC_ANALYTICS_CONSENT_COOKIE_NAME,
  CACIC_ANALYTICS_ID_COOKIE_NAME,
  CACIC_PURR_COOKIE_NAME,
  CACIC_PURR_QUICK_COOKIE_NAME,
} from '@cacic-fct/account-manager-m2m-contracts';
import type { Response } from 'express';
import { clearCacicTrackingCookies, refreshCacicTrackingCookies } from './tracking-cookie.utils';

describe('tracking cookie utilities', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('sets shared analytics cookies with the Keycloak subject when analytics is allowed', () => {
    process.env.NODE_ENV = 'production';
    const { cookieMock, response } = createResponse();
    const config = createConfigService();

    const result = refreshCacicTrackingCookies(response, config, {
      analyticsAllowed: true,
      cookieBannerAccepted: true,
      keycloakId: 'keycloak-subject',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
    });

    expect(result).toMatchObject({
      analyticsAllowed: true,
      cookieBannerAccepted: true,
      userId: 'keycloak-subject',
    });
    expect(cookieMock).toHaveBeenCalledWith(
      CACIC_ANALYTICS_ID_COOKIE_NAME,
      'keycloak-subject',
      expect.objectContaining({
        domain: '.cacic.dev.br',
        httpOnly: false,
        sameSite: 'lax',
        secure: true,
      }),
    );
    expect(cookieMock).toHaveBeenCalledWith(
      CACIC_ANALYTICS_CONSENT_COOKIE_NAME,
      expect.stringContaining('"analyticsAllowed":true'),
      expect.objectContaining({
        domain: '.cacic.dev.br',
        httpOnly: false,
      }),
    );
  });

  it('clears tracking cookies instead of setting them when analytics is disabled', () => {
    process.env.NODE_ENV = 'production';
    const { clearCookieMock, cookieMock, response } = createResponse();
    const config = createConfigService();

    const result = refreshCacicTrackingCookies(response, config, {
      analyticsAllowed: false,
      cookieBannerAccepted: true,
      keycloakId: 'keycloak-subject',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
    });

    expect(result).toEqual({
      analyticsAllowed: false,
      cookieBannerAccepted: true,
    });
    expect(cookieMock).not.toHaveBeenCalled();
    expect(clearCookieMock).toHaveBeenCalledWith(
      CACIC_ANALYTICS_ID_COOKIE_NAME,
      expect.objectContaining({ domain: '.cacic.dev.br' }),
    );
  });

  it('clears analytics and privacy directive cookies with shared and host-only scopes', () => {
    process.env.NODE_ENV = 'production';
    const { clearCookieMock, response } = createResponse();
    const config = createConfigService();

    clearCacicTrackingCookies(response, config);

    for (const cookieName of [
      CACIC_ANALYTICS_ID_COOKIE_NAME,
      CACIC_ANALYTICS_CONSENT_COOKIE_NAME,
      CACIC_PURR_COOKIE_NAME,
      CACIC_PURR_QUICK_COOKIE_NAME,
    ]) {
      expect(clearCookieMock).toHaveBeenCalledWith(
        cookieName,
        expect.objectContaining({ domain: '.cacic.dev.br' }),
      );
      expect(hasHostOnlyClearCall(clearCookieMock, cookieName)).toBe(true);
    }
  });
});

function createResponse(): {
  clearCookieMock: jest.Mock;
  cookieMock: jest.Mock;
  response: Response;
} {
  const clearCookieMock = jest.fn();
  const cookieMock = jest.fn();

  return {
    clearCookieMock,
    cookieMock,
    response: {
      clearCookie: clearCookieMock,
      cookie: cookieMock,
    } as unknown as Response,
  };
}

function createConfigService(): ConfigService {
  return {
    get: jest.fn((key: string) => (key === 'BACKEND_URL' ? 'https://eventos.cacic.dev.br/api' : undefined)),
  } as unknown as ConfigService;
}

function hasHostOnlyClearCall(clearCookieMock: jest.Mock, cookieName: string): boolean {
  return clearCookieMock.mock.calls.some(([name, options]) => {
    return name === cookieName && isRecord(options) && !Object.hasOwn(options, 'domain');
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
