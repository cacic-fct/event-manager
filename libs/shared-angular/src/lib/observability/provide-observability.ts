import {
  ErrorHandler,
  EnvironmentProviders,
  Service,
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
import { provideUmamiWithFactory } from '@cacic-fct/ngx-umami';
import type { ErrorEvent as SentryErrorEvent } from '@sentry/angular';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { CacicAnalyticsService, type AnalyticsEventData } from './analytics.service';
import { CACIC_ANALYTICS_CONFIG } from './observability.config';
import type { CacicAnalyticsConfig, CacicObservabilityToggle } from './observability.config';
import {
  assertTrustedExternalScriptUrl,
  provideCacicTrustedTypes,
  trustedExternalScriptUrl,
} from '../security/trusted-types';
import { CACIC_OBSERVABILITY_REPLAY_IS_DEVELOPMENT } from './replay-development-mode.token';
import { filterCacicSentryLog } from './sentry-log-filter';

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
const DEFAULT_UMAMI_ANALYTICS_SRC = 'https://a.cacic.com.br/b.js';
const DEFAULT_UMAMI_REPLAY_SRC = 'https://a.cacic.com.br/recorder.js';
const UMAMI_SESSION_POLL_INTERVAL_MS = 250;

type UmamiSessionTracker = {
  getSession?: () => { cache?: string; website?: string };
};

@Service({ autoProvided: false })
class CacicSentryErrorHandler implements ErrorHandler {
  private readonly fallbackErrorHandler = new ErrorHandler();

  handleError(error: unknown): void {
    this.fallbackErrorHandler.handleError(error);
    void import('@sentry/angular').then((sentry) => sentry.captureException(error)).catch(() => undefined);
  }
}

@Service({ autoProvided: false })
class CacicObservabilityConsentService {
  private readonly injector = inject(Injector);

  isAnalyticsEnabled(config: CacicObservabilityConfig, user: AuthenticatedUser | null): boolean {
    return Boolean(config.analytics.websiteId) && this.evaluate(() => config.analytics.isEnabled(user));
  }

  isReplayEnabled(config: CacicObservabilityConfig, user: AuthenticatedUser | null): boolean {
    try {
      return (
        this.isAnalyticsEnabled(config, user) && this.evaluate(() => config.analytics.replay?.isEnabled(user) ?? true)
      );
    } catch {
      return false;
    }
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

@Service({ autoProvided: false })
class CacicUmamiReplayScriptLoader {
  private readonly auth = inject(AuthService);
  private readonly consent = inject(CacicObservabilityConsentService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isDevelopment = inject(CACIC_OBSERVABILITY_REPLAY_IS_DEVELOPMENT);

  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private recorderLoaded = false;

  start(config: CacicObservabilityConfig): void {
    if (!this.isBrowser || this.isDevelopment || !config.analytics.websiteId) {
      return;
    }

    effect(
      (onCleanup) => {
        if (!this.auth.initialized()) {
          this.removeScript();
          return;
        }

        const user = this.currentUser();
        const canRecord = this.consent.isReplayEnabled(config, user);

        if (canRecord) {
          // The recorder abandons startup after five seconds without a session.
          // Wait here instead so slow tracker loads and collect requests can finish.
          let timer: ReturnType<typeof setTimeout> | undefined;
          const loadWhenReady = () => {
            if (this.hasAnalyticsSession(config.analytics.websiteId)) {
              this.ensureScript(config);
              return;
            }

            timer = setTimeout(loadWhenReady, UMAMI_SESSION_POLL_INTERVAL_MS);
          };
          loadWhenReady();
          onCleanup(() => clearTimeout(timer));
          return;
        }

        this.removeScript();
      },
      { injector: this.injector },
    );
  }

  private hasAnalyticsSession(websiteId: string): boolean {
    const tracker = this.document.defaultView?.umami as UmamiSessionTracker | undefined;
    const session = tracker?.getSession?.();
    return Boolean(session?.cache) && session?.website === websiteId;
  }

  private ensureScript(config: CacicObservabilityConfig): void {
    if (this.document.getElementById(UMAMI_REPLAY_SCRIPT_ID)) {
      return;
    }

    const replayConfig = config.analytics.replay;
    const script = this.document.createElement('script');
    script.id = UMAMI_REPLAY_SCRIPT_ID;
    script.defer = true;
    script.src = trustedExternalScriptUrl(replayConfig?.src ?? DEFAULT_UMAMI_REPLAY_SRC);
    script.dataset['websiteId'] = config.analytics.websiteId;
    script.onload = () => {
      this.recorderLoaded = true;
      if (!this.auth.initialized() || !this.consent.isReplayEnabled(config, this.currentUser())) {
        this.removeScript();
      }
    };

    this.document.head.append(script);
  }

  private removeScript(): void {
    this.document.getElementById(UMAMI_REPLAY_SCRIPT_ID)?.remove();
    if (this.recorderLoaded) {
      // Removing an executed script does not stop its observers. Umami exposes
      // no recorder stop API, so end the document when tracking is revoked.
      this.recorderLoaded = false;
      this.document.defaultView?.location.reload();
    }
  }

  private currentUser(): AuthenticatedUser | null {
    return typeof this.auth.user === 'function' ? this.auth.user() : null;
  }
}

export function provideCacicObservability(config: CacicObservabilityConfig) {
  const analyticsScriptUrl = assertTrustedExternalScriptUrl(config.analytics.src ?? DEFAULT_UMAMI_ANALYTICS_SRC);
  const providers: Array<Provider | EnvironmentProviders> = [
    provideCacicTrustedTypes(),
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
        useClass: CacicSentryErrorHandler,
      },
      provideAppInitializer(() => {
        const authService = inject(AuthService);
        const consent = inject(CacicObservabilityConsentService);
        const injector = inject(Injector);

        void startCacicSentry(config, authService, consent, injector);
      }),
    );
  }

  if (config.analytics.websiteId) {
    providers.push(
      provideUmamiWithFactory(() => ({
        websiteId: config.analytics.websiteId,
        src: trustedExternalScriptUrl(analyticsScriptUrl),
        autoTrack: false,
        domains: config.analytics.domains,
      })),
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

async function startCacicSentry(
  config: CacicObservabilityConfig,
  authService: AuthService,
  consent: CacicObservabilityConsentService,
  injector: Injector,
): Promise<void> {
  try {
    const [sentryAngular, sentryBrowser] = await Promise.all([import('@sentry/angular'), import('@sentry/browser')]);

    sentryAngular.init({
      dsn: config.glitchtip.dsn,
      environment: isDevMode() ? 'development' : 'production',
      sendDefaultPii: true,
      integrations: [
        sentryAngular.browserTracingIntegration(),
        sentryBrowser.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      ],
      tracesSampler: () => (consent.isPerformanceEnabled(config, authService.user()) ? 1.0 : 0),
      tracePropagationTargets: [/^https:\/\/eventos\.cacic\.dev\.br\/api/],
      enableLogs: true,
      tunnel: config.glitchtip.project === 'admin' ? '/api/a/glitchtip/admin' : '/api/a/glitchtip/public',
      beforeSend: (event: SentryErrorEvent) => {
        return !isDevMode() && consent.isGlitchtipEnabled(config, authService.user()) ? event : null;
      },
      beforeSendLog: (log) =>
        filterCacicSentryLog(log, consent.isGlitchtipEnabled(config, authService.user()), isDevMode()),
    });

    injector.get(sentryAngular.TraceService);
  } catch {
    return;
  }
}
