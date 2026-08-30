import { ForbiddenException, MessageEvent } from '@nestjs/common';
import { Observable, firstValueFrom, of, take, toArray } from 'rxjs';
import { clearInterval as nodeClearInterval, setInterval as nodeSetInterval } from 'node:timers';
import { PUBLIC_CATALOG_REALTIME_CHANNEL } from './public-catalog-invalidation';
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

  it('checks workspace access before opening the replay stream', async () => {
    const { controller, invalidations, replay, policy } = createControllerWithDependencies({
      hasWorkspaceAccess: false,
    });
    const request = { user: { sub: 'revoked-user' } };

    await expect(
      firstValueFrom(controller.streamAdminWorkspace(request as never, 'cursor-previous')),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(policy.hasEventManagerAccess).toHaveBeenCalledWith(request.user);
    expect(invalidations.watch).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
  });

  it('resolves the current person before polling its fingerprint and forwards Last-Event-ID', async () => {
    const { controller, currentUser, fingerprints, invalidations, replay } = createControllerWithDependencies();
    const request = { user: { sub: 'user-1' } };
    const fingerprint = { type: 'CURRENT_USER_DATA_INVALIDATED', minute: 12 };
    currentUser.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    fingerprints.currentUser.mockResolvedValue(fingerprint);

    await expect(
      firstValueFrom(controller.streamCurrentUserData(request as never, 'cursor-previous').pipe(take(1))),
    ).resolves.toEqual({ data: fingerprint });

    expect(currentUser.requireCurrentPerson).toHaveBeenCalledWith({ req: request });
    expect(invalidations.scope).toHaveBeenCalledWith('current-user-data', 'person-1');
    expect(fingerprints.currentUser).toHaveBeenCalledWith('person-1');
    expect(replay.replay).toHaveBeenCalledWith('current-user-data:person-1', 'cursor-previous', expect.any(Object));
  });

  it('hashes organizer snapshots after resolving the authorized target and never emits the raw details', async () => {
    const { controller, currentUser, organizerInfo, invalidations, replay } = createControllerWithDependencies();
    const request = { user: { sub: 'lecturer-1' } };
    const privateInfo = { attendanceCount: 7, participantEmails: ['private@example.com'] };
    currentUser.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    organizerInfo.currentUserOrganizerInfo.mockResolvedValue(privateInfo);

    const result = await firstValueFrom(
      controller.streamOrganizerInfo('EVENT', 'event-1', request as never, 'cursor-previous').pipe(take(1)),
    );

    expect(result.data).toEqual({ type: 'ORGANIZER_INFO_INVALIDATED', revision: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain('private@example.com');
    expect(currentUser.requireCurrentPerson).toHaveBeenCalledWith({ req: request });
    expect(organizerInfo.currentUserOrganizerInfo).toHaveBeenCalledWith('EVENT', 'event-1', { req: request });
    expect(invalidations.scope).toHaveBeenCalledWith('current-user-organizer', 'person-1', 'EVENT', 'event-1');
    expect(replay.replay).toHaveBeenCalledWith(
      'current-user-organizer:person-1:EVENT:event-1',
      'cursor-previous',
      expect.any(Object),
    );
  });

  it('terminates organizer polling when the target is no longer authorized', async () => {
    const { controller, currentUser, organizerInfo } = createControllerWithDependencies();
    currentUser.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    organizerInfo.currentUserOrganizerInfo.mockResolvedValue(null);

    await expect(
      firstValueFrom(
        controller.streamOrganizerInfo('EVENT', 'event-revoked', { user: { sub: 'user-1' } } as never, undefined),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('preserves public catalog payloads while forwarding the reconnect cursor', async () => {
    const { controller, invalidations, replay } = createControllerWithDependencies({
      workspaceEvent: { id: 'catalog-1', data: { type: 'PUBLIC_CATALOG_INVALIDATED', revision: 'revision-1' } },
    });

    await expect(firstValueFrom(controller.streamPublicCatalog('catalog-previous').pipe(take(1)))).resolves.toEqual({
      id: 'catalog-1',
      data: { type: 'PUBLIC_CATALOG_INVALIDATED', revision: 'revision-1' },
    });

    expect(invalidations.scope).toHaveBeenCalledWith(PUBLIC_CATALOG_REALTIME_CHANNEL);
    expect(replay.replay).toHaveBeenCalledWith('public-catalog-v2', 'catalog-previous', expect.any(Object));
  });

  it('emits a public time-boundary event even when no catalog mutation arrives', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { controller, invalidations } = createControllerWithDependencies();
    invalidations.watch.mockReturnValue(of() as never);

    const event = firstValueFrom(controller.streamPublicCatalog(undefined).pipe(take(1)));
    await jest.advanceTimersByTimeAsync(60_000);

    await expect(event).resolves.toEqual({
      data: {
        type: 'PUBLIC_TIME_BOUNDARY',
        minute: Math.floor(new Date('2026-08-30T12:01:00.000Z').getTime() / 60_000),
      },
    });
  });

  it.each([
    ['event', 'event-1', 'streamEventSubscriptions', 'eventSubscriptions', 'admin-event-subscriptions'],
    ['major event', 'major-1', 'streamMajorEventSubscriptions', 'majorEventSubscriptions', 'admin-major-event-subscriptions'],
  ] as const)(
    'authorizes and scopes the %s subscription stream before polling',
    async (_label, id, method, fingerprintMethod, scopeType) => {
      const { controller, fingerprints, invalidations, policy, replay } = createControllerWithDependencies();
      const request = { user: { sub: 'admin-1' } };
      const fingerprint = { type: 'SUBSCRIPTIONS_INVALIDATED', revision: id };
      fingerprints[fingerprintMethod].mockResolvedValue(fingerprint);

      await expect(
        firstValueFrom(controller[method](id, request as never, 'subscriptions-cursor').pipe(take(1))),
      ).resolves.toEqual({ data: fingerprint });

      const target = method === 'streamEventSubscriptions' ? { eventId: id } : { majorEventId: id };
      expect(policy.assertPermissions).toHaveBeenCalledWith(request.user, [expect.any(String)], target);
      expect(fingerprints[fingerprintMethod]).toHaveBeenCalledWith(id);
      expect(invalidations.scope).toHaveBeenCalledWith(scopeType, id);
      expect(replay.replay).toHaveBeenCalledWith(`${scopeType}:${id}`, 'subscriptions-cursor', expect.any(Object));
    },
  );
});

function createController(options: { workspaceEvent?: MessageEvent; hasWorkspaceAccess?: boolean } = {}) {
  return createControllerWithDependencies(options).controller;
}

function createControllerWithDependencies(options: { workspaceEvent?: MessageEvent; hasWorkspaceAccess?: boolean } = {}) {
  const invalidations = {
    scope: jest.fn((channel: string, ...parts: string[]) => [channel, ...parts].join(':')),
    watch: jest.fn(() => of(options.workspaceEvent ?? { data: { type: 'heartbeat', timestamp: 1 } })),
  };
  const replay = {
    replay: jest.fn((_scope: string, _lastEventId: string | undefined, source: unknown) => source),
  };
  const fingerprints = {
    currentUser: jest.fn(),
    eventSubscriptions: jest.fn(),
    majorEventSubscriptions: jest.fn(),
  };
  const currentUser = {
    requireCurrentPerson: jest.fn(),
  };
  const organizerInfo = {
    currentUserOrganizerInfo: jest.fn(),
  };
  const policy = {
    hasEventManagerAccess: jest.fn(() => options.hasWorkspaceAccess ?? true),
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new RealtimeInvalidationController(
    invalidations as never,
    replay as never,
    fingerprints as never,
    currentUser as never,
    organizerInfo as never,
    policy as never,
  );
  return { controller, currentUser, fingerprints, invalidations, organizerInfo, policy, replay };
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
