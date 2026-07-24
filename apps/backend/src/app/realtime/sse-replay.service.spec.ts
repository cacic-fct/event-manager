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
});

function createService(): SseReplayService {
  return new SseReplayService(new InMemoryRedisClient() as never);
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}
