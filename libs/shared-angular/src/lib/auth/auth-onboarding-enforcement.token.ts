import { InjectionToken } from '@angular/core';

export const AUTH_ONBOARDING_ENFORCEMENT_ENABLED = new InjectionToken<() => boolean>(
  'AUTH_ONBOARDING_ENFORCEMENT_ENABLED',
  {
    providedIn: 'root',
    factory: () => () => true,
  },
);
