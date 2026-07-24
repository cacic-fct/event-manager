import { firstValueFrom, NEVER, Subject, take } from 'rxjs';
import { InMemoryRedisClient } from '../redis/in-memory-redis-client';
import { SseReplayService } from './sse-replay.service';

describe('SseReplayService', () => {
  const originalCursorSecret = process.env.SSE_REPLAY_CURSOR_SECRET;

  beforeEach(() => {
    jest.useRealTimers();
    process.env.SSE_REPLAY_CURSOR_SECRET = 'test-cursor-secret';
  });

  afterEach(() => {
    process.env.SSE_REPLAY_CURSOR_SECRET = originalCursorSecret;
    jest.useRealTimers();
  });

  it('replays only events after the opaque cursor for the same scope', async () => {
    const service = createService();
    const scope = service.scope('event-form-results', 'form-1');
    const first = await service.record(scope, { data: { formId: 'form-1', revision: 1 } });
    const second = await service.record(scope, { data: { formId: 'form-1', revision: 2 } });

    await expect(firstValueFrom(service.replay(scope, first.id, NEVER).pipe(take(1)))).resolves.toEqual(second);
  });

  it('does not accept a cursor from a different scope', async () => {
    const service = createService();
    const firstScope = service.scope('event-form-results', 'form-1');
    const secondScope = service.scope('event-form-results', 'form-2');
    const otherCursor = await service.record(firstScope, { data: { formId: 'form-1' } });
    const latest = await service.record(secondScope, { data: { formId: 'form-2' } });

    await expect(firstValueFrom(service.replay(secondScope, otherCursor.id, NEVER).pipe(take(1)))).resolves.toEqual(latest);
  });

  it('uses an opaque scope tag and rolls the generation periodically', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
    const service = createService();
    const scope = service.scope('event-attendance-scanner-feed', 'event-1', 'user-1');
    const first = await service.record(scope, { data: { revision: 1 } });

    jest.setSystemTime(new Date('2026-07-01T06:00:00.000Z'));
    const second = await service.record(scope, { data: { revision: 2 } });

    expect(first.id).toMatch(/^sse1\.[A-Za-z0-9_-]{22}\.[0-9a-z]+\.[0-9a-z]+$/);
    expect(first.id).not.toContain('event-1');
    expect(first.id).not.toContain('user-1');
    expect(first.id.split('.')[2]).not.toBe(second.id.split('.')[2]);
  });

  it('does not append repeated snapshot payloads', async () => {
    const service = createService();
    const scope = service.scope('receipt-validation-queue', 'major-1', 'admin-1');
    const source = new Subject<{ data: object }>();
    const messages: string[] = [];
    const errors: unknown[] = [];
    const subscription = service.replay(scope, undefined, source).subscribe({
      next: (event) => messages.push(event.id ?? ''),
      error: (error: unknown) => errors.push(error),
    });

    await flushPromises();
    source.next({ data: { pendingCount: 1 } });
    await flushPromises();
    source.next({ data: { pendingCount: 1 } });
    await flushPromises();

    expect(errors).toEqual([]);
    expect(messages).toHaveLength(1);
    subscription.unsubscribe();
  });

  it('does not poll Redis after replaying the initial event set', async () => {
    jest.useFakeTimers();
    const service = createService();
    const scope = service.scope('event-form-results', 'form-1');
    const source = new Subject<{ data: object }>();
    const subscription = service.replay(scope, undefined, source).subscribe();

    await flushPromises();
    jest.advanceTimersByTime(60_000);

    expect(jest.getTimerCount()).toBe(0);
    subscription.unsubscribe();
  });

  it('delivers a live event when replay persistence is unavailable', async () => {
    const redis = new InMemoryRedisClient();
    const lrange = jest.spyOn(redis, 'lrange');
    const service = new SseReplayService(redis as never);
    const scope = service.scope('event-form-results', 'form-1');
    const source = new Subject<{ data: object }>();
    const messages: unknown[] = [];
    const errors: unknown[] = [];
    const subscription = service.replay(scope, undefined, source).subscribe({
      next: (event) => messages.push(event),
      error: (error: unknown) => errors.push(error),
    });

    await flushPromises();
    lrange.mockRejectedValueOnce(new Error('Redis unavailable'));
    source.next({ data: { revision: 1 } });
    await flushPromises();

    expect(messages).toEqual([{ data: { revision: 1 } }]);
    expect(errors).toEqual([]);
    subscription.unsubscribe();
  });

  it('does not persist heartbeat events', async () => {
    const redis = new InMemoryRedisClient();
    const lpush = jest.spyOn(redis, 'lpush');
    const service = new SseReplayService(redis as never);
    const scope = service.scope('current-user-events-realtime', 'session-1');
    const source = new Subject<{ data: { type: string } }>();
    const messages: unknown[] = [];
    const subscription = service.replay(scope, undefined, source).subscribe((event) => messages.push(event));

    await flushPromises();
    source.next({ data: { type: 'heartbeat' } });
    await flushPromises();

    expect(messages).toEqual([{ data: { type: 'heartbeat' } }]);
    expect(lpush).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('matches Redis list behavior for missing lists and negative underflow', async () => {
    const redis = new InMemoryRedisClient();

    await expect(redis.lrange('missing', 0, -2)).resolves.toEqual([]);
    await expect(redis.ltrim('missing', 0, -1)).resolves.toBe('OK');
    await expect(redis.exists('missing')).resolves.toBe(0);

    await redis.lpush('list', 'three', 'two', 'one');
    await expect(redis.lrange('list', 0, -5)).resolves.toEqual([]);
    await redis.ltrim('list', 0, -5);
    await expect(redis.exists('list')).resolves.toBe(0);
  });
});

function createService(): SseReplayService {
  return new SseReplayService(new InMemoryRedisClient() as never);
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}
