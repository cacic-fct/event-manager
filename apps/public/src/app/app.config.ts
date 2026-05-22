import {
  ApplicationConfig,
  LOCALE_ID,
  importProvidersFrom,
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
  authInterceptor,
} from '@cacic-fct/shared-angular';
import { MicroSentryModule } from '@micro-sentry/angular';
import { provideUmami } from '@cacic-fct/ngx-umami';
import { MatIconRegistry } from '@angular/material/icon';
import { provideServiceWorker } from '@angular/service-worker';
import { AnalyticsService } from './analytics/analytics.service';
import { OnlineAttendanceCoordinatorService } from './attendance/online-attendance-coordinator.service';
import { OfflineUserDataService } from './shared/offline-user-data.service';
import { NetworkStatusService } from './shared/network-status.service';
import { NetworkStatusSnackbarService } from './shared/network-status-snackbar.service';
import { AppRouteReuseStrategy } from './tabs/reuse.strategy';
import { isUserDiagnosticsEnabled } from './privacy/privacy-attributes';
import { PublicFeatureFlagService } from './feature-flags/public-feature-flag.service';
import { PUBLIC_FEATURE_FLAG_CONFIG, type PublicFeatureFlagConfig } from './feature-flags/public-feature-flag.config';

registerLocaleData(localePt);

declare global {
  interface Window {
    __cacicPublicConfig__?: {
      unleashClientKey?: string;
      unleashEnvironment?: string;
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
    importProvidersFrom(
      MicroSentryModule.forRoot({
        dsn: 'https://44b2480fd6cd4402b61590135a093fd6@glitchtip.cacic.dev.br/1',
        beforeSend: (request) => {
          const authService = inject(AuthService);
          return !isDevMode() && isUserDiagnosticsEnabled(authService.user()) ? request : null;
        },
      }),
    ),
    provideUmami({
      websiteId: 'df6b1fa8-7566-4cb0-8dff-279d15cc0b5d',
      src: 'https://a.cacic.dev.br/b.js',
      autoTrack: false,
      domains: ['eventos.cacic.dev.br'],
      hostUrl: 'https://a.cacic.dev.br/a',
    }),
    provideAppInitializer(() => {
      const registry = inject(MatIconRegistry);
      registry.setDefaultFontSetClass('material-icons-outlined');
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
    provideServiceWorker('novu-ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    {
      provide: RouteReuseStrategy,
      useClass: AppRouteReuseStrategy,
    },
  ],
};
