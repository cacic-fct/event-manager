import { InjectionToken } from '@angular/core';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { AnalyticsEventData } from './analytics.service';

export type CacicAnalyticsConfig = {
  isAnalyticsEnabled: (user: AuthenticatedUser | null) => boolean;
  buildIdentifyData?: (user: AuthenticatedUser) => AnalyticsEventData;
};

export const CACIC_ANALYTICS_CONFIG = new InjectionToken<CacicAnalyticsConfig>('CACIC_ANALYTICS_CONFIG');
