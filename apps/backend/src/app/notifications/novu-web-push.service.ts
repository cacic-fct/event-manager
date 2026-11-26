import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { generateRequestDetails, type PushSubscription } from 'web-push';
import { webPushRecipientToken } from './novu-notification-transport';

const subscriptionLifetimeMs = 90 * 24 * 60 * 60 * 1000;
const maxSubscriptions = 20;
const pushHosts = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);

@Injectable()
export class NovuWebPushService {
  private readonly logger = new Logger(NovuWebPushService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: Redis,
  ) {}

  async saveSubscription(subscriberId: string, subscription: PushSubscription): Promise<void> {
    assertPushEndpoint(subscription.endpoint);
    const key = subscriptionKey(subscriberId);
    const now = Date.now();
    const result = await this.redis
      .multi()
      .zremrangebyscore(key, '-inf', now - subscriptionLifetimeMs)
      .zadd(key, now, JSON.stringify(subscription))
      .zremrangebyrank(key, 0, -maxSubscriptions - 1)
      .pexpire(key, subscriptionLifetimeMs)
      .exec();
    if (!result || result.some(([error]) => error)) {
      throw new ServiceUnavailableException('Web Push subscription storage is unavailable.');
    }
  }

  async deliver(rawBody: Buffer | undefined, signature: string | undefined, body: unknown): Promise<{ id: string }> {
    const secret = this.config.get<string>('NOVU_PUSH_WEBHOOK_SECRET');
    if (!secret || !rawBody || !signature || !/^[a-f0-9]{64}$/i.test(signature)) {
      throw new ForbiddenException('Invalid Novu webhook signature.');
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
      throw new ForbiddenException('Invalid Novu webhook signature.');
    }

    const message = readWebhook(body);
    const publicKey = this.config.get<string>('NOVU_VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('NOVU_VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('NOVU_VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) {
      throw new ServiceUnavailableException('Web Push delivery is unavailable.');
    }
    const { id, subscriberId, title, content, url } = message;
    const key = subscriptionKey(subscriberId);
    const subscriptions = await this.redis.zrangebyscore(key, Date.now() - subscriptionLifetimeMs, '+inf');
    const payload = JSON.stringify({
      subscriberId,
      title: title.slice(0, 160),
      body: content.slice(0, 450),
      redirectUrl: url.length <= 500 ? url : '/app/notifications',
    });
    const results = await Promise.allSettled(
      subscriptions.map(async (entry) => {
        const subscription = JSON.parse(entry) as PushSubscription;
        assertPushEndpoint(subscription.endpoint);
        const request = generateRequestDetails(subscription, payload, {
          vapidDetails: { publicKey, privateKey, subject },
          TTL: 300,
        });
        const response = await fetch(request.endpoint, {
          method: request.method,
          headers: request.headers,
          body: request.body ? new Uint8Array(request.body) : undefined,
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
        });
        await response.body?.cancel();
        if (response.status === 404 || response.status === 410) {
          await this.redis.zrem(key, entry);
        } else if (!response.ok) {
          throw new Error('Browser push service rejected the notification.');
        }
      }),
    );
    if (results.some((result) => result.status === 'rejected')) {
      this.logger.warn('Web Push delivery failed for one or more subscriptions.');
      if (results.every((result) => result.status === 'rejected')) {
        throw new ServiceUnavailableException('Web Push delivery failed.');
      }
    }
    return { id };
  }
}

export function assertPushEndpoint(endpoint: string): void {
  const url = URL.parse(endpoint);
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port || !pushHosts.has(url.hostname)) {
    throw new BadRequestException('Unsupported browser push endpoint.');
  }
}

function subscriptionKey(subscriberId: string): string {
  return `notifications:web-push:${webPushRecipientToken(subscriberId)}`;
}

function readWebhook(body: unknown) {
  const message = asRecord(body);
  const payload = asRecord(message['payload']);
  const subscriberId = asRecord(payload['subscriber'])['subscriberId'];
  const target = message['target'];
  const id = message['messageId'] ?? payload['__nvMessageId'];
  const title = message['title'] ?? payload['title'];
  const content = message['content'] ?? payload['body'];
  const redirectUrl = payload['redirectUrl'];
  if (
    typeof subscriberId !== 'string' ||
    !Array.isArray(target) ||
    !target.includes(webPushRecipientToken(subscriberId)) ||
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof content !== 'string'
  ) {
    throw new BadRequestException('Invalid Novu Web Push payload.');
  }
  const url = typeof redirectUrl === 'string' ? redirectUrl : '/app/notifications';
  return { id, subscriberId, title, content, url };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
