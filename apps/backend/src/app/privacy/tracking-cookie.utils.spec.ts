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

  it('sets identity cookies with analytics disabled when a tracking identity is available', () => {
    process.env.NODE_ENV = 'production';
    const { clearCookieMock, cookieMock, response } = createResponse();
    const config = createConfigService();

    const result = refreshCacicTrackingCookies(response, config, {
      analyticsAllowed: false,
      cookieBannerAccepted: true,
      keycloakId: 'keycloak-subject',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
    });

    expect(result).toMatchObject({
      analyticsAllowed: false,
      cookieBannerAccepted: true,
      userId: 'keycloak-subject',
    });
    expect(cookieMock).toHaveBeenCalledWith(
      CACIC_ANALYTICS_ID_COOKIE_NAME,
      'keycloak-subject',
      expect.objectContaining({ domain: '.cacic.dev.br' }),
    );
    expect(cookieMock).toHaveBeenCalledWith(
      CACIC_ANALYTICS_CONSENT_COOKIE_NAME,
      expect.stringContaining('"analyticsAllowed":false'),
      expect.objectContaining({ domain: '.cacic.dev.br' }),
    );
    expect(clearCookieMock).not.toHaveBeenCalled();
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

  it('uses an explicitly configured shared cookie domain after trimming it', () => {
    const { cookieMock, response } = createResponse();
    const config = createConfigService({
      CACIC_SHARED_COOKIE_DOMAIN: '  .configured.cacic.dev.br  ',
    });

    refreshCacicTrackingCookies(response, config, {
      analyticsAllowed: true,
      cookieBannerAccepted: true,
      keycloakId: 'keycloak-subject',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
    });

    expect(cookieMock).toHaveBeenCalledWith(
      CACIC_ANALYTICS_ID_COOKIE_NAME,
      'keycloak-subject',
      expect.objectContaining({ domain: '.configured.cacic.dev.br' }),
    );
  });

  it('omits the shared cookie domain in production when the backend URL is unavailable', () => {
    process.env.NODE_ENV = 'production';
    const { cookieMock, response } = createResponse();
    const config = createConfigService({ BACKEND_URL: undefined });

    refreshCacicTrackingCookies(response, config, {
      analyticsAllowed: true,
      cookieBannerAccepted: true,
      keycloakId: 'keycloak-subject',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
    });

    expect(cookieMock).toHaveBeenCalledWith(
      CACIC_ANALYTICS_ID_COOKIE_NAME,
      'keycloak-subject',
      expect.objectContaining({ domain: undefined }),
    );
  });

  it('omits the shared cookie domain in production when the backend URL is invalid', () => {
    process.env.NODE_ENV = 'production';
    const { cookieMock, response } = createResponse();
    const config = createConfigService({ BACKEND_URL: 'not a url' });

    refreshCacicTrackingCookies(response, config, {
      analyticsAllowed: true,
      cookieBannerAccepted: true,
      keycloakId: 'keycloak-subject',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
    });

    expect(cookieMock).toHaveBeenCalledWith(
      CACIC_ANALYTICS_ID_COOKIE_NAME,
      'keycloak-subject',
      expect.objectContaining({ domain: undefined }),
    );
  });

  it('omits the shared cookie domain in production when the backend URL is outside CACiC', () => {
    process.env.NODE_ENV = 'production';
    const { cookieMock, response } = createResponse();
    const config = createConfigService({ BACKEND_URL: 'https://events.example.org/api' });

    refreshCacicTrackingCookies(response, config, {
      analyticsAllowed: true,
      cookieBannerAccepted: true,
      keycloakId: 'keycloak-subject',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
    });

    expect(cookieMock).toHaveBeenCalledWith(
      CACIC_ANALYTICS_ID_COOKIE_NAME,
      'keycloak-subject',
      expect.objectContaining({ domain: undefined }),
    );
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

function createConfigService(overrides: Record<string, string | undefined> = {}): ConfigService {
  const values: Record<string, string | undefined> = {
    BACKEND_URL: 'https://eventos.cacic.dev.br/api',
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => values[key]),
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
