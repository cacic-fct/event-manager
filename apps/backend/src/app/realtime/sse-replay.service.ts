import { Injectable, MessageEvent } from '@nestjs/common';
import { createHmac, createHash } from 'node:crypto';
import Redis from 'ioredis';
import { Observable } from 'rxjs';

const REPLAY_TTL_SECONDS = 15 * 60;
const MAX_REPLAY_EVENTS = 512;
const GENERATION_DURATION_MS = 6 * 60 * 60 * 1000;

interface StoredSseEvent {
  id: string;
  type?: string;
  retry?: number;
  data: string | object;
  fingerprint: string;
}

@Injectable()
export class SseReplayService {
  private readonly cursorSecret = this.readCursorSecret();

  constructor(private readonly redis: Redis) {}

  scope(channel: string, ...parts: readonly (string | undefined | null)[]): string {
    const material = JSON.stringify([channel, ...parts.map((part) => part ?? '')]);
    const digest = createHmac('sha256', this.cursorSecret).update(material).digest('base64url').slice(0, 22);

    return `${channel}:${digest}`;
  }

  replay(scope: string, lastEventId: string | undefined, source: Observable<MessageEvent>): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let lastDeliveredId = lastEventId;
      let replayFinished = false;
      const buffered: StoredSseEvent[] = [];

      const deliver = (event: StoredSseEvent) => {
        if (event.id === lastDeliveredId) {
          return;
        }

        lastDeliveredId = event.id;
        subscriber.next(this.toMessageEvent(event));
      };

      const sourceSubscription = source.subscribe({
        next: (event) => {
          if (this.isHeartbeat(event)) {
            subscriber.next(event);
            return;
          }

          void this.publish(scope, event)
            .then((stored) => {
              if (replayFinished) {
                deliver(stored);
              } else {
                buffered.push(stored);
              }
            })
            .catch(() => subscriber.next(event));
        },
        error: (error: unknown) => subscriber.error(error),
        complete: () => subscriber.complete(),
      });

      void this.readReplay(scope, lastEventId)
        .then((events) => {
          for (const event of events) {
            deliver(event);
          }
          replayFinished = true;

          for (const event of buffered) {
            deliver(event);
          }
        })
        .catch((error: unknown) => subscriber.error(error));

      return () => {
        sourceSubscription.unsubscribe();
      };
    });
  }

  async record(scope: string, event: MessageEvent): Promise<MessageEvent> {
    return this.toMessageEvent(await this.publish(scope, event));
  }

  private async publish(scope: string, event: MessageEvent): Promise<StoredSseEvent> {
    const fingerprint = this.fingerprint(event);
    const key = this.eventsKey(scope);
    const [latest] = await this.redis.lrange(key, 0, 0);

    if (latest) {
      const previous = this.parseStoredEvent(latest);
      if (previous?.fingerprint === fingerprint) {
        return previous;
      }
    }

    const generation = Math.floor(Date.now() / GENERATION_DURATION_MS).toString(36);
    const sequence = await this.redis.incr(this.sequenceKey(scope, generation));
    const stored: StoredSseEvent = {
      id: `sse1.${this.scopeTag(scope)}.${generation}.${sequence.toString(36)}`,
      data: event.data,
      type: event.type,
      retry: event.retry ?? 3_000,
      fingerprint,
    };

    await this.redis.lpush(key, JSON.stringify(stored));
    await this.redis.ltrim(key, 0, MAX_REPLAY_EVENTS - 1);
    await this.redis.expire(key, REPLAY_TTL_SECONDS);
    await this.redis.expire(this.sequenceKey(scope, generation), REPLAY_TTL_SECONDS);

    return stored;
  }

  private async readReplay(scope: string, lastEventId: string | undefined): Promise<StoredSseEvent[]> {
    const rawEvents = await this.redis.lrange(this.eventsKey(scope), 0, -1);
    const events = rawEvents
      .map((event) => this.parseStoredEvent(event))
      .filter((event): event is StoredSseEvent => event !== null)
      .reverse();

    if (events.length === 0) {
      return [];
    }

    const latest = events.at(-1);
    if (!latest) {
      return [];
    }

    if (!lastEventId) {
      return [latest];
    }

    if (!this.isCursorForScope(lastEventId, scope)) {
      return [latest];
    }

    const cursorIndex = events.findIndex((event) => event.id === lastEventId);
    return cursorIndex === -1 ? [latest] : events.slice(cursorIndex + 1);
  }

  private toMessageEvent(event: StoredSseEvent): MessageEvent {
    return {
      id: event.id,
      data: event.data,
      type: event.type,
      retry: event.retry,
    };
  }

  private fingerprint(event: MessageEvent): string {
    return createHash('sha256')
      .update(JSON.stringify({ data: event.data, type: event.type, retry: event.retry ?? 3_000 }))
      .digest('base64url');
  }

  private isHeartbeat(event: MessageEvent): boolean {
    return typeof event.data === 'object' && event.data !== null && 'type' in event.data && event.data.type === 'heartbeat';
  }

  private readCursorSecret(): string {
    const configuredSecret = process.env.SSE_REPLAY_CURSOR_SECRET?.trim();
    if (configuredSecret) {
      return configuredSecret;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('SSE_REPLAY_CURSOR_SECRET is required in production.');
    }

    return 'local-development-sse-replay-secret';
  }

  private parseStoredEvent(value: string): StoredSseEvent | null {
    try {
      const event = JSON.parse(value) as StoredSseEvent;
      return typeof event.id === 'string' && typeof event.fingerprint === 'string' ? event : null;
    } catch {
      return null;
    }
  }

  private isCursorForScope(cursor: string, scope: string): boolean {
    return new RegExp(`^sse1\\.${this.scopeTag(scope)}\\.[0-9a-z]+\\.[0-9a-z]+$`).test(cursor);
  }

  private eventsKey(scope: string): string {
    return `sse-replay:v1:${scope}:events`;
  }

  private sequenceKey(scope: string, generation: string): string {
    return `sse-replay:v1:${scope}:sequence:${generation}`;
  }

  private scopeTag(scope: string): string {
    return scope.slice(scope.lastIndexOf(':') + 1);
  }
}
