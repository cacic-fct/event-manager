import {
  ForbiddenException,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom, NEVER, Observable, take, toArray } from 'rxjs';
import { AdminTicketRealtimeController, CurrentUserTicketRealtimeController } from './tickets.controller';

describe('ticket realtime controllers', () => {
  it('emits fresh user baselines for tickets, transfers, and purchases on every stream', async () => {
    const source = { scope: jest.fn(() => 'user-scope'), watch: jest.fn(() => NEVER) };
    const replay = {
      replay: jest.fn((_scope: string, _cursor: string | undefined, events: Observable<MessageEvent>) => events),
    };
    const auth = { authenticateAccessToken: jest.fn().mockResolvedValue({ sub: 'user-1' }) };
    const controller = new CurrentUserTicketRealtimeController(source as never, replay as never, auth as never);
    const request = { headers: { authorization: 'Bearer token' } } as never;

    const events = await firstValueFrom(controller.stream(request, 'stale-cursor').pipe(take(3), toArray()));

    expect(events.map(({ data }) => (data as { type: string }).type)).toEqual([
      'TICKETS_CHANGED',
      'TRANSFERS_CHANGED',
      'PURCHASES_CHANGED',
    ]);
    expect(source.scope).toHaveBeenCalledWith('user-1');
    expect(replay.replay).toHaveBeenCalledWith('user-scope', 'stale-cursor', expect.anything());
  });

  it.each([
    { denial: 'a missing grant', error: new ForbiddenException() },
    { denial: 'an out-of-audience resource', error: new NotFoundException() },
  ])('accepts either event-scoped admin read grant after $denial and emits an event baseline', async ({ error }) => {
    const source = { adminEventScope: jest.fn(() => 'admin-event-scope'), watchAdminEvent: jest.fn(() => NEVER) };
    const replay = {
      replay: jest.fn((_scope: string, _cursor: string | undefined, events: Observable<MessageEvent>) => events),
    };
    const auth = { authenticateAccessToken: jest.fn().mockResolvedValue({ sub: 'manager-1' }) };
    const authorization = {
      assertPermissions: jest.fn(async (_user, permissions: string[]) => {
        if (permissions[0] === Permission.Ticket.Read) throw error;
      }),
    };
    const controller = new AdminTicketRealtimeController(source as never, replay as never, auth as never, authorization as never);
    const request = { headers: { authorization: 'Bearer token' } } as never;

    const event = await firstValueFrom(controller.stream('event-1', request, undefined).pipe(take(1)));

    expect(authorization.assertPermissions).toHaveBeenNthCalledWith(
      1,
      { sub: 'manager-1' },
      [Permission.Ticket.Read],
      { eventId: 'event-1' },
    );
    expect(authorization.assertPermissions).toHaveBeenNthCalledWith(
      2,
      { sub: 'manager-1' },
      [Permission.TicketConfig.Read],
      { eventId: 'event-1' },
    );
    expect(event.data).toEqual(expect.objectContaining({ type: 'TICKETS_CHANGED', eventId: 'event-1' }));
    expect(source.adminEventScope).toHaveBeenCalledWith('event-1');
  });

  it('propagates unexpected permission failures without trying another read grant', async () => {
    const source = { adminEventScope: jest.fn(() => 'admin-event-scope'), watchAdminEvent: jest.fn(() => NEVER) };
    const replay = {
      replay: jest.fn((_scope: string, _cursor: string | undefined, events: Observable<MessageEvent>) => events),
    };
    const auth = { authenticateAccessToken: jest.fn().mockResolvedValue({ sub: 'manager-1' }) };
    const failure = new Error('Permission store unavailable.');
    const authorization = { assertPermissions: jest.fn().mockRejectedValue(failure) };
    const controller = new AdminTicketRealtimeController(source as never, replay as never, auth as never, authorization as never);
    const request = { headers: { authorization: 'Bearer token' } } as never;

    await expect(firstValueFrom(controller.stream('event-1', request, undefined).pipe(take(1)))).rejects.toBe(failure);
    expect(authorization.assertPermissions).toHaveBeenCalledTimes(1);
    expect(source.adminEventScope).not.toHaveBeenCalled();
  });
});
