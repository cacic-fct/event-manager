import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, isDevMode, signal } from '@angular/core';
import { UnleashClient, type IToggle } from 'unleash-proxy-client';

const COOKIE_BANNER_FEATURE_FLAG = 'cookie-banner-enabled';
const DEVELOPMENT_STORAGE_KEY = 'cacic.cookieBanner.enabled';
const UNLEASH_URL = 'https://unleash.cacic.dev.br/api/frontend';
const PRODUCTION_CLIENT_KEY =
  'default:production.h8sn3hzUSF07msdHkuXubAVRxSgtAdGsBCXiXXhcs8I4boeXozEue0Tx0lwq';

@Injectable({ providedIn: 'root' })
export class CookieBannerFeatureFlagService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly enabledSignal = signal(true);
  private client: UnleashClient | null = null;

  readonly enabled = computed(() => this.enabledSignal());

  async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const developmentValue = this.readDevelopmentStorageValue();
    if (developmentValue !== null) {
      this.enabledSignal.set(developmentValue);
      return;
    }

    const client = new UnleashClient({
      url: UNLEASH_URL,
      clientKey: this.readRuntimeConfigValue('cacic-unleash-client-key') || PRODUCTION_CLIENT_KEY,
      appName: 'fct-app-admin',
      environment: this.readRuntimeConfigValue('cacic-unleash-environment') || 'production',
      refreshInterval: 60,
      disableMetrics: true,
      bootstrap: [this.createBootstrapToggle()],
      bootstrapOverride: false,
      fetch: this.fetchWithoutConsoleNoise,
    });

    this.client = client;
    client.on('initialized', () => this.syncFromClient());
    client.on('ready', () => this.syncFromClient());
    client.on('update', () => this.syncFromClient());
    client.on('error', () => this.syncFromClient());

    this.startClient(client);
  }

  private syncFromClient(): void {
    const client = this.client;
    if (!client) {
      return;
    }

    this.enabledSignal.set(client.isEnabled(COOKIE_BANNER_FEATURE_FLAG));
  }

  private startClient(client: UnleashClient): void {
    void client
      .start()
      .then(() => this.syncFromClient())
      .catch(() => undefined);
  }

  private readDevelopmentStorageValue(): boolean | null {
    if (!isDevMode()) {
      return null;
    }

    try {
      const value = globalThis.localStorage?.getItem(DEVELOPMENT_STORAGE_KEY) ?? null;
      if (value === null) {
        globalThis.localStorage?.setItem(DEVELOPMENT_STORAGE_KEY, 'true');
        return true;
      }

      return value !== 'false';
    } catch {
      return true;
    }
  }

  private readRuntimeConfigValue(metaName: string): string {
    return document.querySelector<HTMLMetaElement>(`meta[name="${metaName}"]`)?.content ?? '';
  }

  private createBootstrapToggle(): IToggle {
    return {
      name: COOKIE_BANNER_FEATURE_FLAG,
      enabled: true,
      impressionData: false,
      variant: {
        name: 'enabled',
        enabled: true,
        feature_enabled: true,
      },
    };
  }

  private readonly fetchWithoutConsoleNoise: typeof fetch = async (input, init) => {
    try {
      const response = await fetch(input, init);
      return response.status === 401 || response.status === 403 ? this.createNotModifiedResponse() : response;
    } catch {
      return this.createNotModifiedResponse();
    }
  };

  private createNotModifiedResponse(): Response {
    return new Response(null, {
      status: 304,
      statusText: 'Not Modified',
    });
  }
}
