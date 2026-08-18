import { ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, SSE_METADATA } from '@nestjs/common/constants';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom, take } from 'rxjs';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { EventAttendancesController } from './attendances.controller';

describe('EventAttendancesController streamScannerFeed', () => {
  let replay: { scope: jest.Mock; replay: jest.Mock };
  let controller: EventAttendancesController;

  beforeEach(() => {
    replay = {
      scope: jest.fn((channel: string, eventId: string, identity: string | undefined) =>
        `${channel}:${eventId}:${identity ?? ''}`,
      ),
      replay: jest.fn((_scope: string, _lastEventId: string | undefined, source: unknown) => source),
    };
    controller = new EventAttendancesController({} as never, {} as never, replay as never);
  });

  it('declares the protected SSE path and event-attendance read permission', () => {
    const handler = EventAttendancesController.prototype.streamScannerFeed;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('events/:eventId/scanner-feed/events');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(SSE_METADATA, handler)).toBe(true);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([Permission.EventAttendance.Read]);
  });

  it('wraps scanner snapshots, preserves Last-Event-ID, and scopes replay by authenticated subject', async () => {
    const feed = [{ personId: 'person-1', eventId: 'event-1', fullName: 'Participant' }];
    const getScannerFeed = jest.fn().mockResolvedValue(feed);
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;
    const request = {
      user: { sub: 'collector-user' },
      headers: { cookie: 'session-cookie' },
    };

    const message = await firstValueFrom(
      controller.streamScannerFeed('event-1', 'cursor-1', request as never).pipe(take(1)),
    );

    expect(getScannerFeed).toHaveBeenCalledWith('event-1');
    expect(replay.scope).toHaveBeenCalledWith('event-attendance-scanner-feed', 'event-1', 'collector-user');
    expect(replay.replay).toHaveBeenCalledWith(
      'event-attendance-scanner-feed:event-1:collector-user',
      'cursor-1',
      expect.anything(),
    );
    expect(message).toEqual({
      data: {
        type: 'event-attendance-scanner-feed',
        attendances: feed,
      },
    });
  });

  it('uses the cookie fallback for an anonymous transport identity without changing feed data', () => {
    controller.streamScannerFeed('event-1', undefined, {
      headers: { cookie: 'session-cookie' },
    } as never);

    expect(replay.scope).toHaveBeenCalledWith('event-attendance-scanner-feed', 'event-1', 'session-cookie');
  });

  it('propagates scanner-feed failures without replaying a private fallback', async () => {
    const failure = new ForbiddenException('Attendance feed unavailable.');
    const getScannerFeed = jest.fn().mockRejectedValue(failure);
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;

    await expect(
      firstValueFrom(
        controller.streamScannerFeed('event-1', undefined, {
          user: { sub: 'collector-user' },
          headers: { cookie: 'session-cookie' },
        } as never).pipe(take(1)),
      ),
    ).rejects.toBe(failure);
  });
});
