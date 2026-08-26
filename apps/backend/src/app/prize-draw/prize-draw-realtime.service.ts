import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { SseReplayService } from '../realtime/sse-replay.service';

const PRIZE_DRAW_REDIS_CHANNEL = 'prize-draw:realtime:v1';

type PrizeDrawRealtimeScope = 'draw' | 'event' | 'major-event' | 'event-group';
type RealtimeEnvelope = { scope: string; event: MessageEvent };
type RealtimeChannel = { subject: Subject<MessageEvent>; subscribers: number };

@Injectable()
export class PrizeDrawRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrizeDrawRealtimeService.name);
  private readonly channels = new Map<string, RealtimeChannel>();
  private subscriber?: Redis;

  constructor(
    private readonly redis: Redis,
    private readonly replay: SseReplayService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = this.redis as Redis & { duplicate?: () => Redis };
    if (typeof connection.duplicate !== 'function') return;
    this.subscriber = connection.duplicate();
    await this.subscriber.subscribe(PRIZE_DRAW_REDIS_CHANNEL);
    this.subscriber.on('message', (_channel, payload) => {
      const envelope = this.parseEnvelope(payload);
      if (envelope) this.channels.get(envelope.scope)?.subject.next(envelope.event);
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const channel of this.channels.values()) channel.subject.complete();
    this.channels.clear();
    if (this.subscriber) {
      await this.subscriber.unsubscribe(PRIZE_DRAW_REDIS_CHANNEL).catch(() => undefined);
      this.subscriber.disconnect();
    }
  }

  scope(type: PrizeDrawRealtimeScope, id: string): string {
    return this.replay.scope(`prize-draw-${type}`, id);
  }

  watch(scope: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const channel = this.acquire(scope);
      const subscription = merge(
        channel.subject,
        interval(25_000).pipe(map(() => ({ data: { type: 'heartbeat', timestamp: Date.now() } }))),
      ).subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        this.release(scope, channel);
      };
    });
  }

  async publishDraw(drawId: string, type: string, revision: number, spinId?: string): Promise<void> {
    const draw = await this.prisma.prizeDraw.findUnique({
      where: { id: drawId },
      select: {
        eventId: true,
        majorEventId: true,
        event: { select: { eventGroupId: true, majorEventId: true, eventGroup: { select: { majorEventId: true } } } },
      },
    });
    if (!draw) return;
    const payload = {
      type,
      drawId,
      spinId: spinId ?? null,
      revision,
      occurredAt: new Date().toISOString(),
    };
    const scopes = [this.scope('draw', drawId)];
    if (draw.eventId) scopes.push(this.scope('event', draw.eventId));
    if (draw.event?.eventGroupId) scopes.push(this.scope('event-group', draw.event.eventGroupId));
    const parentMajorEventId = draw.event?.majorEventId ?? draw.event?.eventGroup?.majorEventId;
    if (parentMajorEventId) scopes.push(this.scope('major-event', parentMajorEventId));
    if (draw.majorEventId) scopes.push(this.scope('major-event', draw.majorEventId));
    await Promise.all(scopes.map((scope) => this.publish(scope, payload)));
  }

  private async publish(scope: string, data: object): Promise<void> {
    let event: MessageEvent;
    try {
      event = await this.replay.record(scope, { data, retry: 3_000 });
    } catch (error) {
      this.logger.warn(`Prize draw SSE replay recording failed for ${scope}.`, error);
      event = { data, retry: 3_000 };
      this.channels.get(scope)?.subject.next(event);
      return;
    }
    const publisher = this.redis as Redis & { publish?: (channel: string, payload: string) => Promise<number> };
    const envelope: RealtimeEnvelope = { scope, event };
    if (!this.subscriber || typeof publisher.publish !== 'function') {
      this.channels.get(scope)?.subject.next(event);
      return;
    }
    try {
      const delivered = await publisher.publish(PRIZE_DRAW_REDIS_CHANNEL, JSON.stringify(envelope));
      if (delivered === 0) this.channels.get(scope)?.subject.next(event);
    } catch (error) {
      this.logger.warn(`Prize draw SSE pub/sub failed for ${scope}.`, error);
      this.channels.get(scope)?.subject.next(event);
    }
  }

  private acquire(scope: string): RealtimeChannel {
    const existing = this.channels.get(scope);
    if (existing) {
      existing.subscribers += 1;
      return existing;
    }
    const created = { subject: new Subject<MessageEvent>(), subscribers: 1 };
    this.channels.set(scope, created);
    return created;
  }

  private release(scope: string, channel: RealtimeChannel): void {
    channel.subscribers -= 1;
    if (channel.subscribers > 0 || this.channels.get(scope) !== channel) return;
    this.channels.delete(scope);
    channel.subject.complete();
  }

  private parseEnvelope(payload: string): RealtimeEnvelope | null {
    try {
      const parsed = JSON.parse(payload) as RealtimeEnvelope;
      return typeof parsed.scope === 'string' && parsed.event && typeof parsed.event === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}
