import type { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  CACIC_ANALYTICS_CONSENT_COOKIE_NAME,
  CACIC_ANALYTICS_ID_COOKIE_NAME,
  CACIC_PURR_COOKIE_NAME,
  CACIC_PURR_QUICK_COOKIE_NAME,
  type CacicAnalyticsConsentCookiePayload,
  type CacicTrackingSessionResponse,
} from '@cacic-fct/account-manager-m2m-contracts';

const TRACKING_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TRACKING_COOKIE_VERSION = '1.0';

export interface TrackingCookieInput {
  analyticsAllowed: boolean;
  cookieBannerAccepted: boolean;
  keycloakId: string;
  updatedAt: Date;
}

export function refreshCacicTrackingCookies(
  response: Response,
  configService: ConfigService,
  input: TrackingCookieInput,
): CacicTrackingSessionResponse {
  if (!input.analyticsAllowed) {
    clearCacicTrackingCookies(response, configService);
    return {
      analyticsAllowed: false,
      cookieBannerAccepted: input.cookieBannerAccepted,
    };
  }

  const expiresAt = new Date(Date.now() + TRACKING_COOKIE_MAX_AGE_MS);
  const baseOptions = resolveSharedCookieOptions(configService);

  response.cookie(CACIC_ANALYTICS_ID_COOKIE_NAME, input.keycloakId, {
    ...baseOptions,
    httpOnly: false,
    maxAge: TRACKING_COOKIE_MAX_AGE_MS,
  });

  const consentPayload: CacicAnalyticsConsentCookiePayload = {
    analyticsAllowed: true,
    cookieBannerAccepted: input.cookieBannerAccepted,
    identityAvailable: true,
    updatedAt: input.updatedAt.toISOString(),
    version: TRACKING_COOKIE_VERSION,
  };

  response.cookie(CACIC_ANALYTICS_CONSENT_COOKIE_NAME, JSON.stringify(consentPayload), {
    ...baseOptions,
    httpOnly: false,
    maxAge: TRACKING_COOKIE_MAX_AGE_MS,
  });

  return {
    analyticsAllowed: true,
    cookieBannerAccepted: input.cookieBannerAccepted,
    expiresAt,
    userId: input.keycloakId,
  };
}

export function clearCacicTrackingCookies(
  response: Response,
  configService: ConfigService,
): void {
  const baseOptions = resolveSharedCookieOptions(configService);
  const hostOnlyOptions = { ...baseOptions };
  delete hostOnlyOptions.domain;

  for (const cookieName of [
    CACIC_ANALYTICS_ID_COOKIE_NAME,
    CACIC_ANALYTICS_CONSENT_COOKIE_NAME,
    CACIC_PURR_COOKIE_NAME,
    CACIC_PURR_QUICK_COOKIE_NAME,
  ]) {
    response.clearCookie(cookieName, baseOptions);
    response.clearCookie(cookieName, hostOnlyOptions);
  }
}

function resolveSharedCookieOptions(configService: ConfigService): CookieOptions {
  return {
    domain: resolveSharedCookieDomain(configService),
    httpOnly: false,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

function resolveSharedCookieDomain(configService: ConfigService): string | undefined {
  const configuredDomain = configService.get<string>('CACIC_SHARED_COOKIE_DOMAIN')?.trim();
  if (configuredDomain) {
    return configuredDomain;
  }

  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }

  const backendUrl = configService.get<string>('BACKEND_URL');
  if (!backendUrl) {
    return undefined;
  }

  try {
    const hostname = new URL(backendUrl).hostname;
    return hostname === 'cacic.dev.br' || hostname.endsWith('.cacic.dev.br') ? '.cacic.dev.br' : undefined;
  } catch {
    return undefined;
  }
}
