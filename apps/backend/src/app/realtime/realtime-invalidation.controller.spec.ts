import { ForbiddenException, MessageEvent } from '@nestjs/common';
import { Observable, firstValueFrom, of, take, toArray } from 'rxjs';
import { clearInterval as nodeClearInterval, setInterval as nodeSetInterval } from 'node:timers';
import { RealtimeInvalidationController } from './realtime-invalidation.controller';

describe('RealtimeInvalidationController', () => {
  beforeEach(() => {
    globalThis.setInterval = nodeSetInterval as typeof globalThis.setInterval;
    globalThis.clearInterval = nodeClearInterval as typeof globalThis.clearInterval;
  });

  afterEach(() => jest.useRealTimers());

  it('shares fingerprint polling for concurrent clients in the same scope', async () => {
    jest.useFakeTimers();
    const controller = createController();
    const load = jest.fn().mockResolvedValue({ type: 'CURRENT_USER_DATA_INVALIDATED', revision: 1 });
    const replayPolling = getReplayPolling(controller);
    const first = firstValueFrom(replayPolling('person:1', undefined, 5_000, load).pipe(take(1)));
    const second = firstValueFrom(replayPolling('person:1', undefined, 5_000, load).pipe(take(1)));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { data: { type: 'CURRENT_USER_DATA_INVALIDATED', revision: 1 } },
      { data: { type: 'CURRENT_USER_DATA_INVALIDATED', revision: 1 } },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps polling after a transient snapshot failure', async () => {
    jest.useFakeTimers();
    const controller = createController();
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValueOnce({ type: 'CURRENT_USER_DATA_INVALIDATED', revision: 2 });
    const valuesPromise = firstValueFrom(
      getReplayPolling(controller)('person:2', undefined, 5_000, load).pipe(take(1)),
    );

    await jest.advanceTimersByTimeAsync(5_000);

    await expect(valuesPromise).resolves.toEqual({
      data: { type: 'CURRENT_USER_DATA_INVALIDATED', revision: 2 },
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('propagates forbidden polling failures', async () => {
    const controller = createController();
    const events = getReplayPolling(controller)(
      'person:3',
      undefined,
      5_000,
      jest.fn().mockRejectedValue(new ForbiddenException('Revoked')),
    );

    const error = await firstValueFrom(events.pipe(toArray())).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenException);
  });

  it('sanitizes global workspace events so scoped identifiers are not exposed', async () => {
    const event: MessageEvent = {
      id: 'cursor-1',
      data: { type: 'PRIZE_DRAWS_INVALIDATED', drawId: 'private-draw' },
    };
    const controller = createController({ workspaceEvent: event, hasWorkspaceAccess: true });

    await expect(
      firstValueFrom(controller.streamAdminWorkspace({ user: {} } as never, undefined)),
    ).resolves.toEqual({
      id: 'cursor-1',
      data: { type: 'ADMIN_WORKSPACE_INVALIDATED', occurredAt: expect.any(String) },
    });
  });
});

function createController(options: { workspaceEvent?: MessageEvent; hasWorkspaceAccess?: boolean } = {}) {
  const invalidations = {
    scope: jest.fn((channel: string, ...parts: string[]) => [channel, ...parts].join(':')),
    watch: jest.fn(() => of(options.workspaceEvent ?? { data: { type: 'heartbeat', timestamp: 1 } })),
  };
  const replay = {
    replay: jest.fn((_scope: string, _lastEventId: string | undefined, source: unknown) => source),
  };
  return new RealtimeInvalidationController(
    invalidations as never,
    replay as never,
    {} as never,
    {} as never,
    {} as never,
    { hasEventManagerAccess: jest.fn(() => options.hasWorkspaceAccess ?? true) } as never,
  );
}

function getReplayPolling(controller: RealtimeInvalidationController) {
  return (
    controller as unknown as {
      replayPolling(
        scope: string,
        lastEventId: string | undefined,
        refreshIntervalMs: number,
        load: () => Promise<object>,
      ): Observable<MessageEvent>;
    }
  ).replayPolling.bind(controller);
}
