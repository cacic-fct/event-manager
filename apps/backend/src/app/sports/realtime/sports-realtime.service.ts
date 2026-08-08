import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
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

@Injectable()
export class SportsRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SportsRealtimeService.name);
  private readonly subjects = new Map<string, Subject<MessageEvent>>();
  private readonly scopeTargets = new Map<
    string,
    {
      channel: 'match' | 'tournament' | 'review' | 'admin-tournament' | 'autoroute';
      id: string;
    }
  >();
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
        this.subject(envelope.scope).next(envelope.event);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const subject of this.subjects.values()) {
      subject.complete();
    }
    this.subjects.clear();
    if (this.subscriber) {
      await this.subscriber.unsubscribe(SPORTS_REDIS_CHANNEL).catch(() => undefined);
      this.subscriber.disconnect();
    }
  }

  scope(channel: 'match' | 'tournament' | 'review' | 'admin-tournament' | 'autoroute', id: string): string {
    const scope = this.replay.scope(`sports-${channel}`, id);
    this.scopeTargets.set(scope, { channel, id });
    return scope;
  }

  watch(scope: string): Observable<MessageEvent> {
    return this.subject(scope).asObservable();
  }

  async publish(scope: string, data: object): Promise<MessageEvent> {
    await this.invalidatePublicTournamentCacheForScope(scope);

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
      this.subject(scope).next(event);
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
          this.subject(scope).next(event);
        }
      } catch (error) {
        this.logger.warn(
          `Sports SSE pub/sub delivery failed for scope ${scope}; delivering the recorded event locally.`,
          error,
        );
        this.subject(scope).next(event);
      }
    } else {
      this.subject(scope).next(event);
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

  private subject(scope: string): Subject<MessageEvent> {
    const existing = this.subjects.get(scope);
    if (existing) {
      return existing;
    }
    const subject = new Subject<MessageEvent>();
    this.subjects.set(scope, subject);
    return subject;
  }

  private async invalidatePublicTournamentCacheForScope(scope: string): Promise<void> {
    const target = this.scopeTargets.get(scope);
    if (target?.channel !== 'tournament') {
      return;
    }

    try {
      await this.redis.eval(
        INVALIDATE_PUBLIC_TOURNAMENT_CACHE_SCRIPT,
        2,
        sportsPublicTournamentCacheKey(target.id),
        sportsPublicTournamentCacheVersionKey(target.id),
      );
    } catch (error) {
      this.logger.warn(`Sports public tournament cache invalidation failed for tournament ${target.id}.`, error);
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
