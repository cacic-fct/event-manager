import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { OfflineFeatureFlagCacheRecord, OfflinePublicDatabaseProvider } from '@cacic-fct/offline-public-data-access';
import { UnleashClient, type IToggle, type IVariant, type IStorageProvider } from 'unleash-proxy-client';
import { PUBLIC_FEATURE_FLAG_CONFIG } from './public-feature-flag.config';
import {
  PUBLIC_FEATURE_FLAG_BOOLEAN_KEYS,
  PUBLIC_FEATURE_FLAG_DEFAULTS,
  PUBLIC_FEATURE_FLAGS,
  type PublicFeatureFlagKey,
  type PublicFeatureFlagValues,
} from './public-feature-flags';

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 92;
const UNLEASH_REPOSITORY_KEY = 'repo';

@Injectable({ providedIn: 'root' })
export class PublicFeatureFlagService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly databaseProvider = inject(OfflinePublicDatabaseProvider);
  private readonly config = inject(PUBLIC_FEATURE_FLAG_CONFIG);

  private client: UnleashClient | null = null;
  private readonly valuesSignal = signal<PublicFeatureFlagValues>(PUBLIC_FEATURE_FLAG_DEFAULTS);

  readonly values = computed(() => this.valuesSignal());

  async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    await this.purgeExpiredCache();
    await this.loadCachedToggles();

    if (!this.config.clientKey) {
      return;
    }

    const client = new UnleashClient({
      url: this.config.url,
      clientKey: this.config.clientKey,
      appName: this.config.appName,
      environment: this.config.environment,
      refreshInterval: this.config.refreshIntervalSeconds,
      disableMetrics: this.config.disableMetrics,
      storageProvider: this.createStorageProvider(),
      bootstrap: this.createBootstrapToggles(this.valuesSignal()),
      bootstrapOverride: false,
      fetch: this.fetchWithoutConsoleNoise,
    });

    this.client = client;
    client.on('initialized', () => this.syncFromClient());
    client.on('ready', () => this.syncFromClient());
    client.on('update', () => this.syncFromClient());
    client.on('error', () => this.syncFromClient());

    try {
      await client.start();
    } catch {
      return;
    }

    this.syncFromClient();
  }

  booleanValue(key: PublicFeatureFlagKey): boolean {
    const value = this.valuesSignal()[key];
    return typeof value === 'boolean' ? value : Boolean(PUBLIC_FEATURE_FLAG_DEFAULTS[key]);
  }

  stringValue(key: PublicFeatureFlagKey): string {
    const value = this.valuesSignal()[key];
    const fallback = PUBLIC_FEATURE_FLAG_DEFAULTS[key];
    return typeof value === 'string' ? value : String(fallback);
  }

  private syncFromClient(): void {
    const client = this.client;
    if (!client) {
      return;
    }

    this.valuesSignal.set({
      calendarTabEnabled: client.isEnabled(PUBLIC_FEATURE_FLAGS.calendarTabEnabled),
      majorEventTabEnabled: client.isEnabled(PUBLIC_FEATURE_FLAGS.majorEventTabEnabled),
      notificationsTabEnabled: client.isEnabled(PUBLIC_FEATURE_FLAGS.notificationsTabEnabled),
      defaultLoginRedirectPath: this.stringVariantValue(client.getVariant(PUBLIC_FEATURE_FLAGS.defaultLoginRedirectPath)),
      onboardingEnforcementEnabled: client.isEnabled(PUBLIC_FEATURE_FLAGS.onboardingEnforcementEnabled),
      cookieBannerEnabled: client.isEnabled(PUBLIC_FEATURE_FLAGS.cookieBannerEnabled),
    });
  }

  private async loadCachedToggles(): Promise<void> {
    const toggles = await this.getCacheValue<IToggle[]>(UNLEASH_REPOSITORY_KEY);
    if (!Array.isArray(toggles)) {
      return;
    }

    this.valuesSignal.set(this.valuesFromToggles(toggles));
  }

  private valuesFromToggles(toggles: IToggle[]): PublicFeatureFlagValues {
    const enabled = (key: PublicFeatureFlagKey): boolean => {
      const fallback = PUBLIC_FEATURE_FLAG_DEFAULTS[key];
      return toggles.find((toggle) => toggle.name === PUBLIC_FEATURE_FLAGS[key])?.enabled ?? (fallback === true);
    };
    const defaultRedirect = toggles.find((toggle) => toggle.name === PUBLIC_FEATURE_FLAGS.defaultLoginRedirectPath);

    return {
      calendarTabEnabled: enabled('calendarTabEnabled'),
      majorEventTabEnabled: enabled('majorEventTabEnabled'),
      notificationsTabEnabled: enabled('notificationsTabEnabled'),
      defaultLoginRedirectPath: this.stringVariantValue(defaultRedirect?.variant),
      onboardingEnforcementEnabled: enabled('onboardingEnforcementEnabled'),
      cookieBannerEnabled: enabled('cookieBannerEnabled'),
    };
  }

  private stringVariantValue(variant: IVariant | undefined): string {
    if (variant?.enabled && variant.payload?.type === 'string' && variant.payload.value) {
      return variant.payload.value;
    }

    return PUBLIC_FEATURE_FLAG_DEFAULTS.defaultLoginRedirectPath;
  }

  private createBootstrapToggles(values: PublicFeatureFlagValues): IToggle[] {
    const booleanToggles = PUBLIC_FEATURE_FLAG_BOOLEAN_KEYS.map(
      (key): IToggle => ({
        name: PUBLIC_FEATURE_FLAGS[key],
        enabled: values[key] === true,
        impressionData: false,
        variant: {
          name: values[key] === true ? 'enabled' : 'disabled',
          enabled: values[key] === true,
          feature_enabled: values[key] === true,
        },
      }),
    );

    return [
      ...booleanToggles,
      {
        name: PUBLIC_FEATURE_FLAGS.defaultLoginRedirectPath,
        enabled: true,
        impressionData: false,
        variant: {
          name: 'path',
          enabled: true,
          feature_enabled: true,
          payload: {
            type: 'string',
            value: values.defaultLoginRedirectPath,
          },
        },
      },
    ];
  }

  private createStorageProvider(): IStorageProvider {
    return {
      get: (key) => this.getCacheValue(key),
      save: async (key, value) => {
        const database = this.databaseProvider.getDatabase();
        if (!database) {
          return;
        }

        await database.featureFlagCache.put({
          key,
          value,
          updatedAt: Date.now(),
        });
      },
    };
  }

  private async getCacheValue<T>(key: string): Promise<T | undefined> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return undefined;
    }

    const record = await database.featureFlagCache.get(key);
    if (!record || this.isExpired(record)) {
      return undefined;
    }

    return record.value as T;
  }

  private async purgeExpiredCache(): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.featureFlagCache.where('updatedAt').below(Date.now() - CACHE_TTL_MS).delete();
  }

  private isExpired(record: OfflineFeatureFlagCacheRecord): boolean {
    return record.key !== 'sessionId' && record.updatedAt < Date.now() - CACHE_TTL_MS;
  }

  private readonly fetchWithoutConsoleNoise: typeof fetch = async (input, init) => {
    try {
      const response = await fetch(input, init);

      if (response.status === 401 || response.status === 403) {
        return this.createNotModifiedResponse();
      }

      return response;
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
