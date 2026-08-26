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
});
