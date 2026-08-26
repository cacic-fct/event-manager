import { MessageEvent } from '@nestjs/common';
import { firstValueFrom, Observable, of, toArray } from 'rxjs';
import { PrizeDrawRealtimeController } from './prize-draw-realtime.controller';

describe('PrizeDrawRealtimeController', () => {
  it('emits identifier-free target invalidations after authorizing the stream', async () => {
    const draws = { listPublic: jest.fn().mockResolvedValue([{ id: 'allowed-draw' }]) };
    const realtime = {
      scope: jest.fn().mockReturnValue('scope-1'),
      watch: jest.fn().mockReturnValue(of({
        data: {
          type: 'SPIN_PRESENTED',
          drawId: 'another-draw',
          spinId: 'private-spin',
          revision: 2,
        },
      })),
    };
    const replay = {
      replay: jest.fn((_scope: string, _cursor: string | undefined, source: Observable<MessageEvent>) => source),
    };
    const controller = new PrizeDrawRealtimeController(draws as never, realtime as never, replay as never);

    const events = await firstValueFrom(
      controller.eventStream('event-1', { user: undefined } as never, undefined).pipe(toArray()),
    );

    expect(draws.listPublic).toHaveBeenCalledWith({ eventId: 'event-1' }, undefined);
    expect(events).toEqual([{ data: { type: 'PRIZE_DRAWS_UPDATED' } }]);
  });

  it.each([
    ['major event', 'major-event-1', 'major-event', 'majorEventStream', { majorEventId: 'major-event-1' }],
    ['event group', 'group-1', 'event-group', 'eventGroupStream', { eventGroupId: 'group-1' }],
  ] as const)('authorizes and scopes the %s stream while preserving heartbeat data', async (
    _label,
    id,
    scopeType,
    method,
    target,
  ) => {
    const user = { sub: 'user-1' };
    const draws = { listPublic: jest.fn().mockResolvedValue([{ id: 'draw-1' }]) };
    const heartbeat = { data: { type: 'heartbeat', timestamp: 123 } };
    const realtime = {
      scope: jest.fn().mockReturnValue('scope-1'),
      watch: jest.fn().mockReturnValue(of(heartbeat)),
    };
    const replay = {
      replay: jest.fn((_scope: string, _cursor: string | undefined, source: Observable<MessageEvent>) => source),
    };
    const controller = new PrizeDrawRealtimeController(draws as never, realtime as never, replay as never);

    const events = await firstValueFrom(
      controller[method](id, { user } as never, 'cursor-4').pipe(toArray()),
    );

    expect(draws.listPublic).toHaveBeenCalledWith(target, user);
    expect(realtime.scope).toHaveBeenCalledWith(scopeType, id);
    expect(replay.replay).toHaveBeenCalledWith('scope-1', 'cursor-4', expect.any(Observable));
    expect(events).toEqual([heartbeat]);
  });

  it('does not subscribe or replay when public audience authorization fails', async () => {
    const draws = { listPublic: jest.fn().mockRejectedValue(new Error('forbidden')) };
    const realtime = {
      scope: jest.fn().mockReturnValue('scope-1'),
      watch: jest.fn().mockReturnValue(of({ data: { type: 'DRAW_UPDATED' } })),
    };
    const replay = { replay: jest.fn() };
    const controller = new PrizeDrawRealtimeController(draws as never, realtime as never, replay as never);

    await expect(
      firstValueFrom(controller.eventStream('event-1', { user: undefined } as never, undefined)),
    ).rejects.toThrow('forbidden');
    expect(replay.replay).not.toHaveBeenCalled();
  });
});
