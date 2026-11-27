import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import type {
  NotificationRecipient,
  NovuSubscriberSession,
  NovuTriggerRequest,
  NovuTriggerResponse,
} from './novu-notification.types';

type NotificationLogger = {
  warn(message: string): void;
};

export type NovuTriggerOutcome = 'acknowledged' | 'rejected' | 'unknown' | 'skipped';

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

  async trigger(secretKey: string, body: NovuTriggerRequest, idempotencyKey?: string): Promise<boolean> {
    return (await this.triggerWithOutcome(secretKey, body, idempotencyKey)) === 'acknowledged';
  }

  async registerWebPushRecipient(recipient: NotificationRecipient): Promise<boolean> {
    const secretKey = this.secretKey();
    const integrationIdentifier = this.optionalConfig('NOVU_PUSH_INTEGRATION_IDENTIFIER');
    if (!secretKey || !integrationIdentifier) return false;
    const signal = AbortSignal.timeout(this.triggerTimeoutMs());
    const headers = {
      Authorization: `ApiKey ${secretKey}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'identity',
    };
    try {
      // A person may enable push before receiving their first notification.
      const subscriber = await fetch(`${this.apiUrl()}/v1/subscribers`, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify(recipient),
      });
      if (!subscriber.ok) {
        this.logger.warn(`Novu subscriber registration failed with HTTP ${subscriber.status}.`);
        return false;
      }
      const response = await fetch(
        `${this.apiUrl()}/v1/subscribers/${encodeURIComponent(recipient.subscriberId)}/credentials`,
        {
          method: 'PATCH',
          headers,
          signal,
          body: JSON.stringify({
            providerId: 'push-webhook',
            integrationIdentifier,
            credentials: { deviceTokens: [webPushRecipientToken(recipient.subscriberId)] },
          }),
        },
      );
      if (!response.ok) this.logger.warn(`Novu push registration failed with HTTP ${response.status}.`);
      return response.ok;
    } catch {
      this.logger.warn('Novu push registration is temporarily unavailable.');
      return false;
    }
  }

  async triggerWithOutcome(
    secretKey: string,
    body: NovuTriggerRequest,
    idempotencyKey?: string,
  ): Promise<NovuTriggerOutcome> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.triggerTimeoutMs());

    try {
      const response = await fetch(`${this.apiUrl()}/v1/events/trigger`, {
        method: 'POST',
        headers: {
          Authorization: `ApiKey ${secretKey}`,
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Novu trigger failed with HTTP ${response.status}.`);
        // A 409 can mean that the original request is still being processed.
        return response.status === 409 ? 'unknown' : 'rejected';
      }

      const result = (await response.json()) as NovuTriggerResponse;
      if (result.acknowledged !== true) {
        this.logger.warn(`Novu trigger was not acknowledged: ${result.status} ${result.error?.join(', ') ?? ''}`);
        return result.acknowledged === false ? 'rejected' : 'unknown';
      }

      return 'acknowledged';
    } catch (error) {
      this.logger.warn(`Novu trigger failed: ${error instanceof Error ? error.message : String(error)}`);
      return 'unknown';
    } finally {
      clearTimeout(timeout);
    }
  }

  async cancelTriggeredEvent(secretKey: string, transactionId: string): Promise<boolean> {
    return this.deleteRequest(secretKey, `/v1/events/trigger/${encodeURIComponent(transactionId)}`);
  }

  async deleteMessagesByTransactionId(secretKey: string, transactionId: string): Promise<boolean> {
    return this.deleteRequest(secretKey, `/v1/messages/transaction/${encodeURIComponent(transactionId)}`);
  }

  private async deleteRequest(secretKey: string, path: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.triggerTimeoutMs());
    try {
      const response = await fetch(`${this.apiUrl()}${path}`, {
        method: 'DELETE',
        headers: { Authorization: `ApiKey ${secretKey}`, 'Accept-Encoding': 'identity' },
        signal: controller.signal,
      });
      if (response.ok || response.status === 404) {
        return true;
      }
      this.logger.warn(`Novu delete request failed with HTTP ${response.status}.`);
      return false;
    } catch (error) {
      this.logger.warn(`Novu delete request failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private assignOptionalSessionConfiguration(session: NovuSubscriberSession): void {
    const apiUrl = this.optionalConfig('NOVU_CLIENT_API_URL') ?? this.optionalConfig('NOVU_API_URL');
    if (apiUrl) {
      session.apiUrl = apiUrl.replace(/\/$/, '');
    }

    const socketUrl = this.optionalConfig('NOVU_CLIENT_SOCKET_URL');
    if (socketUrl) {
      session.socketUrl = socketUrl.replace(/\/$/, '');
    }

    const socketPath = this.optionalConfig('NOVU_CLIENT_SOCKET_PATH');
    if (socketPath) {
      session.socketPath = socketPath;
    }

    const pushIntegrationIdentifier = this.optionalConfig('NOVU_PUSH_INTEGRATION_IDENTIFIER');
    const vapidPublicKey = this.optionalConfig('NOVU_VAPID_PUBLIC_KEY');
    if (
      pushIntegrationIdentifier &&
      vapidPublicKey &&
      this.optionalConfig('NOVU_VAPID_PRIVATE_KEY') &&
      this.optionalConfig('NOVU_VAPID_SUBJECT') &&
      this.optionalConfig('NOVU_PUSH_WEBHOOK_SECRET')
    ) {
      session.pushIntegrationIdentifier = pushIntegrationIdentifier;
      session.vapidPublicKey = vapidPublicKey;
    }
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

export function webPushRecipientToken(subscriberId: string): string {
  return createHash('sha256').update(subscriberId).digest('hex');
}
