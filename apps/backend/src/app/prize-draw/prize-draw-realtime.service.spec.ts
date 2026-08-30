import { firstValueFrom } from 'rxjs';
import { PrizeDrawRealtimeService } from './prize-draw-realtime.service';

describe('PrizeDrawRealtimeService', () => {
  it('publishes one replayed event to every linked scope through Redis', async () => {
    const context = createContext();
    await context.service.onModuleInit();
    context.prisma.prizeDraw.findUnique.mockResolvedValue({
      eventId: 'event-1',
      majorEventId: null,
      event: {
        eventGroupId: 'group-1',
        majorEventId: null,
        eventGroup: { majorEventId: 'major-1' },
      },
    });
    context.replay.record.mockImplementation(async (scope: string, event: object) => ({
      ...event,
      id: `id:${scope}`,
    }));

    await context.service.publishDraw('draw-1', 'SPIN_PRESENTED', 4, 'spin-1');

    expect(context.replay.record).toHaveBeenCalledTimes(4);
    expect(context.redis.publish).toHaveBeenCalledTimes(4);
    expect(context.redis.publish).toHaveBeenCalledWith(
      'prize-draw:realtime:v1',
      expect.stringContaining('"type":"SPIN_PRESENTED"'),
    );
    expect(context.invalidations.publish).toHaveBeenCalledTimes(2);
    expect(context.invalidations.publish).toHaveBeenCalledWith(
      'admin-workspace',
      expect.objectContaining({ type: 'PRIZE_DRAWS_INVALIDATED', drawId: 'draw-1' }),
    );
    expect(context.invalidations.publish).toHaveBeenCalledWith(
      'public-catalog-v2',
      expect.objectContaining({ type: 'PUBLIC_CATALOG_INVALIDATED', revision: expect.any(String) }),
    );
  });

  it('delivers locally when Redis pub/sub is unavailable and releases the channel after unsubscribe', async () => {
    const context = createContext({ duplicate: false });
    context.prisma.prizeDraw.findUnique.mockResolvedValue({
      eventId: 'event-1',
      majorEventId: null,
      event: { eventGroupId: null, majorEventId: null, eventGroup: null },
    });
    context.replay.record.mockImplementation(async (_scope: string, event: object) => event);
    const scope = context.service.scope('draw', 'draw-1');
    const eventPromise = firstValueFrom(context.service.watch(scope));

    await context.service.publishDraw('draw-1', 'DRAW_UPDATED', 2);

    await expect(eventPromise).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DRAW_UPDATED', drawId: 'draw-1', spinId: null, revision: 2 }),
        retry: 3000,
      }),
    );
    expect(context.redis.publish).not.toHaveBeenCalled();

    context.replay.record.mockRejectedValue(new Error('replay unavailable'));
    const fallbackPromise = firstValueFrom(context.service.watch(scope));
    await context.service.publishDraw('draw-1', 'ELIGIBILITY_FROZEN', 3);
    await expect(fallbackPromise).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ELIGIBILITY_FROZEN' }),
      }),
    );
  });

  it('accepts valid subscriber messages, ignores malformed payloads, and closes the duplicate on destroy', async () => {
    const context = createContext();
    await context.service.onModuleInit();
    const scope = context.service.scope('draw', 'draw-1');
    const values: unknown[] = [];
    const subscription = context.service.watch(scope).subscribe((value) => values.push(value));

    const message = context.subscriber.on.mock.calls.find(([event]) => event === 'message')?.[1];
    message('ignored', '{invalid');
    message('ignored', JSON.stringify({ scope: 123, event: {} }));
    message('ignored', JSON.stringify({ scope, event: { data: { type: 'DRAW_UPDATED' } } }));

    expect(values).toEqual([{ data: { type: 'DRAW_UPDATED' } }]);
    subscription.unsubscribe();
    await context.service.onModuleDestroy();
    expect(context.subscriber.unsubscribe).toHaveBeenCalledWith('prize-draw:realtime:v1');
    expect(context.subscriber.disconnect).toHaveBeenCalled();
  });

  it('does nothing when a draw was deleted before publication', async () => {
    const context = createContext();
    context.prisma.prizeDraw.findUnique.mockResolvedValue(null);
    await context.service.publishDraw('missing', 'DRAW_UPDATED', 1);
    expect(context.replay.record).not.toHaveBeenCalled();
  });

  it('keeps a committed draw update successful when an invalidation publisher fails', async () => {
    const context = createContext({ duplicate: false });
    context.prisma.prizeDraw.findUnique.mockResolvedValue({
      eventId: null,
      majorEventId: 'major-1',
      event: null,
    });
    context.replay.record.mockImplementation(async (_scope: string, event: object) => event);
    context.invalidations.publish.mockRejectedValue(new Error('Publisher unavailable'));

    await expect(context.service.publishDraw('draw-1', 'DRAW_UPDATED', 2)).resolves.toBeUndefined();
  });
});

function createContext(options: { duplicate?: boolean } = {}) {
  const subscriber = {
    on: jest.fn(),
    subscribe: jest.fn().mockResolvedValue(1),
    unsubscribe: jest.fn().mockResolvedValue(1),
    disconnect: jest.fn(),
  };
  const redis = {
    ...(options.duplicate === false ? {} : { duplicate: jest.fn(() => subscriber) }),
    publish: jest.fn().mockResolvedValue(1),
  };
  const replay = {
    scope: jest.fn((prefix: string, id: string) => `${prefix}:${id}`),
    record: jest.fn(),
  };
  const prisma = { prizeDraw: { findUnique: jest.fn() } };
  const invalidations = {
    scope: jest.fn((channel: string) => channel),
    publish: jest.fn().mockResolvedValue({}),
  };
  const service = new PrizeDrawRealtimeService(
    redis as never,
    replay as never,
    prisma as never,
    invalidations as never,
  );
  return { invalidations, prisma, redis, replay, service, subscriber };
}
