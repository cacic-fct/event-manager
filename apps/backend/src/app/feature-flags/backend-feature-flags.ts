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
  onlineAttendanceNotificationsEnabled: true,
  requiredSubscriptionFormNotificationsEnabled: true,
};

@Injectable()
export class BackendFeatureFlagService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackendFeatureFlagService.name);
  private client: BackendUnleashClient | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const clientKey = this.config.get<string>('UNLEASH_BACKEND_CLIENT_KEY')?.trim();
    if (!clientKey) {
      return;
    }

    void this.startClient(clientKey);
  }

  onModuleDestroy(): void {
    this.client?.stop();
  }

  isEnabled(key: BackendFeatureFlagKey): boolean {
    const toggle = this.client?.getAllToggles().find((item) => item.name === BACKEND_FEATURE_FLAGS[key]);
    return toggle?.enabled ?? BACKEND_FEATURE_FLAG_DEFAULTS[key];
  }

  private async startClient(clientKey: string): Promise<void> {
    try {
      const { InMemoryStorageProvider, UnleashClient } = await import('unleash-proxy-client');
      const client = new UnleashClient({
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
      this.client = client;
      await client.start();
    } catch (error) {
      this.logger.warn(`Unleash feature flag initialization failed: ${describeError(error)}`);
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
