import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { ApplicationRef, PLATFORM_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CacicTrustedTypesService } from '../security/trusted-types';
import { provideCacicObservability, type CacicObservabilityConfig } from './provide-observability';
import { CACIC_OBSERVABILITY_REPLAY_IS_DEVELOPMENT } from './replay-development-mode.token';

describe('provideCacicObservability replay script loader', () => {
  const replayScriptId = 'cacic-replay-script';
  let auth: Pick<AuthService, 'initialized' | 'user'>;
  let application: ApplicationRef | undefined;
  let sessionCache: string | undefined;
  let sessionWebsite: string;

  const tracker = {
    track: vi.fn(),
    identify: vi.fn(),
    getSession: () => ({ cache: sessionCache, website: sessionWebsite }),
  };

  beforeEach(() => {
    document.getElementById(replayScriptId)?.remove();
    sessionCache = 'test-session';
    sessionWebsite = 'test-website';
    window.umami = tracker;
    auth = {
      initialized: signal(false),
      user: signal<AuthenticatedUser | null>(null),
    };
  });

  afterEach(async () => {
    application?.destroy();
    application = undefined;
    delete window.umami;
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById(replayScriptId)?.remove();
  });

  it('loads replay for anonymous visitors by default when analytics is enabled', async () => {
    await createLoader();
    auth.initialized.set(true);
    await settleEffects();

    expect(document.getElementById(replayScriptId)).not.toBeNull();
  });

  it('keeps replay disabled when its explicit gate is false even if other consent gates are enabled', async () => {
    await createLoader({ isEnabled: () => false });
    auth.initialized.set(true);
    await settleEffects();

    expect(document.getElementById(replayScriptId)).toBeNull();
  });

  it('fails closed when the explicit replay gate throws', async () => {
    await createLoader({
      isEnabled: () => {
        throw new Error('Replay preference unavailable');
      },
    });
    auth.initialized.set(true);
    await settleEffects();

    expect(document.getElementById(replayScriptId)).toBeNull();
  });

  it('loads replay after auth initialization independently of diagnostics and performance preferences', async () => {
    await createLoader(
      { isEnabled: () => true },
      {
        isAnalyticsEnabled: true,
        isDiagnosticsEnabled: false,
        isPerformanceEnabled: false,
      },
    );
    await settleEffects();

    expect(document.getElementById(replayScriptId)).toBeNull();

    auth.initialized.set(true);
    await settleEffects();

    const script = document.getElementById(replayScriptId) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script?.src).toBe('https://a.cacic.com.br/recorder.js');
    expect(script?.dataset['websiteId']).toBe('test-website');
  });

  it('respects analytics opt-out even when replay is explicitly enabled', async () => {
    await createLoader(
      { isEnabled: () => true },
      {
        isAnalyticsEnabled: false,
        isDiagnosticsEnabled: true,
        isPerformanceEnabled: true,
      },
    );
    auth.initialized.set(true);
    await settleEffects();

    expect(document.getElementById(replayScriptId)).toBeNull();
  });

  it('loads replay for authenticated visitors after their preference gate is ready', async () => {
    const preferencesLoaded = signal(false);
    auth.user.set({ sub: 'test-user' });
    await createLoader({ isEnabled: () => preferencesLoaded() });
    auth.initialized.set(true);
    await settleEffects();
    expect(document.getElementById(replayScriptId)).toBeNull();

    preferencesLoaded.set(true);
    await settleEffects();

    expect(document.getElementById(replayScriptId)).not.toBeNull();
  });

  it('waits beyond the recorder startup timeout for a matching analytics session', async () => {
    delete window.umami;
    sessionCache = undefined;
    await createLoader();
    vi.useFakeTimers();
    auth.initialized.set(true);
    await vi.advanceTimersByTimeAsync(6000);
    expect(document.getElementById(replayScriptId)).toBeNull();

    window.umami = tracker;
    sessionCache = 'test-session';
    sessionWebsite = 'another-website';
    await vi.advanceTimersByTimeAsync(250);
    expect(document.getElementById(replayScriptId)).toBeNull();

    sessionWebsite = 'test-website';
    await vi.advanceTimersByTimeAsync(250);
    expect(document.getElementById(replayScriptId)).not.toBeNull();
  });

  it('cancels pending startup when replay is disabled', async () => {
    sessionCache = undefined;
    const replayAllowed = signal(true);
    await createLoader({ isEnabled: () => replayAllowed() });
    vi.useFakeTimers();
    auth.initialized.set(true);
    await vi.advanceTimersByTimeAsync(0);

    replayAllowed.set(false);
    await vi.advanceTimersByTimeAsync(0);
    sessionCache = 'test-session';
    await vi.advanceTimersByTimeAsync(1000);

    expect(document.getElementById(replayScriptId)).toBeNull();
  });

  it('cancels pending startup when the application is destroyed', async () => {
    sessionCache = undefined;
    await createLoader();
    vi.useFakeTimers();
    auth.initialized.set(true);
    await vi.advanceTimersByTimeAsync(0);
    application?.destroy();
    application = undefined;
    sessionCache = 'test-session';
    await vi.advanceTimersByTimeAsync(1000);

    expect(document.getElementById(replayScriptId)).toBeNull();
  });

  it('ends an executed recorder when analytics is opted out', async () => {
    const analyticsAllowed = signal(true);
    const otherConsents = {
      isAnalyticsEnabled: analyticsAllowed,
      isDiagnosticsEnabled: true,
      isPerformanceEnabled: true,
    };
    await createLoader(undefined, otherConsents);
    auth.initialized.set(true);
    await settleEffects();
    document.getElementById(replayScriptId)?.dispatchEvent(new Event('load'));
    const reload = vi.fn();
    vi.spyOn(document, 'defaultView', 'get').mockReturnValue({
      location: { reload },
    } as unknown as Window & typeof globalThis);

    analyticsAllowed.set(false);
    await settleEffects();

    expect(document.getElementById(replayScriptId)).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('removes the recorder script when explicit replay consent is revoked', async () => {
    const replayAllowed = signal(true);
    await createLoader({ isEnabled: () => replayAllowed() });
    auth.initialized.set(true);
    await settleEffects();
    expect(document.getElementById(replayScriptId)).not.toBeNull();

    replayAllowed.set(false);
    await settleEffects();

    expect(document.getElementById(replayScriptId)).toBeNull();
  });

  it('removes the recorder script while auth state is being reinitialized', async () => {
    await createLoader({ isEnabled: () => true });
    auth.initialized.set(true);
    await settleEffects();
    expect(document.getElementById(replayScriptId)).not.toBeNull();

    auth.initialized.set(false);
    await settleEffects();

    expect(document.getElementById(replayScriptId)).toBeNull();
  });

  async function createLoader(
    replay?: NonNullable<CacicObservabilityConfig['analytics']['replay']>,
    otherConsents: {
      isAnalyticsEnabled: boolean | (() => boolean);
      isDiagnosticsEnabled: boolean;
      isPerformanceEnabled: boolean;
    } = {
      isAnalyticsEnabled: true,
      isDiagnosticsEnabled: true,
      isPerformanceEnabled: true,
    },
  ): Promise<void> {
    const analytics: CacicObservabilityConfig['analytics'] = {
      websiteId: 'test-website',
      domains: ['non-matching.test'],
      isEnabled: () =>
        typeof otherConsents.isAnalyticsEnabled === 'function'
          ? otherConsents.isAnalyticsEnabled()
          : otherConsents.isAnalyticsEnabled,
      ...(replay ? { replay } : {}),
    };
    const config: CacicObservabilityConfig = {
      analytics,
      glitchtip: {
        dsn: '',
        isEnabled: () => otherConsents.isDiagnosticsEnabled,
        isPerformanceEnabled: () => otherConsents.isPerformanceEnabled,
        project: 'admin',
      },
    };

    application = await createApplication({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DOCUMENT, useValue: document },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: auth },
        { provide: CACIC_OBSERVABILITY_REPLAY_IS_DEVELOPMENT, useValue: false },
        CacicTrustedTypesService,
        provideCacicObservability(config),
      ],
    });
  }

  async function settleEffects(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
});
