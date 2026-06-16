import {
  EnvironmentProviders,
  InjectionToken,
  Provider,
  makeEnvironmentProviders,
} from '@angular/core';
import type { CacicPrivacyPreferences } from './account-privacy.types';

export interface CacicAccountPrivacyConfig {
  apiBaseUrl: string;
  initialPreferences: CacicPrivacyPreferences;
  unavailablePreferences: CacicPrivacyPreferences;
  requireCookieBannerAcceptance: boolean;
}

export type CacicAccountPrivacyProviderConfig = Partial<
  Omit<CacicAccountPrivacyConfig, 'initialPreferences' | 'unavailablePreferences'>
> & {
  initialPreferences?: Partial<CacicPrivacyPreferences>;
  unavailablePreferences?: Partial<CacicPrivacyPreferences>;
};

const disabledPreferences: CacicPrivacyPreferences = {
  analytics_tracking: false,
  error_debugging: false,
  performance_monitoring: false,
  cookie_banner_accepted: false,
};

export const DEFAULT_CACIC_ACCOUNT_PRIVACY_CONFIG: CacicAccountPrivacyConfig = {
  apiBaseUrl: 'https://account.cacic.dev.br/api',
  initialPreferences: disabledPreferences,
  unavailablePreferences: disabledPreferences,
  requireCookieBannerAcceptance: true,
};

export const CACIC_ACCOUNT_PRIVACY_CONFIG =
  new InjectionToken<CacicAccountPrivacyConfig>('CACIC_ACCOUNT_PRIVACY_CONFIG', {
    providedIn: 'root',
    factory: () => DEFAULT_CACIC_ACCOUNT_PRIVACY_CONFIG,
  });

export function provideCacicAccountPrivacy(
  config: CacicAccountPrivacyProviderConfig = {},
): EnvironmentProviders {
  const providers: Provider[] = [
    {
      provide: CACIC_ACCOUNT_PRIVACY_CONFIG,
      useValue: mergeConfig(config),
    },
  ];

  return makeEnvironmentProviders(providers);
}

function mergeConfig(
  config: CacicAccountPrivacyProviderConfig,
): CacicAccountPrivacyConfig {
  return {
    ...DEFAULT_CACIC_ACCOUNT_PRIVACY_CONFIG,
    ...config,
    apiBaseUrl: normalizeApiBaseUrl(
      config.apiBaseUrl ?? DEFAULT_CACIC_ACCOUNT_PRIVACY_CONFIG.apiBaseUrl,
    ),
    initialPreferences: {
      ...DEFAULT_CACIC_ACCOUNT_PRIVACY_CONFIG.initialPreferences,
      ...config.initialPreferences,
    },
    unavailablePreferences: {
      ...DEFAULT_CACIC_ACCOUNT_PRIVACY_CONFIG.unavailablePreferences,
      ...config.unavailablePreferences,
    },
  };
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, '');
}
