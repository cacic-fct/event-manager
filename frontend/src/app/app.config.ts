import { ApplicationConfig } from '@angular/core';
import {
  LOCALE_ID,
  isDevMode,
  importProvidersFrom,
  provideExperimentalZonelessChangeDetection,
  CSP_NONCE,
} from '@angular/core';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { environment } from '../environments/environment';
import {
  provideFirestore,
  initializeFirestore,
  //persistentLocalCache,
  //persistentMultipleTabManager,
  connectFirestoreEmulator,
} from '@angular/fire/firestore';
import { provideFunctions, getFunctions, connectFunctionsEmulator } from '@angular/fire/functions';
import { provideStorage, getStorage, connectStorageEmulator } from '@angular/fire/storage';

import { provideAuth, getAuth, useDeviceLanguage, connectAuthEmulator } from '@angular/fire/auth';
import { provideRemoteConfig, getRemoteConfig, fetchAndActivate } from '@angular/fire/remote-config';
import { getApp, provideFirebaseApp, initializeApp } from '@angular/fire/app';

import { provideAppCheck, initializeAppCheck, ReCaptchaV3Provider } from '@angular/fire/app-check';

import { AngularFireModule } from '@angular/fire/compat';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import { provideMarkdown } from 'ngx-markdown';
import { withInterceptorsFromDi, provideHttpClient, HttpClient } from '@angular/common/http';
import { ServiceWorkerModule } from '@angular/service-worker';
import { routes } from 'src/app/app.routes';
import { BrowserModule, provideClientHydration } from '@angular/platform-browser';
import {
  SETTINGS as FIRESTORE_SETTINGS,
  USE_EMULATOR as USE_FIRESTORE_EMULATOR,
  AngularFirestoreModule,
} from '@angular/fire/compat/firestore';
import { IonicRouteStrategy, isPlatform, provideIonicAngular } from '@ionic/angular/standalone';
import { PreloadingStrategyService } from 'src/app/shared/services/routing/preloading-strategy.service';

import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
registerLocaleData(localePt);

import { unwrapResourceUrl, trustedResourceUrl } from 'safevalues';

import { provideLottieOptions } from 'ngx-lottie';

import { init as initSentry } from '@sentry/angular';

import { nonce } from 'src/main';

setupAnalytics();

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: CSP_NONCE, useValue: nonce },

    provideExperimentalZonelessChangeDetection(),

    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({
      backButtonText: isPlatform('ios') ? 'Voltar' : undefined,
    }),

    provideRouter(routes, withPreloading(PreloadingStrategyService), withComponentInputBinding()),

    provideMarkdown({
      loader: HttpClient,
    }),

    importProvidersFrom(
      BrowserModule,
      ServiceWorkerModule.register(unwrapResourceUrl(trustedResourceUrl`/ngsw-worker.js`) as string, {
        enabled: environment.production,
        registrationStrategy: 'registerImmediately',
      }),
      // Other modules
      SweetAlert2Module.forRoot(),
      // AngularFire
      AngularFireModule.initializeApp(environment.firebase),

      // TODO: https://github.com/cacic-fct/fct-app/issues/172
      AngularFirestoreModule, //.enablePersistence({ synchronizeTabs: true }),
    ),

    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAppCheck(() => {
      const provider = new ReCaptchaV3Provider(environment.recaptcha3SiteKey);
      return initializeAppCheck(getApp(), {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
    }),
    provideAuth(() => {
      const auth = getAuth();
      useDeviceLanguage(auth);
      if (environment.firebase.useEmulators) {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      }
      return auth;
    }),
    provideRemoteConfig(() => {
      const remoteConfig = getRemoteConfig();
      if (isDevMode()) {
        remoteConfig.settings.minimumFetchIntervalMillis = 10000;
        remoteConfig.settings.fetchTimeoutMillis = 60000;
      } else {
        remoteConfig.settings.minimumFetchIntervalMillis = 43200000;
        remoteConfig.settings.fetchTimeoutMillis = 60000;
      }
      remoteConfig.defaultConfig = {
        calendarItemViewDefault: true,
        mapTabEnabled: true,
        manualTabEnabled: false,
        eventsTabEnabled: true,
        registerPrompt: true,
      };
      fetchAndActivate(remoteConfig).catch((err) => {
        console.error(err);
      });
      return remoteConfig;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (environment.firebase.useEmulators) {
        connectStorageEmulator(storage, 'localhost', 9199);
      }
      return storage;
    }),
    provideFunctions(() => {
      const functions = getFunctions(getApp(), 'southamerica-east1');
      if (environment.firebase.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      return functions;
    }),
    provideFirestore(() => {
      const firestore = initializeFirestore(getApp(), {
        ignoreUndefinedProperties: true,

        // TODO: https://github.com/cacic-fct/fct-app/issues/172
        // localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
      if (environment.firebase.useEmulators) {
        connectFirestoreEmulator(firestore, 'localhost', 8081);
      }
      return firestore;
    }),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: FIRESTORE_SETTINGS, useValue: { ignoreUndefinedProperties: true, merge: true } },
    {
      provide: USE_FIRESTORE_EMULATOR,
      useValue: environment.firebase.useEmulators ? ['localhost', 8081] : undefined,
    },
    provideHttpClient(withInterceptorsFromDi()),
    provideLottieOptions({
      player: () => import('lottie-web'),
    }),
    provideClientHydration(),
  ],
};

function setupAnalytics(): void {
  if (localStorage.getItem('disable-monitoring') !== 'true') {
    console.debug('DEBUG: main.ts: Glitchtip Monitoring: Enabled');
    initSentry({
      dsn: 'https://44b2480fd6cd4402b61590135a093fd6@glitchtip.cacic.dev.br/1',
      environment: isDevMode() ? 'development' : 'production',
      release: environment.appVersion,
    });
  } else {
    console.debug('DEBUG: main.ts: Glitchtip Monitoring: Disabled');
  }

  if (localStorage.getItem('disable-analytics') !== 'true') {
    const script = document.createElement('script');
    script.id = 'plausible-script';
    script.async = true;
    script.defer = true;
    script.src = 'https://plausible.cacic.dev.br/js/script.file-downloads.pageview-props.outbound-links.js';
    script.setAttribute('data-domain', 'fctapp.cacic.dev.br');

    // Pageview custom properties
    script.setAttribute('event-app_version', environment.appVersion);

    document.head.appendChild(script);
    console.debug('DEBUG: main.ts: Plausible Analytics: Enabled');
  } else {
    console.debug('DEBUG: main.ts: Plausible Analytics: Disabled');
  }
}
