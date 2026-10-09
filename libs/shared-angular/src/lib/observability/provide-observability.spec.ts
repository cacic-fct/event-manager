import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { ApplicationRef, PLATFORM_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CacicTrustedTypesService } from '../security/trusted-types';
import {
  provideCacicObservability,
  type CacicObservabilityConfig,
} from './provide-observability';
import { CACIC_OBSERVABILITY_REPLAY_IS_DEVELOPMENT } from './replay-development-mode.token';

describe('provideCacicObservability replay script loader', () => {
  const replayScriptId = 'cacic-replay-script';
  let auth: Pick<AuthService, 'initialized' | 'user'>;
  let application: ApplicationRef | undefined;

  beforeEach(() => {
    document.getElementById(replayScriptId)?.remove();
    auth = {
      initialized: signal(false),
      user: signal<AuthenticatedUser | null>(null),
    };
  });

  afterEach(async () => {
    application?.destroy();
    application = undefined;
    document.getElementById(replayScriptId)?.remove();
  });

  it('keeps replay disabled when replay config is omitted even if analytics, diagnostics, and performance are enabled', async () => {
    await createLoader();
    auth.initialized.set(true);
    await settleEffects();

    expect(document.getElementById(replayScriptId)).toBeNull();
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

  it('loads replay only after auth initialization when its explicit gate is true, using strict default capture settings', async () => {
    await createLoader(
      { isEnabled: () => true },
      {
        isAnalyticsEnabled: false,
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
    expect(script?.dataset['sampleRate']).toBe('0.15');
    expect(script?.dataset['maskLevel']).toBe('strict');
    expect(script?.dataset['maxDuration']).toBe('300000');
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
      isAnalyticsEnabled: boolean;
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
      isEnabled: () => otherConsents.isAnalyticsEnabled,
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
