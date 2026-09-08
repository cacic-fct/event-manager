import { ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, SSE_METADATA } from '@nestjs/common/constants';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom, take } from 'rxjs';
import { AUTH_SESSION_COOKIE_NAME, REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { EventAttendancesController } from './attendances.controller';

describe('EventAttendancesController streamScannerFeed', () => {
  let replay: { scope: jest.Mock; replay: jest.Mock };
  let keycloakAuthService: { authenticateAccessToken: jest.Mock; authenticateSession: jest.Mock };
  let authorizationPolicy: { assertPermissions: jest.Mock };
  let prisma: { event: { findUnique: jest.Mock } };
  let controller: EventAttendancesController;

  beforeEach(() => {
    replay = {
      scope: jest.fn(
        (channel: string, eventId: string, identity: string | undefined) => `${channel}:${eventId}:${identity ?? ''}`,
      ),
      replay: jest.fn((_scope: string, _lastEventId: string | undefined, source: unknown) => source),
    };
    keycloakAuthService = {
      authenticateAccessToken: jest.fn().mockResolvedValue({ sub: 'collector-user' }),
      authenticateSession: jest.fn().mockResolvedValue({ sub: 'collector-user' }),
    };
    authorizationPolicy = {
      assertPermissions: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({ id: 'event-1', deletedAt: null }),
      },
    };
    controller = new EventAttendancesController(
      prisma as never,
      {} as never,
      replay as never,
      keycloakAuthService as never,
      authorizationPolicy as never,
    );
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
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
    };

    const message = await firstValueFrom(
      controller.streamScannerFeed('event-1', 'cursor-1', request as never).pipe(take(1)),
    );

    expect(getScannerFeed).toHaveBeenCalledWith('event-1');
    expect(keycloakAuthService.authenticateSession).toHaveBeenCalledWith('session-cookie');
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'collector-user' }),
      [Permission.EventAttendance.Read],
      { eventId: 'event-1' },
    );
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
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
    } as never);

    expect(replay.scope).toHaveBeenCalledWith('event-attendance-scanner-feed', 'event-1', 'session-cookie');
  });

  it('propagates scanner-feed failures without replaying a private fallback', async () => {
    const failure = new ForbiddenException('Attendance feed unavailable.');
    const getScannerFeed = jest.fn().mockRejectedValue(failure);
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;

    await expect(
      firstValueFrom(
        controller
          .streamScannerFeed('event-1', undefined, {
            user: { sub: 'collector-user' },
            headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
          } as never)
          .pipe(take(1)),
      ),
    ).rejects.toBe(failure);
  });

  it('terminates the stream before a later snapshot after session or permission revocation', async () => {
    jest.useFakeTimers();
    const feed = [{ personId: 'person-1', eventId: 'event-1', fullName: 'Participant' }];
    const getScannerFeed = jest.fn().mockResolvedValue(feed);
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;
    const permissionFailure = new ForbiddenException('Permission revoked.');
    authorizationPolicy.assertPermissions
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(permissionFailure);
    const errors: unknown[] = [];
    const subscription = controller
      .streamScannerFeed('event-1', undefined, {
        user: { sub: 'collector-user' },
        headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
      } as never)
      .subscribe({ error: (error) => errors.push(error) });

    await flushPromises();
    expect(getScannerFeed).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2_000);
    expect(getScannerFeed).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([permissionFailure]);
    expect(subscription.closed).toBe(true);
    jest.useRealTimers();
  });

  it('does not deliver replay data when authorization fails immediately before the replay subscription', async () => {
    const failure = new ForbiddenException('Permission revoked.');
    authorizationPolicy.assertPermissions.mockRejectedValueOnce(failure);
    const getScannerFeed = jest.fn();
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;

    await expect(
      firstValueFrom(
        controller
          .streamScannerFeed('event-1', 'cursor-1', {
            user: { sub: 'collector-user' },
            headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
          } as never)
          .pipe(take(1)),
      ),
    ).rejects.toBe(failure);

    expect(replay.replay).not.toHaveBeenCalled();
    expect(getScannerFeed).not.toHaveBeenCalled();
  });

  it('terminates the stream when the canonical event is deleted', async () => {
    prisma.event.findUnique.mockResolvedValueOnce({ id: 'event-1', deletedAt: new Date() });
    const getScannerFeed = jest.fn();
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;

    await expect(
      firstValueFrom(
        controller
          .streamScannerFeed('event-1', undefined, {
            user: { sub: 'collector-user' },
            headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
          } as never)
          .pipe(take(1)),
      ),
    ).rejects.toThrow('Attendance feed is not available for this event.');

    expect(replay.replay).not.toHaveBeenCalled();
    expect(getScannerFeed).not.toHaveBeenCalled();
  });

  it('stops polling after an authenticated client disconnects', async () => {
    jest.useFakeTimers();
    const getScannerFeed = jest.fn().mockResolvedValue([]);
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;
    const subscription = controller
      .streamScannerFeed('event-1', undefined, {
        user: { sub: 'collector-user' },
        headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
      } as never)
      .subscribe();

    await flushPromises();
    expect(getScannerFeed).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();

    await jest.advanceTimersByTimeAsync(6_000);
    expect(getScannerFeed).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}
