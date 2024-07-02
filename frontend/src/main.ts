import {
  LOCALE_ID,
  isDevMode,
  importProvidersFrom,
  provideExperimentalZonelessChangeDetection,
  CSP_NONCE,
} from '@angular/core';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';
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
import { MarkdownModule } from 'ngx-markdown';
import { withInterceptorsFromDi, provideHttpClient, HttpClient } from '@angular/common/http';
import { ServiceWorkerModule } from '@angular/service-worker';
import { routes } from 'src/app/app.routes';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
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
import { setNonce } from '@ionic/core/components';

import { H } from 'highlight.run';
import { provideLottieOptions } from 'ngx-lottie';

console.debug('DEBUG: main.ts: Nonce: Will fetch nonce');
const nonce = fetchNonce();
setNonce(nonce);

setupAnalytics(nonce);

bootstrapApplication(AppComponent, {
  providers: [
    { provide: CSP_NONCE, useValue: nonce },

    provideExperimentalZonelessChangeDetection(),

    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({
      backButtonText: isPlatform('ios') ? 'Voltar' : undefined,
    }),

    provideRouter(routes, withPreloading(PreloadingStrategyService), withComponentInputBinding()),

    importProvidersFrom(
      BrowserModule,
      ServiceWorkerModule.register(unwrapResourceUrl(trustedResourceUrl`/ngsw-worker.js`) as string, {
        enabled: environment.production,
        registrationStrategy: 'registerImmediately',
      }),
      // Other modules
      MarkdownModule.forRoot({ loader: HttpClient }),
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
  ],
}).catch((err) => console.log(err));

function fetchNonce(): string {
  const regex = new RegExp(`s*nonce=`);
  const nonce = document.cookie.split(';').find((cookie) => cookie.match(regex));
  console.debug('DEBUG: main.ts: Nonce:', nonce?.split('=')[1].slice(0, 7));
  if (!nonce) {
    if (isDevMode()) {
      console.debug('DEBUG: main.ts: Nonce: Using development-nonce');
      return 'development-nonce';
    }

    const message =
      'Ocorreu um erro ao validar a integridade do aplicativo.\nRecarregue a página.\nErro: Nonce não encontrado';

    window.alert(message);

    window.location.reload();

    throw new Error('Nonce not found in cookies');
  }
  return nonce.split('=')[1];
}

function setupAnalytics(nonce: string): void {
  if (localStorage.getItem('disable-monitoring') !== 'true') {
    console.debug('DEBUG: main.ts: Highlight Monitoring: Enabled');
    H.init('1jdkoe52', {
      environment: isDevMode() ? 'dev' : 'production',
      backendUrl: 'https://api-highlight.cacic.dev.br/public',
      networkRecording: {
        enabled: true,
        recordHeadersAndBody: true,
        urlBlocklist: [],
      },
      privacySetting: 'none',
      sendMode: 'webworker',
    });
  } else {
    console.debug('DEBUG: main.ts: Highlight Monitoring: Disabled');
  }

  if (localStorage.getItem('disable-analytics') !== 'true') {
    const script = document.createElement('script');
    script.setAttribute('nonce', nonce);
    script.async = true;
    script.defer = true;
    script.src = 'https://plausible.cacic.dev.br/js/script.js';
    script.setAttribute('data-domain', 'fctapp.cacic.dev.br');
    document.head.appendChild(script);

    console.debug('DEBUG: main.ts: Plausible Analytics: Enabled');
  } else {
    console.debug('DEBUG: main.ts: Plausible Analytics: Disabled');
  }
}
