import { isDevMode, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AngularFireModule } from '@angular/fire/compat';
import {
  AngularFireAnalyticsModule,
  ScreenTrackingService,
  UserTrackingService,
  APP_NAME,
  APP_VERSION,
} from '@angular/fire/compat/analytics';
import { AngularFirestoreModule, USE_EMULATOR as USE_FIRESTORE_EMULATOR } from '@angular/fire/compat/firestore';
import { AngularFirePerformanceModule, PerformanceMonitoringService } from '@angular/fire/compat/performance';
import {
  AngularFireRemoteConfigModule,
  DEFAULTS as REMOTE_CONFIG_DEFAULTS,
  SETTINGS as REMOTE_CONFIG_SETTING,
} from '@angular/fire/compat/remote-config';
import { AngularFireFunctionsModule, USE_EMULATOR as USE_FUNCTIONS_EMULATOR } from '@angular/fire/compat/functions';

import { environment } from '../environments/environment';

import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
registerLocaleData(localePt);

import { AuthService } from './shared/services/auth.service';
import { RemoteConfigService } from './shared/services/remote-config.service';

import { ServiceWorkerModule } from '@angular/service-worker';
import { MarkdownModule } from 'ngx-markdown';
import { HttpClient, HttpClientModule } from '@angular/common/http';

// Alerts
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

import { initializeApp, provideFirebaseApp } from '@angular/fire/app';

import { provideAppCheck, initializeAppCheck, ReCaptchaV3Provider } from '@angular/fire/app-check';

import { GlobalConstantsService } from './shared/services/global-constants.service';

import { CoursesService } from './shared/services/courses.service';

import {
  AngularFireAuthModule,
  USE_DEVICE_LANGUAGE,
  USE_EMULATOR as USE_AUTH_EMULATOR,
} from '@angular/fire/compat/auth';

@NgModule({
  declarations: [AppComponent],
  entryComponents: [],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    AngularFireAuthModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAnalyticsModule,
    AngularFirestoreModule.enablePersistence({ synchronizeTabs: true }),
    AngularFireRemoteConfigModule,
    AngularFirePerformanceModule,
    AngularFireFunctionsModule,
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
    provideFirebaseApp(() => initializeApp(environment.firebase)),
  ],
  providers: [
    ScreenTrackingService,
    UserTrackingService,
    PerformanceMonitoringService,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    {
      provide: REMOTE_CONFIG_SETTING,
      useFactory: () =>
        isDevMode()
          ? { minimumFetchIntervalMillis: 10_000, fetchTimeoutMillis: 60_000 }
          : { minimumFetchIntervalMillis: 43_200_000, fetchTimeoutMillis: 60_000 },
    },
    { provide: USE_DEVICE_LANGUAGE, useValue: true },
    { provide: APP_VERSION, useValue: GlobalConstantsService.appVersion },
    { provide: APP_NAME, useValue: GlobalConstantsService.appName },
    {
      provide: USE_AUTH_EMULATOR,
      useValue: environment.useEmulators ? ['http://localhost:9099', { disableWarnings: true }] : undefined,
    },
    { provide: USE_FIRESTORE_EMULATOR, useValue: environment.useEmulators ? ['localhost', 8081] : undefined },
    { provide: USE_FUNCTIONS_EMULATOR, useValue: environment.useEmulators ? ['localhost', 5001] : undefined },

    AuthService,
    RemoteConfigService,
    CoursesService,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
