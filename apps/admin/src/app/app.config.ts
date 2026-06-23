import {
  ApplicationConfig,
  LOCALE_ID,
  PLATFORM_ID,
  provideBrowserGlobalErrorListeners,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { isPlatformBrowser, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { provideClientHydration, withEventReplay, withNoIncrementalHydration } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  AuthService,
  type AuthenticatedUser,
  authInterceptor,
  provideCacicObservability,
  startCacicAnalytics,
} from '@cacic-fct/shared-angular';
import { CacicAccountPrivacyService, provideCacicAccountPrivacy } from '@cacic-fct/account-manager-privacy';
import { MatIconRegistry } from '@angular/material/icon';

registerLocaleData(localePt);

const accountPrivacyApiBaseUrl = 'https://account.cacic.dev.br/api';
const accountPrivacy = () => inject(CacicAccountPrivacyService);
const isAccountAnalyticsEnabled = () => accountPrivacy().isAnalyticsEnabled();
const isAccountDiagnosticsEnabled = () => accountPrivacy().isErrorDebuggingEnabled();
const isAccountPerformanceMonitoringEnabled = () => accountPrivacy().isPerformanceMonitoringEnabled();
const buildIdentifyData = (user: AuthenticatedUser) => ({
  authenticated: true,
  has_email: Boolean(user.email),
  roles_count: user.roles?.length ?? 0,
  scopes_count: user.scopes?.length ?? 0,
  analytics_enabled: accountPrivacy().preferences().analytics_tracking,
  diagnostics_enabled: accountPrivacy().preferences().error_debugging,
  performance_monitoring_enabled: accountPrivacy().preferences().performance_monitoring,
  cookie_banner_accepted: accountPrivacy().preferences().cookie_banner_accepted,
});

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(appRoutes),
    provideCacicAccountPrivacy({
      apiBaseUrl: accountPrivacyApiBaseUrl,
    }),
    provideCacicObservability({
      analytics: {
        websiteId: 'd8c04657-2416-4af4-b21f-99ea8dcfc5d4',
        domains: ['eventos.cacic.dev.br'],
        isEnabled: isAccountAnalyticsEnabled,
        buildIdentifyData,
      },
      glitchtip: {
        dsn: 'https://b787190b5ac546eb867e793b84d2b4b2@glitchtip.cacic.dev.br/2',
        project: 'admin',
        isEnabled: isAccountDiagnosticsEnabled,
        isPerformanceEnabled: isAccountPerformanceMonitoringEnabled,
      },
    }),
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }

      return inject(CacicAccountPrivacyService).initialize();
    }),
    provideAppInitializer(() => {
      const registry = inject(MatIconRegistry);
      registry.setDefaultFontSetClass('material-symbols-outlined');
    }),
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return authService.initialize();
    }),
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }

      startCacicAnalytics();
    }),
  ],
};
