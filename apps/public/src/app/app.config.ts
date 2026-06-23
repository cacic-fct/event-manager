import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { appRoutes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  AUTH_ONBOARDING_ENFORCEMENT_ENABLED,
  AuthOnlineStatusService,
  AuthService,
  ServiceWorkerService,
  authInterceptor,
  provideCacicObservability,
  provideCloudflareTurnstile,
} from '@cacic-fct/shared-angular';
import { CacicAccountPrivacyService, provideCacicAccountPrivacy } from '@cacic-fct/account-manager-privacy';
import { MatIconRegistry } from '@angular/material/icon';
import { AnalyticsService } from './analytics/analytics.service';
import { OnlineAttendanceCoordinatorService } from './attendance/online-attendance/online-attendance-coordinator.service';
import { OfflineUserDataService } from './shared/offline-user-data.service';
import { NetworkStatusService } from './shared/network-status.service';
import { NetworkStatusSnackbarService } from './shared/network-status-snackbar.service';
import { AppRouteReuseStrategy } from './tabs/reuse.strategy';
import { PublicFeatureFlagService } from './feature-flags/public-feature-flag.service';
import { PUBLIC_FEATURE_FLAG_CONFIG, type PublicFeatureFlagConfig } from './feature-flags/public-feature-flag.config';
import { TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS } from '@cacic-fct/shared-utils';

registerLocaleData(localePt);

declare global {
  interface Window {
    __cacicPublicConfig__?: {
      unleashClientKey?: string;
      unleashEnvironment?: string;
      turnstileSiteKey?: string;
    };
  }
}

const publicFeatureFlagConfig: PublicFeatureFlagConfig = {
  url: 'https://unleash.cacic.dev.br/api/frontend',
  clientKey: isDevMode()
    ? 'default:development.rUPorLb0LVO4VIBLZ5RX4TKvsvGuABYmpkmzpWa7QHXwqSZ20v0ppRGYCWAO'
    : 'default:production.h8sn3hzUSF07msdHkuXubAVRxSgtAdGsBCXiXXhcs8I4boeXozEue0Tx0lwq',
  appName: 'events-public',
  environment: readRuntimeConfigValue('cacic-unleash-environment', 'unleashEnvironment') || 'production',
  refreshIntervalSeconds: 60,
  disableMetrics: true,
};

const accountPrivacyApiBaseUrl = 'https://account.cacic.dev.br/api';
const turnstileSiteKey =
  readRuntimeConfigValue('cacic-turnstile-site-key', 'turnstileSiteKey') ||
  (isDevMode() ? TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS : '');

const accountPrivacy = () => inject(CacicAccountPrivacyService);
const isAccountAnalyticsEnabled = () => accountPrivacy().isAnalyticsEnabled();
const isAccountDiagnosticsEnabled = () => accountPrivacy().isErrorDebuggingEnabled();
const isAccountPerformanceMonitoringEnabled = () => accountPrivacy().isPerformanceMonitoringEnabled();

function readRuntimeConfigValue(
  metaName: string,
  windowConfigKey: keyof NonNullable<Window['__cacicPublicConfig__']>,
): string {
  if (typeof document !== 'undefined') {
    const metaValue = document.querySelector<HTMLMetaElement>(`meta[name="${metaName}"]`)?.content;
    if (metaValue) {
      return metaValue;
    }
  }

  if (typeof window !== 'undefined') {
    return window.__cacicPublicConfig__?.[windowConfigKey] ?? '';
  }

  return '';
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: PUBLIC_FEATURE_FLAG_CONFIG, useValue: publicFeatureFlagConfig },
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideCloudflareTurnstile({
      siteKey: turnstileSiteKey,
    }),
    provideCacicAccountPrivacy({
      apiBaseUrl: accountPrivacyApiBaseUrl,
    }),
    provideCacicObservability({
      analytics: {
        websiteId: 'df6b1fa8-7566-4cb0-8dff-279d15cc0b5d',
        domains: ['eventos.cacic.dev.br'],
        isEnabled: isAccountAnalyticsEnabled,
        buildIdentifyData: (user) => ({
          authenticated: true,
          has_email: Boolean(user.email),
          analytics_enabled: accountPrivacy().preferences().analytics_tracking,
          diagnostics_enabled: accountPrivacy().preferences().error_debugging,
          performance_monitoring_enabled: accountPrivacy().preferences().performance_monitoring,
          cookie_banner_accepted: accountPrivacy().preferences().cookie_banner_accepted,
        }),
      },
      glitchtip: {
        dsn: 'https://44b2480fd6cd4402b61590135a093fd6@glitchtip.cacic.dev.br/1',
        project: 'public',
        isEnabled: isAccountDiagnosticsEnabled,
        isPerformanceEnabled: isAccountPerformanceMonitoringEnabled,
      },
    }),
    provideAppInitializer(() => {
      return inject(CacicAccountPrivacyService).initialize();
    }),
    provideAppInitializer(() => {
      const registry = inject(MatIconRegistry);
      registry.setDefaultFontSetClass('material-symbols-outlined');
    }),
    provideAppInitializer(() => {
      const featureFlags = inject(PublicFeatureFlagService);
      return featureFlags.initialize();
    }),
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return authService.initialize();
    }),
    provideAppInitializer(() => {
      inject(AnalyticsService).start();
    }),
    provideAppInitializer(() => {
      inject(OnlineAttendanceCoordinatorService).start();
    }),
    provideAppInitializer(() => {
      inject(NetworkStatusService).start();
      inject(NetworkStatusSnackbarService).start();
      inject(OfflineUserDataService).start();
    }),
    provideAppInitializer(() => {
      inject(ServiceWorkerService).start();
    }),
    {
      provide: AuthOnlineStatusService,
      useExisting: NetworkStatusService,
    },
    {
      provide: AUTH_ONBOARDING_ENFORCEMENT_ENABLED,
      useFactory: () => {
        const featureFlags = inject(PublicFeatureFlagService);
        return () => featureFlags.booleanValue('onboardingEnforcementEnabled');
      },
    },
    {
      provide: RouteReuseStrategy,
      useClass: AppRouteReuseStrategy,
    },
  ],
};
