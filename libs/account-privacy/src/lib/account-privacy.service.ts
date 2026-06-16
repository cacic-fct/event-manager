import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  of,
  shareReplay,
  tap,
} from 'rxjs';
import {
  CACIC_ACCOUNT_PRIVACY_CONFIG,
  CacicAccountPrivacyConfig,
} from './account-privacy.config';
import type {
  CacicAccountPrivacySetting,
  CacicPrivacyPreferences,
} from './account-privacy.types';

@Injectable({ providedIn: 'root' })
export class CacicAccountPrivacyService {
  private readonly config = inject(CACIC_ACCOUNT_PRIVACY_CONFIG);
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly settingsSignal = signal<CacicAccountPrivacySetting | null>(
    null,
  );
  private readonly loadedSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private loadRequest$: Observable<CacicAccountPrivacySetting | null> | null =
    null;

  readonly settings = this.settingsSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly preferences = computed(() => this.resolvePreferences());
  readonly analyticsEnabled = computed(() =>
    this.isAllowedByPreferences('analytics_tracking'),
  );
  readonly errorDebuggingEnabled = computed(() =>
    this.isAllowedByPreferences('error_debugging'),
  );
  readonly performanceMonitoringEnabled = computed(() =>
    this.isAllowedByPreferences('performance_monitoring'),
  );
  readonly cookieBannerAccepted = computed(
    () => this.preferences().cookie_banner_accepted,
  );

  initialize(): Promise<CacicAccountPrivacySetting | null> {
    if (!this.isBrowser) {
      this.loadedSignal.set(true);
      return Promise.resolve(null);
    }

    return firstValueFrom(this.loadSettings());
  }

  loadSettings(forceRefresh = false): Observable<CacicAccountPrivacySetting | null> {
    if (!this.isBrowser) {
      this.loadedSignal.set(true);
      return of(null);
    }

    if (!forceRefresh) {
      const settings = this.settingsSignal();
      if (settings) {
        return of(settings);
      }

      if (this.loadedSignal()) {
        return of(null);
      }
    }

    if (this.loadRequest$) {
      return this.loadRequest$;
    }

    this.loadingSignal.set(true);

    this.loadRequest$ = this.http
      .get<CacicAccountPrivacySetting>(
        `${this.config.apiBaseUrl}/privacy/settings`,
        {
          withCredentials: true,
        },
      )
      .pipe(
        map((settings) => this.normalizeSettings(settings, this.config)),
        tap((settings) => {
          this.settingsSignal.set(settings);
          this.loadedSignal.set(true);
        }),
        catchError(() => {
          this.settingsSignal.set(null);
          this.loadedSignal.set(true);
          return of(null);
        }),
        finalize(() => {
          this.loadingSignal.set(false);
          this.loadRequest$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.loadRequest$;
  }

  refresh(): Observable<CacicAccountPrivacySetting | null> {
    return this.loadSettings(true);
  }

  isAnalyticsEnabled(): boolean {
    return this.analyticsEnabled();
  }

  isErrorDebuggingEnabled(): boolean {
    return this.errorDebuggingEnabled();
  }

  isPerformanceMonitoringEnabled(): boolean {
    return this.performanceMonitoringEnabled();
  }

  getPreferencesSnapshot(): CacicPrivacyPreferences {
    return this.preferences();
  }

  private resolvePreferences(): CacicPrivacyPreferences {
    const settings = this.settingsSignal();
    if (settings) {
      return settings.settings;
    }

    return this.loadedSignal()
      ? this.config.unavailablePreferences
      : this.config.initialPreferences;
  }

  private isAllowedByPreferences(
    key: Exclude<keyof CacicPrivacyPreferences, 'cookie_banner_accepted'>,
  ): boolean {
    const preferences = this.preferences();
    if (
      this.config.requireCookieBannerAcceptance &&
      !preferences.cookie_banner_accepted
    ) {
      return false;
    }

    return preferences[key];
  }

  private normalizeSettings(
    setting: CacicAccountPrivacySetting,
    config: CacicAccountPrivacyConfig,
  ): CacicAccountPrivacySetting {
    return {
      ...setting,
      settings: {
        ...config.unavailablePreferences,
        ...setting.settings,
      },
    };
  }
}
