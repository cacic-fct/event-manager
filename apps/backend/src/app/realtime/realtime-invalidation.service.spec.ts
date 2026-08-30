import { MessageEvent } from '@nestjs/common';
import { clearInterval as nodeClearInterval, setInterval as nodeSetInterval } from 'node:timers';
import { firstValueFrom, NEVER, take } from 'rxjs';
import { InMemoryRedisClient } from '../redis/in-memory-redis-client';
import { SseReplayService } from './sse-replay.service';
import { RealtimeInvalidationService } from './realtime-invalidation.service';

const REALTIME_INVALIDATION_REDIS_CHANNEL = 'realtime:invalidation:v1';

describe('RealtimeInvalidationService', () => {
  beforeEach(() => {
    globalThis.setInterval = nodeSetInterval as typeof globalThis.setInterval;
    globalThis.clearInterval = nodeClearInterval as typeof globalThis.clearInterval;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('delegates scoped identifiers and records a replayable event before local fallback delivery', async () => {
    const redis = new InMemoryRedisClient();
    const replay = new SseReplayService(redis as never);
    const service = new RealtimeInvalidationService(redis as never, replay);
    const scope = service.scope('event', 'event-1', null, undefined);
    const received = firstValueFrom(service.watch(scope).pipe(take(1)));

    const published = await service.publish(scope, { type: 'EVENT_UPDATED', revision: 1 });

    await expect(received).resolves.toEqual(published);
    expect(published.id).toMatch(/^sse1\.[A-Za-z0-9_-]{22}\.[0-9a-z]+\.[0-9a-z]+$/);
    await expect(firstValueFrom(replay.replay(scope, undefined, NEVER).pipe(take(1)))).resolves.toEqual(published);
    await service.onModuleDestroy();
  });

  it('uses the shared scope builder with nullable parts', () => {
    const replay = {
      scope: jest.fn((channel: string, ...parts: readonly (string | null | undefined)[]) =>
        [channel, ...parts.map((part) => part ?? '')].join(':'),
      ),
      record: jest.fn(),
    };
    const service = new RealtimeInvalidationService({} as never, replay as never);

    expect(service.scope('event', 'event-1', null, undefined)).toBe('event:event-1::');
    expect(replay.scope).toHaveBeenCalledWith('event', 'event-1', null, undefined);
  });

  it('fans out valid Redis envelopes without adding a duplicate local delivery', async () => {
    let messageHandler: ((channel: string, payload: string) => void) | undefined;
    const subscriber = createSubscriber((event, handler) => {
      if (event === 'message') {
        messageHandler = handler as (channel: string, payload: string) => void;
      }
    });
    const redis = {
      duplicate: jest.fn(() => subscriber),
      publish: jest.fn().mockResolvedValue(1),
    };
    const stored: MessageEvent = {
      id: 'cursor-1',
      data: { type: 'EVENT_UPDATED', revision: 2 },
      retry: 3_000,
    };
    const replay = createReplayMock(stored);
    const service = new RealtimeInvalidationService(redis as never, replay as never);
    await service.onModuleInit();

    const received: MessageEvent[] = [];
    const subscription = service.watch('event:event-1').subscribe((event) => received.push(event));
    await expect(service.publish('event:event-1', { type: 'EVENT_UPDATED', revision: 2 })).resolves.toEqual(stored);

    expect(received).toEqual([]);
    expect(redis.publish).toHaveBeenCalledWith(
      REALTIME_INVALIDATION_REDIS_CHANNEL,
      JSON.stringify({ scope: 'event:event-1', event: stored }),
    );

    messageHandler?.('wrong-channel', JSON.stringify({ scope: 'event:event-1', event: stored }));
    expect(received).toEqual([]);
    messageHandler?.(REALTIME_INVALIDATION_REDIS_CHANNEL, JSON.stringify({ scope: 'event:event-1', event: stored }));
    expect(received).toEqual([stored]);

    subscription.unsubscribe();
    await service.onModuleDestroy();
  });

  it('reference-counts watchers, emits a heartbeat, and cleans up timers and channels', async () => {
    jest.useFakeTimers();
    const service = new RealtimeInvalidationService({} as never, createReplayMock() as never);
    const firstValues: MessageEvent[] = [];
    const secondValues: MessageEvent[] = [];
    const first = service.watch('event:event-1').subscribe((event) => firstValues.push(event));
    const second = service.watch('event:event-1').subscribe((event) => secondValues.push(event));

    expect(getChannels(service).get('event:event-1')).toEqual(expect.objectContaining({ subscribers: 2 }));
    jest.advanceTimersByTime(25_000);
    expect(firstValues).toEqual([{ data: { type: 'heartbeat', timestamp: expect.any(Number) } }]);
    expect(secondValues).toEqual([{ data: { type: 'heartbeat', timestamp: expect.any(Number) } }]);

    first.unsubscribe();
    expect(getChannels(service).get('event:event-1')).toEqual(expect.objectContaining({ subscribers: 1 }));
    second.unsubscribe();
    expect(getChannels(service).size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    await service.onModuleDestroy();
  });

  it('ignores malformed or incomplete Redis envelopes', async () => {
    let messageHandler: ((channel: string, payload: string) => void) | undefined;
    const subscriber = createSubscriber((event, handler) => {
      if (event === 'message') {
        messageHandler = handler as (channel: string, payload: string) => void;
      }
    });
    const stored: MessageEvent = { id: 'cursor-2', data: { type: 'EVENT_UPDATED' }, retry: 3_000 };
    const service = new RealtimeInvalidationService(
      { duplicate: jest.fn(() => subscriber) } as never,
      createReplayMock(stored) as never,
    );
    await service.onModuleInit();
    const values: MessageEvent[] = [];
    const subscription = service.watch('event:event-1').subscribe((event) => values.push(event));

    for (const payload of [
      'not-json',
      JSON.stringify({ scope: 123, event: stored }),
      JSON.stringify({ scope: 'event:event-1', event: {} }),
      JSON.stringify({ scope: 'event:event-1', event: { data: {}, retry: 'soon' } }),
      JSON.stringify({ scope: 'event:event-1', event: { data: {}, id: 42 }, extra: ['ignored'] }),
    ]) {
      messageHandler?.(REALTIME_INVALIDATION_REDIS_CHANNEL, payload);
    }

    expect(values).toEqual([]);
    subscription.unsubscribe();
    await service.onModuleDestroy();
  });

  it('falls back locally when Redis publication fails after replay recording', async () => {
    const subscriber = createSubscriber();
    const stored: MessageEvent = { id: 'cursor-3', data: { type: 'EVENT_UPDATED' }, retry: 3_000 };
    const redis = {
      duplicate: jest.fn(() => subscriber),
      publish: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    };
    const replay = createReplayMock(stored);
    const service = new RealtimeInvalidationService(redis as never, replay as never);
    await service.onModuleInit();
    const received = firstValueFrom(service.watch('event:event-1').pipe(take(1)));

    await expect(service.publish('event:event-1', { type: 'EVENT_UPDATED' })).resolves.toEqual(stored);
    await expect(received).resolves.toEqual(stored);
    expect(replay.record).toHaveBeenCalledWith('event:event-1', {
      data: { type: 'EVENT_UPDATED' },
      retry: 3_000,
    });
    await service.onModuleDestroy();
  });

  it('delivers locally when Redis reports zero subscribers', async () => {
    const subscriber = createSubscriber();
    const stored: MessageEvent = { id: 'cursor-zero', data: { type: 'EVENT_UPDATED' }, retry: 3_000 };
    const redis = {
      duplicate: jest.fn(() => subscriber),
      publish: jest.fn().mockResolvedValue(0),
    };
    const service = new RealtimeInvalidationService(redis as never, createReplayMock(stored) as never);
    await service.onModuleInit();
    const received = firstValueFrom(service.watch('event:event-1').pipe(take(1)));

    await expect(service.publish('event:event-1', stored.data as object)).resolves.toEqual(stored);
    await expect(received).resolves.toEqual(stored);
    expect(redis.publish).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('publishes remotely and falls back locally until Redis resubscription is confirmed', async () => {
    let errorHandler: ((error: Error) => void) | undefined;
    let readyHandler: (() => void) | undefined;
    let confirmResubscription!: (count: number) => void;
    const subscriber = createSubscriber((event, handler) => {
      if (event === 'error') errorHandler = handler as (error: Error) => void;
      if (event === 'ready') readyHandler = handler as () => void;
    });
    subscriber.subscribe
      .mockResolvedValueOnce(1)
      .mockImplementationOnce(() => new Promise<number>((resolve) => (confirmResubscription = resolve)));
    const stored: MessageEvent = { id: 'cursor-readiness', data: { type: 'EVENT_UPDATED' }, retry: 3_000 };
    const redis = {
      duplicate: jest.fn(() => subscriber),
      publish: jest.fn().mockResolvedValue(1),
    };
    const service = new RealtimeInvalidationService(redis as never, createReplayMock(stored) as never);
    await service.onModuleInit();
    const values: MessageEvent[] = [];
    const subscription = service.watch('event:event-1').subscribe((event) => values.push(event));

    errorHandler?.(new Error('Disconnected'));
    await service.publish('event:event-1', stored.data as object);
    expect(values).toEqual([stored]);
    expect(redis.publish).toHaveBeenCalledTimes(1);

    readyHandler?.();
    await Promise.resolve();
    await service.publish('event:event-1', stored.data as object);
    expect(values).toEqual([stored, stored]);
    expect(redis.publish).toHaveBeenCalledTimes(2);

    confirmResubscription(1);
    await Promise.resolve();
    await service.publish('event:event-1', stored.data as object);
    expect(values).toEqual([stored, stored]);
    expect(redis.publish).toHaveBeenCalledTimes(3);

    subscription.unsubscribe();
    await service.onModuleDestroy();
  });

  it('falls back locally when Redis has no subscriber path or replay recording fails', async () => {
    const replay = createReplayMock();
    replay.record.mockRejectedValueOnce(new Error('Replay unavailable'));
    const redis = { publish: jest.fn() };
    const service = new RealtimeInvalidationService(redis as never, replay as never);
    const first = firstValueFrom(service.watch('event:event-1').pipe(take(1)));

    await expect(service.publish('event:event-1', { type: 'EVENT_UPDATED' })).resolves.toEqual({
      data: { type: 'EVENT_UPDATED' },
      retry: 3_000,
    });
    await expect(first).resolves.toEqual({ data: { type: 'EVENT_UPDATED' }, retry: 3_000 });
    expect(redis.publish).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });

  it('recovers from subscription setup failure through local delivery', async () => {
    const subscriber = createSubscriber();
    subscriber.subscribe.mockRejectedValueOnce(new Error('Subscribe unavailable'));
    const redis = {
      duplicate: jest.fn(() => subscriber),
      publish: jest.fn(),
    };
    const stored: MessageEvent = { id: 'cursor-4', data: { type: 'EVENT_UPDATED' }, retry: 3_000 };
    const service = new RealtimeInvalidationService(redis as never, createReplayMock(stored) as never);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    const received = firstValueFrom(service.watch('event:event-1').pipe(take(1)));
    await expect(service.publish('event:event-1', { type: 'EVENT_UPDATED' })).resolves.toEqual(stored);
    await expect(received).resolves.toEqual(stored);
    expect(redis.publish).toHaveBeenCalledTimes(1);
    expect(subscriber.disconnect).toHaveBeenCalled();
  });

  it('does not create a second Redis subscriber when module initialization is repeated', async () => {
    const subscriber = createSubscriber();
    const redis = { duplicate: jest.fn(() => subscriber) };
    const service = new RealtimeInvalidationService(redis as never, createReplayMock() as never);

    await service.onModuleInit();
    await service.onModuleInit();

    expect(redis.duplicate).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('completes active watches and disconnects the duplicate on module destroy', async () => {
    jest.useFakeTimers();
    const subscriber = createSubscriber();
    const redis = { duplicate: jest.fn(() => subscriber) };
    const service = new RealtimeInvalidationService(redis as never, createReplayMock() as never);
    await service.onModuleInit();
    const complete = jest.fn();
    service.watch('event:event-1').subscribe({ complete });

    await service.onModuleDestroy();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(getChannels(service).size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    expect(subscriber.unsubscribe).toHaveBeenCalledWith(REALTIME_INVALIDATION_REDIS_CHANNEL);
    expect(subscriber.disconnect).toHaveBeenCalledTimes(1);
  });
});

function createReplayMock(stored?: MessageEvent) {
  return {
    scope: jest.fn((channel: string, ...parts: readonly (string | null | undefined)[]) =>
      [channel, ...parts.map((part) => part ?? '')].join(':'),
    ),
    record: jest.fn().mockResolvedValue(stored ?? { data: { type: 'EVENT_UPDATED' }, retry: 3_000 }),
  };
}

function createSubscriber(
  onImplementation: (event: string, handler: unknown) => void = () => undefined,
) {
  return {
    on: jest.fn(onImplementation),
    subscribe: jest.fn().mockResolvedValue(1),
    unsubscribe: jest.fn().mockResolvedValue(1),
    disconnect: jest.fn(),
  };
}

function getChannels(service: RealtimeInvalidationService): Map<string, unknown> {
  return (service as unknown as { channels: Map<string, unknown> }).channels;
}
