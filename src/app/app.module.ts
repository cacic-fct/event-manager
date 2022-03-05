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
} from '@angular/fire/compat/analytics';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import {
  AngularFirePerformanceModule,
  PerformanceMonitoringService,
} from '@angular/fire/compat/performance';
import {
  AngularFireRemoteConfigModule,
  DEFAULTS,
  SETTINGS,
} from '@angular/fire/compat/remote-config';

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

@NgModule({
  declarations: [AppComponent],
  entryComponents: [],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAnalyticsModule,
    AngularFirestoreModule.enablePersistence({ synchronizeTabs: true }),
    AngularFireRemoteConfigModule,
    AngularFirePerformanceModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerImmediately',
    }),
    HttpClientModule,
    MarkdownModule.forRoot({ loader: HttpClient }),
  ],
  providers: [
    ScreenTrackingService,
    UserTrackingService,
    PerformanceMonitoringService,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    {
      provide: SETTINGS,
      useFactory: () =>
        isDevMode() ? { minimumFetchIntervalMillis: 10_000 } : {},
    },
    AuthService,
    RemoteConfigService,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
