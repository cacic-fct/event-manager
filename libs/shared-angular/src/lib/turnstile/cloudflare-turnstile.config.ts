import { InjectionToken, makeEnvironmentProviders } from '@angular/core';

export interface CloudflareTurnstileConfig {
  siteKey: string;
}

export const CLOUDFLARE_TURNSTILE_CONFIG = new InjectionToken<CloudflareTurnstileConfig>(
  'CLOUDFLARE_TURNSTILE_CONFIG',
  {
    factory: () => ({ siteKey: '' }),
  },
);

export function provideCloudflareTurnstile(config: CloudflareTurnstileConfig) {
  return makeEnvironmentProviders([
    {
      provide: CLOUDFLARE_TURNSTILE_CONFIG,
      useValue: config,
    },
  ]);
}
