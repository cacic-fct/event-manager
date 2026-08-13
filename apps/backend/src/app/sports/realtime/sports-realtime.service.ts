import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { SseReplayService } from '../../realtime/sse-replay.service';
import { mergeSportsStructuralInvalidations, SportsStructuralInvalidation } from './sports-structural-invalidation';

const SPORTS_REDIS_CHANNEL = 'sports:realtime:v1';
const INVALIDATE_PUBLIC_TOURNAMENT_CACHE_SCRIPT = `
local version = redis.call('INCR', KEYS[2])
redis.call('DEL', KEYS[1])
return version
`;

export const SPORTS_PUBLIC_TOURNAMENT_CACHE_TTL_SECONDS = 45;

export function sportsPublicTournamentCacheKey(tournamentId: string): string {
  return `sports:public-tournament:v2:${tournamentId}`;
}

export function sportsPublicTournamentCacheVersionKey(tournamentId: string): string {
  return `sports:public-tournament-version:v2:${tournamentId}`;
}

interface SportsRealtimeEnvelope {
  scope: string;
  event: MessageEvent;
}

interface SportsRealtimeChannel {
  subject: Subject<MessageEvent>;
  subscribers: number;
}

@Injectable()
export class SportsRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SportsRealtimeService.name);
  private readonly channels = new Map<string, SportsRealtimeChannel>();
  private subscriber?: Redis;

  constructor(
    private readonly redis: Redis,
    private readonly replay: SseReplayService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisWithDuplicate = this.redis as Redis & {
      duplicate?: () => Redis;
    };
    if (typeof redisWithDuplicate.duplicate !== 'function') {
      return;
    }

    const subscriber = redisWithDuplicate.duplicate();
    this.subscriber = subscriber;
    await subscriber.subscribe(SPORTS_REDIS_CHANNEL);
    subscriber.on('message', (_channel, payload) => {
      const envelope = this.parseEnvelope(payload);
      if (envelope) {
        this.channels.get(envelope.scope)?.subject.next(envelope.event);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const channel of this.channels.values()) {
      channel.subject.complete();
    }
    this.channels.clear();
    if (this.subscriber) {
      await this.subscriber.unsubscribe(SPORTS_REDIS_CHANNEL).catch(() => undefined);
      this.subscriber.disconnect();
    }
  }

  scope(channel: 'match' | 'tournament' | 'review' | 'admin-tournament' | 'autoroute', id: string): string {
    return this.replay.scope(`sports-${channel}`, id);
  }

  watch(scope: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const channel = this.acquireChannel(scope);
      const subscription = merge(
        channel.subject,
        interval(25_000).pipe(
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
    await this.invalidatePublicTournamentCacheForScope(scope, data);

    let event: MessageEvent;
    try {
      event = await this.replay.record(scope, {
        data,
        retry: 3_000,
      });
    } catch (error) {
      this.logger.warn(
        `Sports SSE replay recording failed for scope ${scope}; delivering locally without a replay cursor.`,
        error,
      );
      event = {
        data,
        retry: 3_000,
      };
      this.channels.get(scope)?.subject.next(event);
      return event;
    }
    const envelope: SportsRealtimeEnvelope = { scope, event };

    const redisWithPublish = this.redis as Redis & {
      publish?: (channel: string, payload: string) => Promise<number>;
    };
    if (this.subscriber && typeof redisWithPublish.publish === 'function') {
      try {
        const subscriberCount = await redisWithPublish.publish(SPORTS_REDIS_CHANNEL, JSON.stringify(envelope));
        if (subscriberCount === 0) {
          this.channels.get(scope)?.subject.next(event);
        }
      } catch (error) {
        this.logger.warn(
          `Sports SSE pub/sub delivery failed for scope ${scope}; delivering the recorded event locally.`,
          error,
        );
        this.channels.get(scope)?.subject.next(event);
      }
    } else {
      this.channels.get(scope)?.subject.next(event);
    }
    return event;
  }

  async publishStructuralInvalidations(invalidations: readonly SportsStructuralInvalidation[]): Promise<void> {
    await Promise.all(
      mergeSportsStructuralInvalidations(invalidations).flatMap((invalidation) => {
        const payload = {
          type: 'SPORTS_STRUCTURE_INVALIDATED',
          kind: invalidation.kind,
          tournamentId: invalidation.tournamentId,
          categoryId: invalidation.categoryId,
          stageIds: invalidation.stageIds,
          matchIds: invalidation.matchIds,
        };
        return [
          this.publish(this.scope('admin-tournament', invalidation.tournamentId), payload),
          this.publish(this.scope('tournament', invalidation.tournamentId), payload),
          ...invalidation.publicMatchIds.map((matchId) => this.publish(this.scope('match', matchId), payload)),
        ];
      }),
    );
  }

  async publishAutorouteInvalidations(personIds: readonly string[]): Promise<void> {
    const revision = randomUUID();
    await Promise.all(
      [...new Set(personIds.filter(Boolean))].map((personId) =>
        this.publish(this.scope('autoroute', personId), {
          type: 'SPORTS_AUTOROUTE_INVALIDATED',
          revision,
        }),
      ),
    );
  }

  private acquireChannel(scope: string): SportsRealtimeChannel {
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

  private releaseChannel(scope: string, channel: SportsRealtimeChannel): void {
    channel.subscribers -= 1;
    if (channel.subscribers > 0 || this.channels.get(scope) !== channel) {
      return;
    }
    this.channels.delete(scope);
    channel.subject.complete();
  }

  private async invalidatePublicTournamentCacheForScope(scope: string, data: object): Promise<void> {
    const tournamentId =
      'tournamentId' in data && typeof data.tournamentId === 'string' ? data.tournamentId : undefined;
    if (!tournamentId || scope !== this.scope('tournament', tournamentId)) {
      return;
    }

    try {
      await this.redis.eval(
        INVALIDATE_PUBLIC_TOURNAMENT_CACHE_SCRIPT,
        2,
        sportsPublicTournamentCacheKey(tournamentId),
        sportsPublicTournamentCacheVersionKey(tournamentId),
      );
    } catch (error) {
      this.logger.warn(`Sports public tournament cache invalidation failed for tournament ${tournamentId}.`, error);
    }
  }

  private parseEnvelope(payload: string): SportsRealtimeEnvelope | null {
    try {
      const parsed = JSON.parse(payload) as Partial<SportsRealtimeEnvelope>;
      if (!parsed.scope || typeof parsed.scope !== 'string' || !parsed.event) {
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
