import { MessageEvent } from '@nestjs/common';
import { clearInterval as nodeClearInterval, setInterval as nodeSetInterval } from 'node:timers';
import { firstValueFrom, take } from 'rxjs';
import { SportsRealtimeService } from './sports-realtime.service';

describe('SportsRealtimeService', () => {
  beforeEach(() => {
    globalThis.setInterval = nodeSetInterval as typeof globalThis.setInterval;
    globalThis.clearInterval = nodeClearInterval as typeof globalThis.clearInterval;
  });

  it('records before delivering local mutation-driven events', async () => {
    const stored: MessageEvent = {
      id: 'opaque-cursor-1',
      data: { matchId: 'match-1', revision: 2 },
      retry: 3_000,
    };
    const replay = {
      scope: jest.fn((channel: string, id: string) => `opaque:${channel}:${id}`),
      record: jest.fn().mockResolvedValue(stored),
    };
    const service = new SportsRealtimeService({} as never, replay as never);
    const scope = service.scope('match', 'match-1');
    const received = firstValueFrom(service.watch(scope).pipe(take(1)));

    await expect(service.publish(scope, { matchId: 'match-1', revision: 2 })).resolves.toEqual(stored);
    await expect(received).resolves.toEqual(stored);
    expect(replay.record).toHaveBeenCalledWith(scope, {
      data: { matchId: 'match-1', revision: 2 },
      retry: 3_000,
    });
  });

  it('uses the shared replay scope builder for match, tournament, and review isolation', () => {
    const replay = {
      scope: jest.fn((channel: string) => `${channel}:opaque`),
    };
    const service = new SportsRealtimeService({} as never, replay as never);

    expect(service.scope('match', 'match-secret')).toBe('sports-match:opaque');
    expect(service.scope('tournament', 'tournament-secret')).toBe('sports-tournament:opaque');
    expect(service.scope('review', 'match-secret')).toBe('sports-review:opaque');
    expect(replay.scope).toHaveBeenNthCalledWith(1, 'sports-match', 'match-secret');
  });

  it('fans out Redis pub/sub envelopes across instances and ignores malformed messages', async () => {
    let messageHandler: ((channel: string, payload: string) => void) | undefined;
    const subscriber = {
      subscribe: jest.fn().mockResolvedValue(1),
      on: jest.fn((event: string, handler: (channel: string, payload: string) => void) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      }),
      unsubscribe: jest.fn().mockResolvedValue(1),
      disconnect: jest.fn(),
    };
    const redis = {
      duplicate: jest.fn(() => subscriber),
      publish: jest.fn().mockResolvedValue(1),
    };
    const stored: MessageEvent = {
      id: 'cursor-2',
      data: { state: 'LIVE' },
      retry: 3_000,
    };
    const replay = {
      scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
      record: jest.fn().mockResolvedValue(stored),
    };
    const service = new SportsRealtimeService(redis as never, replay as never);
    await service.onModuleInit();
    const received: MessageEvent[] = [];
    const subscription = service.watch('sports-match:match-1').subscribe((event) => received.push(event));

    await service.publish('sports-match:match-1', { state: 'LIVE' });
    expect(received).toEqual([]);
    expect(redis.publish).toHaveBeenCalledWith(
      'sports:realtime:v1',
      JSON.stringify({
        scope: 'sports-match:match-1',
        event: stored,
      }),
    );

    messageHandler?.('sports:realtime:v1', 'not-json');
    messageHandler?.(
      'sports:realtime:v1',
      JSON.stringify({
        scope: 'sports-match:without-local-watchers',
        event: stored,
      }),
    );
    messageHandler?.(
      'sports:realtime:v1',
      JSON.stringify({
        scope: 'sports-match:match-1',
        event: stored,
      }),
    );
    expect(received).toEqual([stored]);

    subscription.unsubscribe();
    expect((service as unknown as { channels: Map<string, unknown> }).channels.size).toBe(0);
    await service.onModuleDestroy();
    expect(subscriber.unsubscribe).toHaveBeenCalledWith('sports:realtime:v1');
    expect(subscriber.disconnect).toHaveBeenCalled();
  });

  it('keeps connections alive without polling and releases the channel after unsubscribe', async () => {
    jest.useFakeTimers();
    const replay = {
      scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
    };
    const service = new SportsRealtimeService({} as never, replay as never);
    const received: MessageEvent[] = [];
    const subscription = service.watch('sports-match:match-1').subscribe((event) => received.push(event));

    jest.advanceTimersByTime(25_000);

    expect(received).toEqual([
      {
        data: {
          type: 'heartbeat',
          timestamp: expect.any(Number),
        },
      },
    ]);
    expect((service as unknown as { channels: Map<string, unknown> }).channels.size).toBe(1);

    subscription.unsubscribe();
    expect((service as unknown as { channels: Map<string, unknown> }).channels.size).toBe(0);
    jest.useRealTimers();
  });

  it('publishes deduplicated structural invalidations to tournament and public match scopes', async () => {
    const replay = {
      scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
      record: jest
        .fn()
        .mockImplementation((scope: string, event: MessageEvent) => Promise.resolve({ id: scope, ...event })),
    };
    const redis = {
      eval: jest.fn().mockResolvedValue(1),
    };
    const service = new SportsRealtimeService(redis as never, replay as never);

    await service.publishStructuralInvalidations([
      {
        kind: 'BRACKET_ADVANCEMENT',
        tournamentId: 'tournament-1',
        categoryId: 'category-1',
        stageIds: ['stage-2'],
        matchIds: ['match-2'],
        publicMatchIds: ['match-2'],
      },
      {
        kind: 'BRACKET_ADVANCEMENT',
        tournamentId: 'tournament-1',
        categoryId: 'category-1',
        stageIds: ['stage-2'],
        matchIds: ['match-2'],
        publicMatchIds: ['match-2'],
      },
    ]);

    expect(replay.record).toHaveBeenCalledTimes(3);
    expect(replay.record).toHaveBeenCalledWith(
      'sports-admin-tournament:tournament-1',
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'SPORTS_STRUCTURE_INVALIDATED',
          kind: 'BRACKET_ADVANCEMENT',
          stageIds: ['stage-2'],
          matchIds: ['match-2'],
        }),
      }),
    );
    expect(replay.record).toHaveBeenCalledWith(
      'sports-tournament:tournament-1',
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'SPORTS_STRUCTURE_INVALIDATED',
          kind: 'BRACKET_ADVANCEMENT',
          stageIds: ['stage-2'],
          matchIds: ['match-2'],
        }),
      }),
    );
    expect(replay.record).toHaveBeenCalledWith('sports-match:match-2', expect.any(Object));
    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      2,
      'sports:public-tournament:v2:tournament-1',
      'sports:public-tournament-version:v2:tournament-1',
    );
  });

  it('delivers locally and resolves when replay recording fails after a mutation commit', async () => {
    const replay = {
      scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
      record: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    };
    const service = new SportsRealtimeService({} as never, replay as never);
    const scope = service.scope('match', 'match-1');
    const received = firstValueFrom(service.watch(scope).pipe(take(1)));

    await expect(service.publish(scope, { type: 'MATCH_UPDATED' })).resolves.toEqual({
      data: { type: 'MATCH_UPDATED' },
      retry: 3_000,
    });
    await expect(received).resolves.toEqual({
      data: { type: 'MATCH_UPDATED' },
      retry: 3_000,
    });
  });

  it('keeps the replay cursor and falls back to local delivery when pub/sub fails', async () => {
    const subscriber = {
      subscribe: jest.fn().mockResolvedValue(1),
      on: jest.fn(),
      unsubscribe: jest.fn().mockResolvedValue(1),
      disconnect: jest.fn(),
    };
    const redis = {
      duplicate: jest.fn(() => subscriber),
      publish: jest.fn().mockRejectedValue(new Error('Redis publish unavailable')),
    };
    const stored: MessageEvent = {
      id: 'cursor-3',
      data: { type: 'MATCH_UPDATED' },
      retry: 3_000,
    };
    const replay = {
      scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
      record: jest.fn().mockResolvedValue(stored),
    };
    const service = new SportsRealtimeService(redis as never, replay as never);
    await service.onModuleInit();
    const scope = service.scope('match', 'match-1');
    const received = firstValueFrom(service.watch(scope).pipe(take(1)));

    await expect(service.publish(scope, { type: 'MATCH_UPDATED' })).resolves.toEqual(stored);
    await expect(received).resolves.toEqual(stored);

    await service.onModuleDestroy();
  });
});
