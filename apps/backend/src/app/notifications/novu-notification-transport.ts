import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { NotificationRecipient, NovuSubscriberSession, NovuTriggerRequest, NovuTriggerResponse } from './novu-notification.types';

type NotificationLogger = {
  warn(message: string): void;
};

export class NovuNotificationTransport {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: NotificationLogger,
  ) {}

  createSubscriberSession(recipient: NotificationRecipient): NovuSubscriberSession | null {
    const secretKey = this.secretKey();
    const applicationIdentifier = this.optionalConfig('NOVU_APPLICATION_IDENTIFIER');
    if (!secretKey || !applicationIdentifier) {
      return null;
    }

    const session: NovuSubscriberSession = {
      applicationIdentifier,
      subscriberId: recipient.subscriberId,
      subscriberHash: createHmac('sha256', secretKey).update(recipient.subscriberId).digest('hex'),
    };
    this.assignOptionalSessionConfiguration(session);
    return session;
  }

  secretKey(): string | null {
    if (!this.isEnabled()) {
      return null;
    }

    return this.config.get<string>('NOVU_SECRET_KEY') ?? null;
  }

  async trigger(secretKey: string, body: NovuTriggerRequest): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.triggerTimeoutMs());

    try {
      const response = await fetch(`${this.apiUrl()}/v1/events/trigger`, {
        method: 'POST',
        headers: {
          Authorization: `ApiKey ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Novu trigger failed with HTTP ${response.status}.`);
        return false;
      }

      const result = (await response.json()) as NovuTriggerResponse;
      if (!result.acknowledged) {
        this.logger.warn(`Novu trigger was not acknowledged: ${result.status} ${result.error?.join(', ') ?? ''}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(`Novu trigger failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private assignOptionalSessionConfiguration(session: NovuSubscriberSession): void {
    const apiUrl = this.optionalConfig('NOVU_CLIENT_API_URL') ?? this.optionalConfig('NOVU_API_URL');
    if (apiUrl) session.apiUrl = apiUrl.replace(/\/$/, '');

    const socketUrl = this.optionalConfig('NOVU_CLIENT_SOCKET_URL');
    if (socketUrl) session.socketUrl = socketUrl.replace(/\/$/, '');

    const socketPath = this.optionalConfig('NOVU_CLIENT_SOCKET_PATH');
    if (socketPath) session.socketPath = socketPath;

    const pushIntegrationIdentifier = this.optionalConfig('NOVU_PUSH_INTEGRATION_IDENTIFIER');
    if (pushIntegrationIdentifier) session.pushIntegrationIdentifier = pushIntegrationIdentifier;

    const vapidPublicKey = this.optionalConfig('NOVU_VAPID_PUBLIC_KEY');
    if (vapidPublicKey) session.vapidPublicKey = vapidPublicKey;
  }

  private apiUrl(): string {
    return this.config.get<string>('NOVU_API_URL', 'https://api.novu.co').replace(/\/$/, '');
  }

  private triggerTimeoutMs(): number {
    const configuredValue = Number(this.config.get<string>('NOVU_TRIGGER_TIMEOUT_MS', '10000'));
    return Number.isFinite(configuredValue) && configuredValue > 0 ? configuredValue : 10_000;
  }

  private isEnabled(): boolean {
    return this.config.get<string>('NOVU_SECURE_MODE_ENABLED')?.trim().toLowerCase() === 'true';
  }

  private optionalConfig(key: string): string | undefined {
    const value = this.config.get<string>(key)?.trim();
    return value || undefined;
  }
}
