import { InjectionToken, isDevMode } from '@angular/core';

export const CACIC_OBSERVABILITY_REPLAY_IS_DEVELOPMENT = new InjectionToken<boolean>(
  'CACIC_OBSERVABILITY_REPLAY_IS_DEVELOPMENT',
  {
    providedIn: 'root',
    factory: () => isDevMode(),
  },
);
