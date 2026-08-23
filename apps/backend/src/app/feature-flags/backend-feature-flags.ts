import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type BackendUnleashClient = {
  getAllToggles(): { name: string; enabled: boolean }[];
  on(event: 'error', listener: (error: unknown) => void): void;
  start(): Promise<void>;
  stop(): void;
};

export const BACKEND_FEATURE_FLAGS = {
  onlineAttendanceNotificationsEnabled: 'events-online-attendance-notifications-enabled',
  requiredSubscriptionFormNotificationsEnabled: 'events-required-subscription-form-notifications-enabled',
} as const;

export type BackendFeatureFlagKey = keyof typeof BACKEND_FEATURE_FLAGS;

const BACKEND_FEATURE_FLAG_DEFAULTS: Record<BackendFeatureFlagKey, boolean> = {
  onlineAttendanceNotificationsEnabled: false,
  requiredSubscriptionFormNotificationsEnabled: false,
};

@Injectable()
export class BackendFeatureFlagService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackendFeatureFlagService.name);
  private client: BackendUnleashClient | null = null;
  private initialized = false;
  private destroyed = false;
  private startPromise: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const clientKey = this.config.get<string>('UNLEASH_BACKEND_CLIENT_KEY')?.trim();
    if (!clientKey) {
      this.initialized = true;
      return;
    }

    this.startPromise = this.startClient(clientKey);
    await this.startPromise;
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.client?.stop();
    void this.startPromise?.catch(() => undefined);
  }

  isEnabled(key: BackendFeatureFlagKey): boolean {
    if (!this.initialized) {
      return BACKEND_FEATURE_FLAG_DEFAULTS[key];
    }
    const toggle = this.client?.getAllToggles().find((item) => item.name === BACKEND_FEATURE_FLAGS[key]);
    return toggle?.enabled ?? BACKEND_FEATURE_FLAG_DEFAULTS[key];
  }

  private async startClient(clientKey: string): Promise<void> {
    let client: BackendUnleashClient | null = null;
    try {
      const { InMemoryStorageProvider, UnleashClient } = await import('unleash-proxy-client');
      client = new UnleashClient({
        url: this.config.get<string>('UNLEASH_BACKEND_API_URL', 'https://unleash.cacic.com.br/api/frontend'),
        clientKey,
        appName: this.config.get<string>('UNLEASH_BACKEND_APP_NAME', 'events-backend'),
        environment: process.env.NODE_ENV ?? 'development',
        refreshInterval: 60,
        disableMetrics: true,
        storageProvider: new InMemoryStorageProvider(),
      });
      client.on('error', (error: unknown) => {
        this.logger.warn(`Unleash feature flag refresh failed: ${describeError(error)}`);
      });
      if (this.destroyed) {
        client.stop();
        return;
      }
      await this.withTimeout(client.start(), 5_000, 'Unleash feature flag initialization timed out.');
      if (this.destroyed) {
        client.stop();
        return;
      }
      this.client = client;
      this.initialized = true;
    } catch (error) {
      try {
        client?.stop();
      } catch {
        // Keep the original initialization error as the diagnostic signal.
      }
      this.logger.warn(`Unleash feature flag initialization failed: ${describeError(error)}`);
      this.initialized = true;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
