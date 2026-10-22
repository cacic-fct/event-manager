import { initializeMaterialSymbols } from '@cacic-fct/shared-angular/material/icons';
import {
  ApplicationConfig,
  Injector,
  LOCALE_ID,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  runInInjectionContext,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideRouter, RouteReuseStrategy, Router, TitleStrategy } from '@angular/router';
import { appRoutes } from './app.routes';
import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AUTH_ONBOARDING_ENFORCEMENT_ENABLED } from '@cacic-fct/shared-angular/auth/onboarding';
import { AuthOnlineStatusService } from '@cacic-fct/shared-angular/auth/online-status';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { authInterceptor } from '@cacic-fct/shared-angular/auth/interceptor';
import { initializeCacicAccountPrivacyBestEffort } from '@cacic-fct/shared-angular/privacy/startup';
import { provideCacicObservability } from '@cacic-fct/shared-angular/observability';
import { provideCloudflareTurnstile } from '@cacic-fct/shared-angular/turnstile/config';
import { CACIC_ACCOUNT_PRIVACY_OPT_OUT_CONFIG } from '@cacic-fct/shared-angular/privacy/config';
import { CacicAccountPrivacyService, provideCacicAccountPrivacy } from '@cacic-fct/account-manager-privacy';
import { AnalyticsService } from './analytics/analytics.service';
import { OnlineAttendanceCoordinatorService } from './attendance/self-registration/coordinator.service';
import { RequiredSubscriptionFormInterruptionFlow } from './forms/required-subscription-form-interruption.flow';
import { ImageLicenseAgreementInterruptionFlow } from './events/image-license-agreement-interruption.flow';
import { InterruptionCoordinatorService } from './interruption/interruption-coordinator.service';
import { provideInterruptionFlow } from './interruption/interruption-flow';
import { NetworkStatusService } from './shared/network-status.service';
import { AppRouteReuseStrategy } from './layout/tab-reuse.strategy';
import { PublicFeatureFlagService } from './feature-flags/public-feature-flag.service';
import { PUBLIC_FEATURE_FLAG_CONFIG, type PublicFeatureFlagConfig } from './feature-flags/public-feature-flag.config';
import { TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS } from '@cacic-fct/shared-utils';
import { PageTitleStrategy } from './shared/page-title-strategy';
import { DefaultRedirectOnTabEntryService } from './landing/default-redirect-on-tab-entry.service';
import { SportsAutorouteInterruptionFlow } from './sports/operations/sports-autoroute-interruption.flow';
import { publicMapCacheInvalidationInterceptor } from './map/public-map-cache.interceptor';
import { MyDayStore } from './my-day/my-day.store';

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
  url: 'https://unleash.cacic.com.br/api/frontend',
  clientKey: isDevMode()
    ? 'default:development.rUPorLb0LVO4VIBLZ5RX4TKvsvGuABYmpkmzpWa7QHXwqSZ20v0ppRGYCWAO'
    : 'default:production.h8sn3hzUSF07msdHkuXubAVRxSgtAdGsBCXiXXhcs8I4boeXozEue0Tx0lwq',
  appName: 'events-public',
  environment: readRuntimeConfigValue('cacic-unleash-environment', 'unleashEnvironment') || 'production',
  refreshIntervalSeconds: 60,
  disableMetrics: true,
};

const accountPrivacyApiBaseUrl = '/api';
const turnstileSiteKey =
  readRuntimeConfigValue('cacic-turnstile-site-key', 'turnstileSiteKey', 'TURNSTILE_SITE_KEY') ||
  (isDevMode() ? TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS : '');

const accountPrivacy = () => inject(CacicAccountPrivacyService);
const isAccountAnalyticsEnabled = () => accountPrivacy().isAnalyticsEnabled();
const isAccountDiagnosticsEnabled = () => accountPrivacy().isErrorDebuggingEnabled();
const isAccountPerformanceMonitoringEnabled = () => accountPrivacy().isPerformanceMonitoringEnabled();

function readRuntimeConfigValue(
  metaName: string,
  windowConfigKey: keyof NonNullable<Window['__cacicPublicConfig__']>,
  serverEnvKey?: string,
): string {
  if (typeof document !== 'undefined') {
    const metaValue = document.querySelector<HTMLMetaElement>(`meta[name="${metaName}"]`)?.content;
    if (metaValue) {
      return metaValue;
    }
  }

  if (typeof window !== 'undefined') {
    const windowValue = window.__cacicPublicConfig__?.[windowConfigKey];
    if (windowValue) {
      return windowValue;
    }
  }

  if (serverEnvKey) {
    return readServerEnvironmentValue(serverEnvKey);
  }

  return '';
}

function readServerEnvironmentValue(key: string): string {
  const processLike = (
    globalThis as {
      process?: {
        env?: Record<string, string | undefined>;
        versions?: { node?: string };
      };
    }
  ).process;
  if (!processLike?.versions?.node) {
    return '';
  }

  return processLike?.env?.[key] ?? '';
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: PUBLIC_FEATURE_FLAG_CONFIG, useValue: publicFeatureFlagConfig },
    provideClientHydration(withNoIncrementalHydration()),
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideHttpClient(withInterceptors([authInterceptor, publicMapCacheInvalidationInterceptor])),
    provideInterruptionFlow(DefaultRedirectOnTabEntryService),
    provideInterruptionFlow(OnlineAttendanceCoordinatorService),
    provideInterruptionFlow(SportsAutorouteInterruptionFlow),
    provideInterruptionFlow(ImageLicenseAgreementInterruptionFlow),
    provideInterruptionFlow(RequiredSubscriptionFormInterruptionFlow),
    provideCloudflareTurnstile({
      siteKey: turnstileSiteKey,
    }),
    provideCacicAccountPrivacy({
      ...CACIC_ACCOUNT_PRIVACY_OPT_OUT_CONFIG,
      apiBaseUrl: accountPrivacyApiBaseUrl,
    }),
    provideCacicObservability({
      analytics: {
        websiteId: 'df6b1fa8-7566-4cb0-8dff-279d15cc0b5d',
        domains: ['eventos.cacic.com.br'],
        isEnabled: isAccountAnalyticsEnabled,
        replay: {
          isEnabled: (user) => !user || accountPrivacy().loaded(),
        },
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
        dsn: 'https://44b2480fd6cd4402b61590135a093fd6@glitchtip.cacic.com.br/1',
        project: 'public',
        isEnabled: isAccountDiagnosticsEnabled,
        isPerformanceEnabled: isAccountPerformanceMonitoringEnabled,
      },
    }),
    provideAppInitializer(initializeCacicAccountPrivacyBestEffort),
    provideAppInitializer(initializeMaterialSymbols),
    provideAppInitializer(() => {
      inject(AppRouteReuseStrategy).start(inject(Router));
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
      inject(DefaultRedirectOnTabEntryService).start();
    }),
    provideAppInitializer(() => {
      inject(AnalyticsService).start();
    }),
    provideAppInitializer(async () => {
      const injector = inject(Injector);
      inject(InterruptionCoordinatorService).start();
      const [attendanceOfflineStartup, networkStartup, offlineUserDataStartup, totpSeedStartup, serviceWorkerStartup] =
        await Promise.all([
          import('./startup/attendance-offline-startup'),
          import('./startup/network-status-startup'),
          import('./startup/offline-user-data-startup'),
          import('./startup/totp-seed-startup'),
          import('./startup/service-worker-startup'),
        ]);
      attendanceOfflineStartup.startAttendanceOfflineSync(injector);
      runInInjectionContext(injector, () => inject(NetworkStatusService).start());
      networkStartup.startNetworkStatusServices(injector);
      offlineUserDataStartup.startOfflineUserData(injector);
      totpSeedStartup.startTotpSeedSession(injector);
      runInInjectionContext(injector, () => inject(MyDayStore).start());
      serviceWorkerStartup.startServiceWorker(injector);
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
      provide: AppRouteReuseStrategy,
      useClass: AppRouteReuseStrategy,
    },
    {
      provide: RouteReuseStrategy,
      useExisting: AppRouteReuseStrategy,
    },
  ],
};
