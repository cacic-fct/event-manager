import { ServiceWorkerService } from './shared/services/service-worker.service';
import { EnrollmentTypesService } from './shared/services/enrollment-types.service';
import { isDevMode, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AngularFireModule } from '@angular/fire/compat';

import {
  AngularFirestoreModule,
  USE_EMULATOR as USE_FIRESTORE_EMULATOR,
  SETTINGS as FIRESTORE_SETTINGS,
} from '@angular/fire/compat/firestore';
import { AngularFirePerformanceModule, PerformanceMonitoringService } from '@angular/fire/compat/performance';

import { fetchAndActivate, getRemoteConfig, provideRemoteConfig } from '@angular/fire/remote-config';

import {
  AngularFireFunctionsModule,
  REGION as FUNCTIONS_REGION,
  USE_EMULATOR as USE_FUNCTIONS_EMULATOR,
} from '@angular/fire/compat/functions';
import { AngularFireStorageModule, USE_EMULATOR as USE_STORAGE_EMULATOR } from '@angular/fire/compat/storage';

import { environment } from '../environments/environment';

import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
registerLocaleData(localePt);

import { AuthService } from './shared/services/auth.service';
import { WeatherService } from 'src/app/shared/services/weather.service';

import { ServiceWorkerModule } from '@angular/service-worker';
import { MarkdownModule } from 'ngx-markdown';
import { HttpClient, HttpClientModule } from '@angular/common/http';

// Alerts
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

import { initializeApp, provideFirebaseApp } from '@angular/fire/app';

import { provideAppCheck, initializeAppCheck, ReCaptchaV3Provider } from '@angular/fire/app-check';

import { GlobalConstantsService } from './shared/services/global-constants.service';

import { CoursesService } from './shared/services/courses.service';

import { CertificateService } from 'src/app/shared/services/certificates.service';

import { connectAuthEmulator, getAuth, provideAuth, useDeviceLanguage } from '@angular/fire/auth';
import { provideAnalytics, getAnalytics, logEvent } from '@angular/fire/analytics';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFirestoreModule.enablePersistence({ synchronizeTabs: true }),
    AngularFireStorageModule,
    AngularFirePerformanceModule,
    AngularFireFunctionsModule,
    AngularFireStorageModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerImmediately',
    }),
    HttpClientModule,
    MarkdownModule.forRoot({ loader: HttpClient }),
    SweetAlert2Module.forRoot(),
    provideAppCheck(() => {
      const provider = new ReCaptchaV3Provider(environment.recaptcha3SiteKey);
      return initializeAppCheck(undefined, {
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

    provideFirebaseApp(() => initializeApp(environment.firebase)),
  ],
  providers: [
    PerformanceMonitoringService,
    ServiceWorkerService,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: FIRESTORE_SETTINGS, useValue: { ignoreUndefinedProperties: true, merge: true } },
    { provide: FUNCTIONS_REGION, useValue: 'southamerica-east1' },
    { provide: USE_FIRESTORE_EMULATOR, useValue: environment.useEmulators ? ['localhost', 8081] : undefined },
    { provide: USE_FUNCTIONS_EMULATOR, useValue: environment.useEmulators ? ['localhost', 5001] : undefined },
    { provide: USE_STORAGE_EMULATOR, useValue: environment.useEmulators ? ['localhost', 9199] : undefined },

    AuthService,
    CoursesService,
    WeatherService,
    EnrollmentTypesService,
    CertificateService,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
