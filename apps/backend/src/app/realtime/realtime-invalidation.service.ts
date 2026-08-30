import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { EMPTY, interval, map, merge, Observable, Subject, takeUntil } from 'rxjs';
import { SseReplayService } from './sse-replay.service';

const REALTIME_INVALIDATION_REDIS_CHANNEL = 'realtime:invalidation:v1';
const HEARTBEAT_INTERVAL_MS = 25_000;
const DEFAULT_RETRY_MS = 3_000;

interface RealtimeInvalidationEnvelope {
  scope: string;
  event: MessageEvent;
}

interface RealtimeInvalidationChannel {
  subject: Subject<MessageEvent>;
  subscribers: number;
}

type RedisWithRealtimeSupport = Redis & {
  duplicate?: () => Redis;
  publish?: (channel: string, payload: string) => Promise<number>;
};

@Injectable()
export class RealtimeInvalidationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeInvalidationService.name);
  private readonly channels = new Map<string, RealtimeInvalidationChannel>();
  private readonly destroy$ = new Subject<void>();
  private subscriber?: Redis;
  private subscriberReady = false;
  private destroyed = false;

  constructor(
    private readonly redis: Redis,
    private readonly replay: SseReplayService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.destroyed || this.subscriber) {
      return;
    }

    const connection = this.redis as RedisWithRealtimeSupport;
    if (typeof connection.duplicate !== 'function') {
      return;
    }

    let subscriber: Redis | undefined;
    try {
      subscriber = connection.duplicate();
      if (
        !subscriber ||
        typeof subscriber.on !== 'function' ||
        typeof subscriber.subscribe !== 'function'
      ) {
        this.logger.warn('Realtime invalidation Redis subscriber is unavailable; local delivery will be used.');
        if (subscriber) {
          await this.disconnectSubscriber(subscriber, false);
        }
        return;
      }

      subscriber.on('message', (channel, payload) => {
        if (channel !== REALTIME_INVALIDATION_REDIS_CHANNEL) {
          return;
        }

        const envelope = this.parseEnvelope(payload);
        if (envelope) {
          this.channels.get(envelope.scope)?.subject.next(envelope.event);
        }
      });
      subscriber.on('error', (error: Error) => {
        this.subscriberReady = false;
        this.logger.warn(
          `Realtime invalidation Redis subscriber error; delivery will recover through Redis or local fallback.`,
          error instanceof Error ? error.stack : String(error),
        );
      });
      subscriber.on('ready', () => {
        this.subscriberReady = true;
      });

      await subscriber.subscribe(REALTIME_INVALIDATION_REDIS_CHANNEL);
      if (this.destroyed) {
        await this.disconnectSubscriber(subscriber, true);
        return;
      }
      this.subscriber = subscriber;
      this.subscriberReady = true;
    } catch (error: unknown) {
      this.logger.warn(
        'Realtime invalidation Redis subscription failed; local delivery will be used.',
        error instanceof Error ? error.stack : String(error),
      );
      if (subscriber) {
        await this.disconnectSubscriber(subscriber, true);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();

    const channels = [...this.channels.values()];
    this.channels.clear();
    for (const channel of channels) {
      channel.subject.complete();
    }

    const subscriber = this.subscriber;
    this.subscriber = undefined;
    this.subscriberReady = false;
    if (subscriber) {
      await this.disconnectSubscriber(subscriber, true);
    }
  }

  scope(channel: string, ...parts: readonly (string | null | undefined)[]): string {
    return this.replay.scope(channel, ...parts);
  }

  watch(scope: string): Observable<MessageEvent> {
    if (this.destroyed) {
      return EMPTY;
    }

    return new Observable<MessageEvent>((subscriber) => {
      const channel = this.acquireChannel(scope);
      const subscription = merge(
        channel.subject,
        interval(HEARTBEAT_INTERVAL_MS).pipe(
          takeUntil(this.destroy$),
          map(() => ({
            data: {
              type: 'heartbeat',
              timestamp: Date.now(),
            },
          })),
        ),
      ).subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        this.releaseChannel(scope, channel);
      };
    });
  }

  async publish(scope: string, data: object): Promise<MessageEvent> {
    let event: MessageEvent;
    try {
      event = await this.replay.record(scope, {
        data,
        retry: DEFAULT_RETRY_MS,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Realtime invalidation replay recording failed for scope ${scope}; delivering locally without a replay cursor.`,
        error instanceof Error ? error.stack : String(error),
      );
      event = { data, retry: DEFAULT_RETRY_MS };
      this.deliverLocally(scope, event);
      return event;
    }

    const publisher = this.redis as RedisWithRealtimeSupport;
    if (!this.subscriber || !this.subscriberReady || typeof publisher.publish !== 'function') {
      this.deliverLocally(scope, event);
      return event;
    }

    try {
      const payload = JSON.stringify({ scope, event } satisfies RealtimeInvalidationEnvelope);
      const subscriberCount = await publisher.publish(REALTIME_INVALIDATION_REDIS_CHANNEL, payload);
      if (typeof subscriberCount !== 'number' || !Number.isFinite(subscriberCount) || subscriberCount <= 0) {
        this.deliverLocally(scope, event);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Realtime invalidation Redis publication failed for scope ${scope}; delivering the recorded event locally.`,
        error instanceof Error ? error.stack : String(error),
      );
      this.deliverLocally(scope, event);
    }

    return event;
  }

  private acquireChannel(scope: string): RealtimeInvalidationChannel {
    const existing = this.channels.get(scope);
    if (existing) {
      existing.subscribers += 1;
      return existing;
    }

    const channel = {
      subject: new Subject<MessageEvent>(),
      subscribers: 1,
    };
    this.channels.set(scope, channel);
    return channel;
  }

  private releaseChannel(scope: string, channel: RealtimeInvalidationChannel): void {
    if (channel.subscribers > 0) {
      channel.subscribers -= 1;
    }
    if (channel.subscribers > 0 || this.channels.get(scope) !== channel) {
      return;
    }

    this.channels.delete(scope);
    channel.subject.complete();
  }

  private deliverLocally(scope: string, event: MessageEvent): void {
    this.channels.get(scope)?.subject.next(event);
  }

  private async disconnectSubscriber(subscriber: Redis, unsubscribe: boolean): Promise<void> {
    if (unsubscribe && typeof subscriber.unsubscribe === 'function') {
      try {
        await subscriber.unsubscribe(REALTIME_INVALIDATION_REDIS_CHANNEL);
      } catch (error: unknown) {
        this.logger.warn(
          'Realtime invalidation Redis subscriber unsubscribe failed; continuing shutdown.',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    try {
      subscriber.disconnect();
    } catch (error: unknown) {
      this.logger.warn(
        'Realtime invalidation Redis subscriber disconnect failed; continuing shutdown.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private parseEnvelope(payload: unknown): RealtimeInvalidationEnvelope | null {
    if (typeof payload !== 'string') {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(payload);
      if (!isRecord(parsed) || typeof parsed.scope !== 'string' || parsed.scope.length === 0) {
        return null;
      }
      if (!isMessageEvent(parsed.event)) {
        return null;
      }

      return {
        scope: parsed.scope,
        event: parsed.event,
      };
    } catch {
      return null;
    }
  }
}

function isMessageEvent(value: unknown): value is MessageEvent {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, 'data')) {
    return false;
  }

  return (
    isOptionalString(value.id) &&
    isOptionalString(value.type) &&
    (value.retry === undefined || (typeof value.retry === 'number' && Number.isFinite(value.retry)))
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
