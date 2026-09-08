import { ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, SSE_METADATA } from '@nestjs/common/constants';
import { firstValueFrom, take } from 'rxjs';
import { AUTH_SESSION_COOKIE_NAME } from '../../auth/auth.constants';
import { CurrentUserAttendanceCollectionController } from './attendance-collection.controller';

describe('CurrentUserAttendanceCollectionController streamFeed', () => {
  let currentUserContext: { requireCurrentPerson: jest.Mock };
  let authorizationPolicy: { assertAttendanceCollectorForEvent: jest.Mock };
  let replay: { scope: jest.Mock; replay: jest.Mock };
  let keycloakAuthService: { authenticateAccessToken: jest.Mock; authenticateSession: jest.Mock };
  let controller: CurrentUserAttendanceCollectionController;

  beforeEach(() => {
    currentUserContext = {
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'collector-person' }),
    };
    authorizationPolicy = {
      assertAttendanceCollectorForEvent: jest.fn().mockResolvedValue(undefined),
    };
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
    controller = new CurrentUserAttendanceCollectionController(
      {} as never,
      {} as never,
      currentUserContext as never,
      authorizationPolicy as never,
      replay as never,
      keycloakAuthService as never,
    );
  });

  it('declares an authenticated SSE route with the event-scoped path', () => {
    const handler = CurrentUserAttendanceCollectionController.prototype.streamFeed;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('events/:eventId/feed/events');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(SSE_METADATA, handler)).toBe(true);
  });

  it('checks collector identity and collection-window permission before emitting scanner snapshots', async () => {
    const feed = [{ personId: 'person-1', eventId: 'event-1', fullName: 'Participant' }];
    const getScannerFeed = jest.fn().mockResolvedValue(feed);
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;
    const request = {
      user: { sub: 'collector-user' },
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
    };

    const message = await firstValueFrom(controller.streamFeed('event-1', 'cursor-1', request as never).pipe(take(1)));

    expect(currentUserContext.requireCurrentPerson).toHaveBeenCalledWith({ req: request });
    expect(authorizationPolicy.assertAttendanceCollectorForEvent).toHaveBeenCalledWith('event-1', 'collector-person', {
      enforceCollectionWindow: true,
      user: request.user,
    });
    expect(keycloakAuthService.authenticateSession).toHaveBeenCalledWith('session-cookie');
    expect(getScannerFeed).toHaveBeenCalledWith('event-1');
    expect(replay.scope).toHaveBeenCalledWith('current-user-attendance-collection-feed', 'event-1', 'collector-user');
    expect(replay.replay).toHaveBeenCalledWith(
      'current-user-attendance-collection-feed:event-1:collector-user',
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

  it('uses the session cookie as a replay-scope fallback without inventing a subject', () => {
    controller.streamFeed('event-1', undefined, {
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
    } as never);

    expect(replay.scope).toHaveBeenCalledWith('current-user-attendance-collection-feed', 'event-1', 'session-cookie');
  });

  it('does not disclose scanner feed data when collector identity resolution fails', async () => {
    const failure = new ForbiddenException('Current person unavailable.');
    currentUserContext.requireCurrentPerson.mockRejectedValue(failure);
    const getScannerFeed = jest.fn();
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;

    await expect(
      firstValueFrom(
        controller
          .streamFeed('event-1', undefined, {
            user: { sub: 'collector-user' },
            headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
          } as never)
          .pipe(take(1)),
      ),
    ).rejects.toBe(failure);

    expect(authorizationPolicy.assertAttendanceCollectorForEvent).not.toHaveBeenCalled();
    expect(getScannerFeed).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
  });

  it('propagates collection authorization failures before reading snapshots', async () => {
    const failure = new ForbiddenException('Collection is not allowed.');
    authorizationPolicy.assertAttendanceCollectorForEvent.mockRejectedValue(failure);
    const getScannerFeed = jest.fn();
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;

    await expect(
      firstValueFrom(
        controller
          .streamFeed('event-1', undefined, {
            user: { sub: 'collector-user' },
            headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
          } as never)
          .pipe(take(1)),
      ),
    ).rejects.toBe(failure);

    expect(getScannerFeed).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
  });

  it('terminates the current-user stream when its collector grant is revoked', async () => {
    jest.useFakeTimers();
    const getScannerFeed = jest.fn().mockResolvedValue([{ personId: 'person-1', eventId: 'event-1' }]);
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;
    const failure = new ForbiddenException('Collection is not allowed.');
    authorizationPolicy.assertAttendanceCollectorForEvent
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure);
    const errors: unknown[] = [];
    const subscription = controller
      .streamFeed('event-1', undefined, {
        user: { sub: 'collector-user' },
        headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
      } as never)
      .subscribe({ error: (error) => errors.push(error) });

    await flushPromises();
    expect(getScannerFeed).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2_000);
    expect(getScannerFeed).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([failure]);
    expect(subscription.closed).toBe(true);
    jest.useRealTimers();
  });

  it('does not deliver current-user replay data after session reauthentication fails', async () => {
    const failure = new ForbiddenException('Session expired.');
    keycloakAuthService.authenticateSession.mockRejectedValueOnce(failure);
    const getScannerFeed = jest.fn();
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;

    await expect(
      firstValueFrom(
        controller
          .streamFeed('event-1', 'cursor-1', {
            user: { sub: 'collector-user' },
            headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-cookie` },
          } as never)
          .pipe(take(1)),
      ),
    ).rejects.toBe(failure);

    expect(replay.replay).not.toHaveBeenCalled();
    expect(getScannerFeed).not.toHaveBeenCalled();
  });

  it('stops current-user polling after the client disconnects', async () => {
    jest.useFakeTimers();
    const getScannerFeed = jest.fn().mockResolvedValue([]);
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = getScannerFeed;
    const subscription = controller
      .streamFeed('event-1', undefined, {
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
