import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  AuthService,
  type AuthenticatedUser,
  authInterceptor,
  provideCacicObservability,
  startCacicAnalytics,
} from '@cacic-fct/shared-angular';
import { MatIconRegistry } from '@angular/material/icon';

registerLocaleData(localePt);

const observabilityEnabled = () => true;
const buildIdentifyData = (user: AuthenticatedUser) => ({
  authenticated: true,
  has_email: Boolean(user.email),
  roles_count: user.roles?.length ?? 0,
  scopes_count: user.scopes?.length ?? 0,
});

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(appRoutes),
    provideCacicObservability({
      analytics: {
        websiteId: 'd8c04657-2416-4af4-b21f-99ea8dcfc5d4',
        domains: ['eventos.cacic.dev.br'],
        isEnabled: observabilityEnabled,
        buildIdentifyData,
      },
      glitchtip: {
        dsn: 'https://b787190b5ac546eb867e793b84d2b4b2@glitchtip.cacic.dev.br/2',
        project: 'admin',
        // isEnabled: observabilityEnabled,
        isEnabled: () => true,
      },
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
      startCacicAnalytics();
    }),
  ],
};
