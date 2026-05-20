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
import { AuthOnlineStatusService, AuthService, authInterceptor } from '@cacic-fct/shared-angular';
import { MatIconRegistry } from '@angular/material/icon';
import { provideServiceWorker } from '@angular/service-worker';
import { OnlineAttendanceCoordinatorService } from './attendance/online-attendance-coordinator.service';
import { OfflineUserDataService } from './shared/offline-user-data.service';
import { NetworkStatusService } from './shared/network-status.service';
import { NetworkStatusSnackbarService } from './shared/network-status-snackbar.service';
import { AppRouteReuseStrategy } from './tabs/reuse.strategy';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAppInitializer(() => {
      const registry = inject(MatIconRegistry);
      registry.setDefaultFontSetClass('material-icons-outlined');
    }),
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return authService.initialize();
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
