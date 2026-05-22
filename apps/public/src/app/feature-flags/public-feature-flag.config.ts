import { InjectionToken } from '@angular/core';

export interface PublicFeatureFlagConfig {
  url: string;
  clientKey: string;
  appName: string;
  environment: string;
  refreshIntervalSeconds: number;
  disableMetrics: boolean;
}

export const PUBLIC_FEATURE_FLAG_CONFIG = new InjectionToken<PublicFeatureFlagConfig>('PUBLIC_FEATURE_FLAG_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    url: 'https://unleash.cacic.dev.br/api/frontend',
    clientKey: '',
    appName: 'events-public',
    environment: 'production',
    refreshIntervalSeconds: 60,
    disableMetrics: true,
  }),
});
