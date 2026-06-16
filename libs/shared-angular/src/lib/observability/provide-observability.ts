import {
  ErrorHandler,
  EnvironmentProviders,
  Injectable,
  Injector,
  PLATFORM_ID,
  Provider,
  effect,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
  provideEnvironmentInitializer,
  runInInjectionContext,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { provideUmami } from '@cacic-fct/ngx-umami';
import {
  browserTracingIntegration as SentryBrowserTracingIntegration,
  createErrorHandler as SentryCreateErrorHandler,
  init as SentryInit,
  TraceService as SentryTraceService,
} from '@sentry/angular';
import { consoleLoggingIntegration as SentryConsoleLoggingIntegration } from '@sentry/browser';
import type { ErrorEvent as SentryErrorEvent } from '@sentry/angular';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { CacicAnalyticsService, type AnalyticsEventData } from './analytics.service';
import { CACIC_ANALYTICS_CONFIG } from './observability.config';
import type { CacicAnalyticsConfig, CacicObservabilityToggle } from './observability.config';

export type CacicObservabilityConfig = {
  analytics: {
    websiteId: string;
    domains: string[];
    isEnabled: CacicObservabilityToggle;
    buildIdentifyData?: CacicAnalyticsConfig['buildIdentifyData'];
    src?: string;
    replay?: {
      isEnabled: CacicObservabilityToggle;
      src?: string;
      sampleRate?: number;
      maskLevel?: 'none' | 'light' | 'moderate' | 'strict';
      maxDuration?: number;
    };
  };
  glitchtip: {
    dsn: string;
    isEnabled: CacicObservabilityToggle;
    isPerformanceEnabled?: CacicObservabilityToggle;
    project: 'admin' | 'public';
  };
};

const UMAMI_REPLAY_SCRIPT_ID = 'cacic-replay-script';
const DEFAULT_UMAMI_REPLAY_SRC = 'https://a.cacic.dev.br/recorder.js';
const DEFAULT_UMAMI_REPLAY_SAMPLE_RATE = 1;
const DEFAULT_UMAMI_REPLAY_MASK_LEVEL = 'moderate';
const DEFAULT_UMAMI_REPLAY_MAX_DURATION = 1_200_000;

@Injectable()
class CacicObservabilityConsentService {
  private readonly injector = inject(Injector);

  isAnalyticsEnabled(config: CacicObservabilityConfig, user: AuthenticatedUser | null): boolean {
    return Boolean(config.analytics.websiteId) && this.evaluate(() => config.analytics.isEnabled(user));
  }

  isReplayEnabled(config: CacicObservabilityConfig, user: AuthenticatedUser | null): boolean {
    return this.evaluate(() => config.analytics.replay?.isEnabled(user) ?? this.isPerformanceEnabled(config, user));
  }

  isGlitchtipEnabled(config: CacicObservabilityConfig, user: AuthenticatedUser | null): boolean {
    return this.evaluate(() => config.glitchtip.isEnabled(user));
  }

  isPerformanceEnabled(config: CacicObservabilityConfig, user: AuthenticatedUser | null): boolean {
    return this.evaluate(() => config.glitchtip.isPerformanceEnabled?.(user) ?? config.glitchtip.isEnabled(user));
  }

  buildIdentifyData(config: CacicObservabilityConfig, user: AuthenticatedUser): AnalyticsEventData {
    return this.evaluate(() => config.analytics.buildIdentifyData?.(user) ?? {});
  }

  private evaluate<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }
}

@Injectable()
class CacicUmamiReplayScriptLoader {
  private readonly auth = inject(AuthService);
  private readonly consent = inject(CacicObservabilityConsentService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly isBrowser = isPlatformBrowser(this.platformId);

  start(config: CacicObservabilityConfig): void {
    if (!this.isBrowser || isDevMode() || !config.analytics.websiteId) {
      return;
    }

    effect(
      () => {
        if (!this.auth.initialized()) {
          return;
        }

        const user = this.currentUser();
        const canRecord = this.consent.isReplayEnabled(config, user);

        if (canRecord) {
          this.ensureScript(config);
          return;
        }

        this.removeScript();
      },
      { injector: this.injector },
    );
  }

  private ensureScript(config: CacicObservabilityConfig): void {
    if (this.document.getElementById(UMAMI_REPLAY_SCRIPT_ID)) {
      return;
    }

    const replayConfig = config.analytics.replay;
    const script = this.document.createElement('script');
    script.id = UMAMI_REPLAY_SCRIPT_ID;
    script.defer = true;
    script.src = replayConfig?.src ?? DEFAULT_UMAMI_REPLAY_SRC;
    script.dataset['websiteId'] = config.analytics.websiteId;
    script.dataset['sampleRate'] = String(replayConfig?.sampleRate ?? DEFAULT_UMAMI_REPLAY_SAMPLE_RATE);
    script.dataset['maskLevel'] = replayConfig?.maskLevel ?? DEFAULT_UMAMI_REPLAY_MASK_LEVEL;
    script.dataset['maxDuration'] = String(replayConfig?.maxDuration ?? DEFAULT_UMAMI_REPLAY_MAX_DURATION);

    this.document.head.append(script);
  }

  private removeScript(): void {
    this.document.getElementById(UMAMI_REPLAY_SCRIPT_ID)?.remove();
  }

  private currentUser(): AuthenticatedUser | null {
    return typeof this.auth.user === 'function' ? this.auth.user() : null;
  }
}

export function provideCacicObservability(config: CacicObservabilityConfig) {
  const providers: Array<Provider | EnvironmentProviders> = [
    CacicObservabilityConsentService,
    {
      provide: CACIC_ANALYTICS_CONFIG,
      useFactory: () => {
        const consent = inject(CacicObservabilityConsentService);
        return {
          isAnalyticsEnabled: (user: AuthenticatedUser | null) => consent.isAnalyticsEnabled(config, user),
          buildIdentifyData: config.analytics.buildIdentifyData
            ? (user: AuthenticatedUser) => consent.buildIdentifyData(config, user)
            : undefined,
        } satisfies CacicAnalyticsConfig;
      },
    },
  ];

  if (config.glitchtip.dsn) {
    providers.push(
      {
        provide: ErrorHandler,
        useValue: SentryCreateErrorHandler(),
      },
      {
        provide: SentryTraceService,
        deps: [Router],
      },
      provideAppInitializer(() => {
        const authService = inject(AuthService);
        const consent = inject(CacicObservabilityConsentService);

        SentryInit({
          dsn: config.glitchtip.dsn,
          environment: isDevMode() ? 'development' : 'production',
          sendDefaultPii: true,
          integrations: [
            SentryBrowserTracingIntegration(),
            SentryConsoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
          ],
          tracesSampler: () => (consent.isPerformanceEnabled(config, authService.user()) ? 1.0 : 0),
          tracePropagationTargets: [/^https:\/\/eventos\.cacic\.dev\.br\/api/],
          enableLogs: true,
          tunnel: config.glitchtip.project === 'admin' ? '/api/a/glitchtip/admin' : '/api/a/glitchtip/public',
          beforeSend: (event: SentryErrorEvent) => {
            return !isDevMode() && consent.isGlitchtipEnabled(config, authService.user()) ? event : null;
          },
        });

        inject(SentryTraceService);
      }),
    );
  }

  if (config.analytics.websiteId) {
    providers.push(
      provideUmami({
        websiteId: config.analytics.websiteId,
        src: config.analytics.src ?? 'https://a.cacic.dev.br/b.js',
        autoTrack: false,
        domains: config.analytics.domains,
      }),
    );
  }

  providers.push(
    CacicUmamiReplayScriptLoader,
    provideEnvironmentInitializer(() => {
      inject(CacicUmamiReplayScriptLoader).start(config);
    }),
  );

  return makeEnvironmentProviders([...providers]);
}

export function startCacicAnalytics(): void {
  inject(CacicAnalyticsService).start();
}
