import { isDevMode, NgModule, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ServiceWorkerModule } from '@angular/service-worker';
import localePt from '@angular/common/locales/pt';
registerLocaleData(localePt);

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

// AngularFire
import { initializeApp, provideFirebaseApp, getApp } from '@angular/fire/app';
import { getFunctions, provideFunctions, connectFunctionsEmulator } from '@angular/fire/functions';
import { fetchAndActivate, getRemoteConfig, provideRemoteConfig } from '@angular/fire/remote-config';
import { getStorage, provideStorage, connectStorageEmulator } from '@angular/fire/storage';
import { provideAppCheck, initializeAppCheck, ReCaptchaV3Provider } from '@angular/fire/app-check';
import { connectAuthEmulator, getAuth, provideAuth, useDeviceLanguage } from '@angular/fire/auth';
import { provideAnalytics, getAnalytics, logEvent } from '@angular/fire/analytics';
import { provideFirestore, initializeFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';

import { AngularFirePerformanceModule, PerformanceMonitoringService } from '@angular/fire/compat/performance';
import { AngularFireModule } from '@angular/fire/compat';
import {
  AngularFirestoreModule,
  USE_EMULATOR as USE_FIRESTORE_EMULATOR,
  SETTINGS as FIRESTORE_SETTINGS,
} from '@angular/fire/compat/firestore';

// App
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { environment } from '../environments/environment';
import { GlobalConstantsService } from './shared/services/global-constants.service';

// Other modules
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import { MarkdownModule } from 'ngx-markdown';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerImmediately',
    }),
    HttpClientModule,
    IonicModule.forRoot(),

    // Other modules
    MarkdownModule.forRoot({ loader: HttpClient }),
    SweetAlert2Module.forRoot(),

    // AngularFire
    AngularFireModule.initializeApp(environment.firebase),
    AngularFirestoreModule.enablePersistence({ synchronizeTabs: true }),
    AngularFirePerformanceModule,

    provideAppCheck(() => {
      const provider = new ReCaptchaV3Provider(environment.recaptcha3SiteKey);
      return initializeAppCheck(getApp(), {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
    }),

    provideRemoteConfig(() => {
      const remoteConfig = getRemoteConfig();

      if (isDevMode()) {
        remoteConfig.settings.minimumFetchIntervalMillis = 10_000;
        remoteConfig.settings.fetchTimeoutMillis = 60_000;
      } else {
        remoteConfig.settings.minimumFetchIntervalMillis = 43_200_000;
        remoteConfig.settings.fetchTimeoutMillis = 60_000;
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

    provideAuth(() => {
      const auth = getAuth();

      useDeviceLanguage(auth);

      if (environment.useEmulators) {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      }
      return auth;
    }),

    provideAnalytics(() => {
      const analytics = getAnalytics();

      logEvent(analytics, 'app_version', {
        app_name: GlobalConstantsService.appName,
        app_version: GlobalConstantsService.appVersion,
      });

      return analytics;
    }),

    provideStorage(() => {
      const storage = getStorage();

      if (environment.useEmulators) {
        connectStorageEmulator(storage, 'localhost', 9199);
      }

      return storage;
    }),

    provideFunctions(() => {
      const functions = getFunctions(getApp(), 'southamerica-east1');
      if (environment.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      return functions;
    }),

    provideFirestore(() => {
      const firestore = initializeFirestore(getApp(), {
        ignoreUndefinedProperties: true,
      });

      if (environment.useEmulators) {
        connectFirestoreEmulator(firestore, 'localhost', 8081);
      }

      return firestore;
    }),

    provideFirebaseApp(() => initializeApp(environment.firebase)),
  ],
  providers: [
    PerformanceMonitoringService,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: FIRESTORE_SETTINGS, useValue: { ignoreUndefinedProperties: true, merge: true } },
    { provide: USE_FIRESTORE_EMULATOR, useValue: environment.useEmulators ? ['localhost', 8081] : undefined },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
