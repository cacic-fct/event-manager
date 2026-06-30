import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { addHours, isWithinInterval, subHours } from 'date-fns';
import { CurrentUserAttendanceCollectionResolver } from './attendance-collection.resolver';

describe('CurrentUserAttendanceCollectionResolver scanner feed', () => {
  it('marks subscribed standalone event attendees as confirmed', async () => {
    const prisma = createPrisma({
      attendances: [
        scannerAttendance({
          personId: 'person-subscribed',
          eventId: 'standalone-event',
          allowSubscription: true,
          majorEventId: null,
        }),
        scannerAttendance({
          personId: 'person-unsubscribed',
          eventId: 'standalone-event',
          allowSubscription: true,
          majorEventId: null,
        }),
      ],
      eventSubscriptions: [{ personId: 'person-subscribed', eventId: 'standalone-event' }],
      majorEventSubscriptions: [],
      collectors: [],
      people: [],
      collectorUsers: [],
    });
    const resolver = new CurrentUserAttendanceCollectionResolver(prisma as never, {} as never, {} as never);

    const feed = await (
      resolver as unknown as { getScannerFeed: (eventId: string) => Promise<ScannerFeedItem[]> }
    ).getScannerFeed('standalone-event');

    expect(feed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId: 'person-subscribed',
          subscriptionStatus: 'CONFIRMED',
        }),
        expect.objectContaining({
          personId: 'person-unsubscribed',
          subscriptionStatus: undefined,
        }),
      ]),
    );
  });

  it('uses major event subscription statuses and collector first names in the scanner feed', async () => {
    const prisma = createPrisma({
      attendances: [
        scannerAttendance({
          personId: 'person-confirmed',
          eventId: 'major-session',
          allowSubscription: true,
          majorEventId: 'major-event',
          createdById: 'collector-user',
        }),
      ],
      eventSubscriptions: [],
      majorEventSubscriptions: [{ personId: 'person-confirmed', subscriptionStatus: 'CONFIRMED' }],
      collectors: [],
      people: [],
      collectorUsers: [{ id: 'collector-user', name: ' Grace Hopper ' }],
    });
    const resolver = new CurrentUserAttendanceCollectionResolver(prisma as never, {} as never, {} as never);

    const feed = await (
      resolver as unknown as { getScannerFeed: (eventId: string) => Promise<ScannerFeedItem[]> }
    ).getScannerFeed('major-session');

    expect(feed).toEqual([
      expect.objectContaining({
        personId: 'person-confirmed',
        subscriptionStatus: 'CONFIRMED',
        collectedByFirstName: 'Grace',
      }),
    ]);
    expect(prisma.eventSubscription.findMany).not.toHaveBeenCalled();
  });
});

describe('CurrentUserAttendanceCollectionResolver collection flow', () => {
  const context = { req: { user: { sub: 'collector-user' } } };

  it('lists visible collection events for the current collector using the expected time window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:30:00.000Z'));
    const prisma = createPrisma({
      attendances: [],
      eventSubscriptions: [],
      majorEventSubscriptions: [],
      people: [],
      collectorUsers: [],
      events: [],
      collectors: [
        {
          eventId: 'event-1',
          event: { id: 'event-1', name: 'Aula aberta', startDate: new Date('2026-05-23T16:00:00.000Z') },
        },
      ],
    });
    const currentUserContext = {
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'collector-person' }),
    };
    const resolver = new CurrentUserAttendanceCollectionResolver(
      prisma as never,
      currentUserContext as never,
      {} as never,
      undefined,
      {
        accessibleEventTargets: jest.fn().mockResolvedValue({
          eventIds: new Set(),
          majorEventIds: new Set(),
          eventGroupIds: new Set(),
        }),
      } as never,
    );

    await expect(resolver.currentUserAttendanceCollectionEvents(context as never)).resolves.toEqual([
      {
        eventId: 'event-1',
        event: { id: 'event-1', name: 'Aula aberta', startDate: new Date('2026-05-23T16:00:00.000Z') },
      },
    ]);

    const findManyArgs = prisma.eventAttendanceCollector.findMany.mock.calls[0][0];
    const startDateFilter = findManyArgs.where.event.startDate;
    expect(findManyArgs).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          personId: 'collector-person',
          event: expect.objectContaining({
            deletedAt: null,
            shouldCollectAttendance: true,
          }),
        }),
      }),
    );
    expect(startDateFilter.lte).toBeInstanceOf(Date);
    expect(startDateFilter.lte.getHours()).toBe(23);
    expect(startDateFilter.lte.getMinutes()).toBe(59);
    expect(startDateFilter.lte.getSeconds()).toBe(59);
    expect(startDateFilter.lte.getMilliseconds()).toBe(999);
    expect(startDateFilter.lte.getTime() - startDateFilter.gte.getTime()).toBe(30 * 60 * 60_000 - 1);
    jest.useRealTimers();
  });

  it('includes collection events available through attendance management grants', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:30:00.000Z'));
    const prisma = createPrisma({
      attendances: [],
      eventSubscriptions: [],
      majorEventSubscriptions: [],
      people: [],
      collectorUsers: [],
      collectors: [
        {
          eventId: 'event-1',
          event: { id: 'event-1', name: 'Aula aberta', startDate: new Date('2026-05-23T16:00:00.000Z') },
        },
      ],
      events: [
        { id: 'event-1', name: 'Aula aberta', startDate: new Date('2026-05-23T16:00:00.000Z') },
        { id: 'event-2', name: 'Minicurso', startDate: new Date('2026-05-23T17:00:00.000Z') },
      ],
    });
    const currentUserContext = {
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'collector-person' }),
    };
    const authorizationPolicy = {
      accessibleEventTargets: jest
        .fn()
        .mockResolvedValueOnce({ eventIds: new Set(['event-2']), majorEventIds: new Set(), eventGroupIds: new Set() })
        .mockResolvedValueOnce({ eventIds: new Set(), majorEventIds: new Set(), eventGroupIds: new Set() })
        .mockResolvedValueOnce({ eventIds: new Set(), majorEventIds: new Set(), eventGroupIds: new Set() }),
    };
    const resolver = new CurrentUserAttendanceCollectionResolver(
      prisma as never,
      currentUserContext as never,
      {} as never,
      undefined,
      authorizationPolicy as never,
    );

    await expect(resolver.currentUserAttendanceCollectionEvents(context as never)).resolves.toEqual([
      {
        eventId: 'event-1',
        event: { id: 'event-1', name: 'Aula aberta', startDate: new Date('2026-05-23T16:00:00.000Z') },
      },
      {
        eventId: 'event-2',
        event: { id: 'event-2', name: 'Minicurso', startDate: new Date('2026-05-23T17:00:00.000Z') },
      },
    ]);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ id: { in: ['event-2'] } }],
        }),
      }),
    );
    jest.useRealTimers();
  });

  it('includes all matching collection events available through super-admin access', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:30:00.000Z'));
    const prisma = createPrisma({
      attendances: [],
      eventSubscriptions: [],
      majorEventSubscriptions: [],
      people: [],
      collectorUsers: [],
      collectors: [],
      events: [
        { id: 'event-1', name: 'Aula aberta', startDate: new Date('2026-05-23T16:00:00.000Z') },
        { id: 'event-2', name: 'Minicurso', startDate: new Date('2026-05-23T17:00:00.000Z') },
      ],
    });
    const currentUserContext = {
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'super-admin-person' }),
    };
    const authorizationPolicy = {
      accessibleEventTargets: jest.fn().mockResolvedValue(null),
    };
    const resolver = new CurrentUserAttendanceCollectionResolver(
      prisma as never,
      currentUserContext as never,
      {} as never,
      undefined,
      authorizationPolicy as never,
    );

    await expect(resolver.currentUserAttendanceCollectionEvents(context as never)).resolves.toEqual([
      {
        eventId: 'event-1',
        event: { id: 'event-1', name: 'Aula aberta', startDate: new Date('2026-05-23T16:00:00.000Z') },
      },
      {
        eventId: 'event-2',
        event: { id: 'event-2', name: 'Minicurso', startDate: new Date('2026-05-23T17:00:00.000Z') },
      },
    ]);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          OR: expect.any(Array),
        }),
      }),
    );
    jest.useRealTimers();
  });

  it('rejects scanner codes that are not current user Aztec payloads', async () => {
    const { resolver } = createCollectionResolver({
      collector: collectorPerson(),
    });

    await expect(
      resolver.collectCurrentUserAttendanceFromScannerCode(
        { eventId: 'event-1', code: 'ticket:user-1', location: preciseLocation() },
        context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks collector visibility before frozen resource state', async () => {
    const { resolver, frozenResources } = createCollectionResolver({
      collector: null,
    });

    await expect(
      resolver.collectCurrentUserAttendanceFromScannerCode(
        { eventId: 'hidden-event', code: 'user:user-1', location: preciseLocation() },
        context as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(frozenResources.assertEventMutable).not.toHaveBeenCalled();
  });

  it('returns not found when a scanned user has no active person', async () => {
    const { resolver } = createCollectionResolver({
      collector: collectorPerson(),
      people: [],
    });

    await expect(
      resolver.collectCurrentUserAttendanceFromScannerCode(
        { eventId: 'event-1', code: 'user:user-1', location: preciseLocation() },
        context as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates scanner attendance with precise location and refreshes its category', async () => {
    const attendance = { id: 'attendance-1', personId: 'person-1', eventId: 'event-1' };
    const refreshForAttendance = jest.fn().mockResolvedValue(undefined);
    const { resolver, prisma } = createCollectionResolver({
      collector: collectorPerson(),
      people: [{ id: 'person-1' }],
      transactionResult: attendance,
      attendanceCategories: { refreshForAttendance },
    });

    await expect(
      resolver.collectCurrentUserAttendanceFromScannerCode(
        { eventId: 'event-1', code: 'user:user-1', location: preciseLocation() },
        context as never,
      ),
    ).resolves.toBe(attendance);

    const tx = prisma.$transaction.mock.calls[0][0] as (tx: TxMock) => Promise<unknown>;
    const txMock = createTxMock(attendance);
    await tx(txMock);
    expect(txMock.eventAttendance.create).toHaveBeenCalledWith({
      data: {
        eventId: 'event-1',
        personId: 'person-1',
        createdById: 'collector-user',
        committedById: 'collector-user',
        createdByMethod: AttendanceCreationMethod.SCANNER,
        collectedLatitude: -22.12,
        collectedLongitude: -51.4,
        collectedAccuracyMeters: 15,
      },
    });
    expect(refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', txMock);
  });

  it('converts duplicate attendance writes into conflicts', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { resolver } = createCollectionResolver({
      collector: collectorPerson(),
      people: [{ id: 'person-1' }],
      transactionError: duplicateError,
    });

    await expect(
      resolver.collectCurrentUserAttendanceFromScannerCode(
        { eventId: 'event-1', code: 'user:user-1', location: preciseLocation() },
        context as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('commits offline attendances with claimed author and current sender separated', async () => {
    const attendance = {
      personId: 'person-1',
      eventId: 'event-1',
      createdById: 'offline-user',
      committedById: 'collector-user',
    };
    const { resolver, prisma } = createCollectionResolver({
      collector: collectorPerson(),
      people: [{ id: 'person-1' }],
      transactionResult: attendance,
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: [
            {
              clientId: 'queue-1',
              eventId: 'event-1',
              createdByMethod: AttendanceCreationMethod.SCANNER,
              code: 'user:user-1',
              location: preciseLocation(),
              collectedAt: new Date('2026-05-23T14:00:00.000Z'),
              authorUserId: 'offline-user',
              authorName: 'Offline Collector',
              authorEmail: 'offline@example.com',
            },
          ],
        },
        context as never,
      ),
    ).resolves.toEqual([
      {
        clientId: 'queue-1',
        eventId: 'event-1',
        status: 'CREATED',
        attendance,
      },
    ]);

    const tx = prisma.$transaction.mock.calls[0][0] as (tx: TxMock) => Promise<unknown>;
    const txMock = createTxMock(attendance);
    await tx(txMock);
    expect(txMock.eventAttendance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'event-1',
        personId: 'person-1',
        createdById: 'offline-user',
        committedById: 'collector-user',
        attendedAt: new Date('2026-05-23T14:00:00.000Z'),
      }),
    });
  });

  it('stages offline attendances when send-time collection authorization has expired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:30:00.000Z'));
    const notifications = createNotificationsMock();
    const { resolver, prisma } = createCollectionResolver({
      collector: collectorPerson({
        event: {
          startDate: new Date('2026-05-20T12:00:00.000Z'),
          endDate: new Date('2026-05-20T13:00:00.000Z'),
          deletedAt: null,
          publiclyVisible: true,
          shouldCollectAttendance: true,
        },
      }),
      people: [{ id: 'person-1' }],
      notificationUsers: [{ id: 'admin-user', email: 'admin@example.com', name: 'Admin User' }],
      notifications,
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: [
            {
              clientId: 'queue-1',
              eventId: 'event-1',
              createdByMethod: AttendanceCreationMethod.SCANNER,
              code: 'user:user-1',
              location: preciseLocation(),
              collectedAt: new Date('2026-05-20T12:30:00.000Z'),
              authorUserId: 'offline-user',
              authorName: 'Offline Collector',
              authorEmail: 'offline@example.com',
            },
          ],
        },
        context as never,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        clientId: 'queue-1',
        eventId: 'event-1',
        status: 'STAGED',
        stagedSubmission: expect.objectContaining({
          clientId: 'queue-1',
          eventId: 'event-1',
          personId: 'person-1',
          authorUserId: 'offline-user',
          submittedById: 'collector-user',
          collectedLatitude: -22.12,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 15,
        }),
      }),
    ]);

    expect(prisma.offlineEventAttendanceSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'queue-1',
          eventId: 'event-1',
          personId: 'person-1',
          authorUserId: 'offline-user',
          submittedById: 'collector-user',
          collectedAt: new Date('2026-05-20T12:30:00.000Z'),
          collectedLatitude: -22.12,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 15,
        }),
      }),
    );
    expect(notifications.notifyOfflineAttendanceReviewQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: 'submission-1',
        eventId: 'event-1',
        eventName: 'Evento',
        submittedById: 'collector-user',
        recipients: [
          {
            subscriberId: 'admin-user',
            email: 'admin@example.com',
            firstName: 'Admin',
            lastName: 'User',
            data: { userId: 'admin-user' },
          },
        ],
      }),
    );
    jest.useRealTimers();
  });

  it('does not notify reviewers again when an offline retry updates an already pending submission', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:30:00.000Z'));
    const notifications = createNotificationsMock();
    const { resolver, prisma } = createCollectionResolver({
      collector: collectorPerson({
        event: {
          startDate: new Date('2026-05-20T12:00:00.000Z'),
          endDate: new Date('2026-05-20T13:00:00.000Z'),
          deletedAt: null,
          publiclyVisible: true,
          shouldCollectAttendance: true,
        },
      }),
      people: [{ id: 'person-1' }],
      offlineSubmissions: [
        buildOfflineSubmissionRecord({
          clientId: 'queue-1',
          eventId: 'event-1',
          personId: 'person-1',
          createdByMethod: AttendanceCreationMethod.SCANNER,
          scannerCode: 'user:user-1',
          manualValue: null,
          collectedAt: new Date('2026-05-20T12:30:00.000Z'),
          authorUserId: 'offline-user',
          submittedById: 'collector-user',
          stagedReason: 'A coleta de presença não está aberta para este evento.',
          collectedLatitude: -22.12,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 15,
        }),
      ],
      notificationUsers: [{ id: 'admin-user', email: 'admin@example.com', name: 'Admin User' }],
      notifications,
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: [
            {
              clientId: 'queue-1',
              eventId: 'event-1',
              createdByMethod: AttendanceCreationMethod.SCANNER,
              code: 'user:user-1',
              location: preciseLocation(),
              collectedAt: new Date('2026-05-20T12:30:00.000Z'),
              authorUserId: 'offline-user',
            },
          ],
        },
        context as never,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        clientId: 'queue-1',
        eventId: 'event-1',
        status: 'STAGED',
      }),
    ]);

    expect(prisma.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledTimes(1);
    expect(notifications.notifyOfflineAttendanceReviewQueued).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not update finalized staged submissions on offline retry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:30:00.000Z'));
    const { resolver, prisma } = createCollectionResolver({
      collector: collectorPerson({
        event: {
          startDate: new Date('2026-05-20T12:00:00.000Z'),
          endDate: new Date('2026-05-20T13:00:00.000Z'),
          deletedAt: null,
          publiclyVisible: true,
          shouldCollectAttendance: true,
        },
      }),
      people: [{ id: 'person-1' }],
      offlineSubmissions: [
        buildOfflineSubmissionRecord(
          {
            clientId: 'queue-1',
            eventId: 'event-1',
            personId: 'person-1',
            createdByMethod: AttendanceCreationMethod.SCANNER,
            scannerCode: 'user:user-1',
            manualValue: null,
            collectedAt: new Date('2026-05-20T12:30:00.000Z'),
            authorUserId: 'offline-user',
            authorName: 'Offline Collector',
            authorEmail: 'offline@example.com',
            submittedById: 'collector-user',
            stagedReason: 'A coleta de presença não está aberta para este evento.',
            resolutionError: null,
            collectedLatitude: -22.12,
            collectedLongitude: -51.4,
            collectedAccuracyMeters: 15,
          },
          { status: 'COMMITTED', committedById: 'admin-user' },
        ),
      ],
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: [
            {
              clientId: 'queue-1',
              eventId: 'event-1',
              createdByMethod: AttendanceCreationMethod.SCANNER,
              code: 'user:user-1',
              location: preciseLocation(),
              collectedAt: new Date('2026-05-20T12:30:00.000Z'),
              authorUserId: 'offline-user',
            },
          ],
        },
        context as never,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        clientId: 'queue-1',
        eventId: 'event-1',
        status: 'STAGED',
        stagedSubmission: expect.objectContaining({
          id: 'submission-1',
          status: 'COMMITTED',
          committedById: 'admin-user',
        }),
      }),
    ]);

    expect(prisma.offlineEventAttendanceSubmission.updateMany).not.toHaveBeenCalled();
    expect(prisma.offlineEventAttendanceSubmission.create).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('returns an item-level failure when staging cannot persist imprecise location', async () => {
    const { resolver, prisma } = createCollectionResolver({
      collector: collectorPerson(),
      people: [{ id: 'person-1' }],
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: [
            {
              clientId: 'queue-1',
              eventId: 'event-1',
              createdByMethod: AttendanceCreationMethod.SCANNER,
              code: 'user:user-1',
              location: {
                latitude: -22.12,
                longitude: -51.4,
                accuracyMeters: 250,
              },
              collectedAt: new Date('2026-05-23T14:00:00.000Z'),
              authorUserId: 'offline-user',
            },
          ],
        },
        context as never,
      ),
    ).resolves.toEqual([
      {
        clientId: 'queue-1',
        eventId: 'event-1',
        status: 'FAILED',
        message: 'Ative a localização precisa para registrar presença.',
      },
    ]);

    expect(prisma.offlineEventAttendanceSubmission.create).not.toHaveBeenCalled();
  });

  it('commits expired offline attendances directly for users with attendance collection permission', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:30:00.000Z'));
    const attendance = {
      personId: 'person-1',
      eventId: 'event-1',
      createdById: 'offline-user',
      committedById: 'collector-user',
    };
    const { resolver, prisma, authorizationPolicy } = createCollectionResolver({
      collector: collectorPerson({
        event: {
          startDate: new Date('2026-05-20T12:00:00.000Z'),
          endDate: new Date('2026-05-20T13:00:00.000Z'),
          deletedAt: null,
          publiclyVisible: true,
          shouldCollectAttendance: true,
        },
      }),
      people: [{ id: 'person-1' }],
      transactionResult: attendance,
      grantsAttendancePermission: true,
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: [
            {
              clientId: 'queue-1',
              eventId: 'event-1',
              createdByMethod: AttendanceCreationMethod.SCANNER,
              code: 'user:user-1',
              location: preciseLocation(),
              collectedAt: new Date('2026-05-20T12:30:00.000Z'),
              authorUserId: 'offline-user',
            },
          ],
        },
        context as never,
      ),
    ).resolves.toEqual([
      {
        clientId: 'queue-1',
        eventId: 'event-1',
        status: 'CREATED',
        attendance,
      },
    ]);

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(context.req.user, ['event-attendance#collect'], {
      eventId: 'event-1',
    });
    expect(authorizationPolicy.assertAttendanceCollectorForEvent).not.toHaveBeenCalled();
    expect(prisma.offlineEventAttendanceSubmission.create).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('skips duplicate offline attendances without staging them', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { resolver, prisma } = createCollectionResolver({
      collector: collectorPerson(),
      people: [{ id: 'person-1' }],
      transactionError: duplicateError,
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: [
            {
              clientId: 'queue-1',
              eventId: 'event-1',
              createdByMethod: AttendanceCreationMethod.SCANNER,
              code: 'user:user-1',
              location: preciseLocation(),
              collectedAt: new Date('2026-05-23T14:00:00.000Z'),
              authorUserId: 'offline-user',
            },
          ],
        },
        context as never,
      ),
    ).resolves.toEqual([
      {
        clientId: 'queue-1',
        eventId: 'event-1',
        status: 'DUPLICATE',
        message: 'Presença já registrada para este evento.',
      },
    ]);
    expect(prisma.offlineEventAttendanceSubmission.create).not.toHaveBeenCalled();
  });

  it('finds manual input matches by normalized phone and resolves merged people', async () => {
    const { resolver, prisma } = createCollectionResolver({
      collector: collectorPerson({ userId: 'fallback-user' }),
      people: [{ id: 'old-person', mergedIntoId: 'person-1' }],
      transactionResult: { id: 'attendance-1' },
    });

    await resolver.collectCurrentUserManualAttendance(
      { eventId: 'event-1', value: '+55 (18) 99999-0000', location: preciseLocation() },
      { request: { user: { sub: undefined } } } as never,
    );

    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              phone: {
                in: ['5518999990000', '18999990000', '+5518999990000'],
              },
            },
          ]),
        }),
      }),
    );
  });

  it('rejects manual input with duplicate active people or missing precise location', async () => {
    const duplicateResolver = createCollectionResolver({
      collector: collectorPerson(),
      people: [{ id: 'person-1' }, { id: 'person-2' }],
    }).resolver;

    await expect(
      duplicateResolver.collectCurrentUserManualAttendance(
        { eventId: 'event-1', value: 'ada@example.com', location: preciseLocation() },
        context as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const missingLocationResolver = createCollectionResolver({
      collector: collectorPerson(),
      people: [{ id: 'person-1' }],
    }).resolver;
    await expect(
      missingLocationResolver.collectCurrentUserManualAttendance(
        { eventId: 'event-1', value: 'ada@example.com' },
        context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects collectors that are not authorized or outside the collection window', async () => {
    const forbiddenResolver = createCollectionResolver({
      collector: null,
    }).resolver;

    await expect(
      forbiddenResolver.currentUserAttendanceCollectionFeed('event-1', context as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:30:00.000Z'));
    const closedResolver = createCollectionResolver({
      collector: collectorPerson({
        event: {
          startDate: new Date('2026-05-20T12:00:00.000Z'),
          endDate: new Date('2026-05-20T13:00:00.000Z'),
          deletedAt: null,
          publiclyVisible: true,
          shouldCollectAttendance: true,
        },
      }),
    }).resolver;

    await expect(
      closedResolver.currentUserAttendanceCollectionFeed('event-1', context as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    jest.useRealTimers();
  });
});

type ScannerFeedItem = {
  personId: string;
  subscriptionStatus?: string;
  collectedByFirstName?: string;
};

type OfflineSubmissionCreateInput = {
  clientId: string;
  eventId: string;
  personId?: string | null;
  createdByMethod: AttendanceCreationMethod;
  scannerCode?: string | null;
  manualValue?: string | null;
  collectedAt: Date;
  authorUserId?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  submittedById: string;
  stagedReason?: string | null;
  resolutionError?: string | null;
  collectedLatitude?: number | null;
  collectedLongitude?: number | null;
  collectedAccuracyMeters?: number | null;
};

type OfflineSubmissionRecord = {
  id: string;
  clientId: string;
  eventId: string;
  personId: string | null;
  status: 'PENDING' | 'COMMITTED' | 'REJECTED';
  createdByMethod: AttendanceCreationMethod;
  scannerCode: string | null;
  manualValue: string | null;
  collectedAt: Date;
  authorUserId: string | null;
  authorName: string | null;
  authorEmail: string | null;
  submittedById: string;
  submittedAt: Date;
  stagedReason: string | null;
  resolutionError: string | null;
  collectedLatitude: number | null;
  collectedLongitude: number | null;
  collectedAccuracyMeters: number | null;
  committedAt: Date | null;
  committedById: string | null;
  rejectedAt: Date | null;
  rejectedById: string | null;
  rejectionReason: string | null;
  event: { id: string; name: string };
};

type OfflineSubmissionFindUniqueArgs = {
  where: OfflineSubmissionWhere;
};

type OfflineSubmissionWhere = {
  submittedById_clientId: {
    submittedById: string;
    clientId: string;
  };
};

type OfflineSubmissionCreateArgs = {
  data: OfflineSubmissionCreateInput;
};

type OfflineSubmissionUpdateManyArgs = {
  where: {
    submittedById: string;
    clientId: string;
    status: 'PENDING';
  };
  data: Partial<OfflineSubmissionCreateInput>;
};

function buildOfflineSubmissionRecord(
  input: OfflineSubmissionCreateInput,
  overrides: Partial<OfflineSubmissionRecord> = {},
): OfflineSubmissionRecord {
  return {
    id: 'submission-1',
    clientId: input.clientId,
    eventId: input.eventId,
    personId: input.personId ?? null,
    status: 'PENDING',
    createdByMethod: input.createdByMethod,
    scannerCode: input.scannerCode ?? null,
    manualValue: input.manualValue ?? null,
    collectedAt: input.collectedAt,
    authorUserId: input.authorUserId ?? null,
    authorName: input.authorName ?? null,
    authorEmail: input.authorEmail ?? null,
    submittedById: input.submittedById,
    submittedAt: new Date('2026-05-23T15:30:00.000Z'),
    stagedReason: input.stagedReason ?? null,
    resolutionError: input.resolutionError ?? null,
    collectedLatitude: input.collectedLatitude ?? null,
    collectedLongitude: input.collectedLongitude ?? null,
    collectedAccuracyMeters: input.collectedAccuracyMeters ?? null,
    committedAt: null,
    committedById: null,
    rejectedAt: null,
    rejectedById: null,
    rejectionReason: null,
    event: { id: input.eventId, name: 'Evento' },
    ...overrides,
  };
}

function offlineSubmissionKeyFromWhere(where: OfflineSubmissionWhere): string {
  return offlineSubmissionKey(where.submittedById_clientId.submittedById, where.submittedById_clientId.clientId);
}

function offlineSubmissionKey(submittedById: string, clientId: string): string {
  return `${submittedById}:${clientId}`;
}

function scannerAttendance(input: {
  personId: string;
  eventId: string;
  allowSubscription: boolean;
  majorEventId: string | null;
  createdById?: string | null;
}) {
  return {
    personId: input.personId,
    eventId: input.eventId,
    attendedAt: new Date('2026-05-20T12:00:00.000Z'),
    createdById: input.createdById ?? null,
    committedById: null,
    createdByMethod: 'SCANNER',
    person: {
      name: input.personId,
      user: {
        unespRole: ['aluno-graduacao'],
      },
    },
    event: {
      allowSubscription: input.allowSubscription,
      majorEventId: input.majorEventId,
    },
  };
}

function createPrisma(input: {
  attendances: ReturnType<typeof scannerAttendance>[];
  eventSubscriptions: { personId: string; eventId: string }[];
  majorEventSubscriptions: { personId: string; subscriptionStatus: string }[];
  collectors: { eventId: string; event: unknown }[];
  events?: Array<{ id: string; startDate?: Date } & Record<string, unknown>>;
  people: { id: string; mergedIntoId?: string | null }[];
  collectorUsers: { id: string; name: string }[];
  offlineSubmissions?: OfflineSubmissionRecord[];
}) {
  const offlineSubmissions = new Map<string, OfflineSubmissionRecord>();
  for (const submission of input.offlineSubmissions ?? []) {
    offlineSubmissions.set(offlineSubmissionKey(submission.submittedById, submission.clientId), submission);
  }

  return {
    eventAttendanceCollector: {
      findMany: jest.fn().mockResolvedValue(input.collectors),
      findUnique: jest.fn(),
    },
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue(input.attendances),
    },
    event: {
      findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
      findMany: jest.fn().mockResolvedValue(input.events ?? []),
    },
    offlineEventAttendanceSubmission: {
      findUnique: jest.fn(
        async (args: OfflineSubmissionFindUniqueArgs) =>
          offlineSubmissions.get(offlineSubmissionKeyFromWhere(args.where)) ?? null,
      ),
      findUniqueOrThrow: jest.fn(async (args: OfflineSubmissionFindUniqueArgs) => {
        const submission = offlineSubmissions.get(offlineSubmissionKeyFromWhere(args.where));
        if (!submission) {
          throw new Error('Offline submission not found.');
        }

        return submission;
      }),
      create: jest.fn(async (args: OfflineSubmissionCreateArgs) => {
        const submission = buildOfflineSubmissionRecord(args.data, {
          id: `submission-${offlineSubmissions.size + 1}`,
        });
        offlineSubmissions.set(offlineSubmissionKey(submission.submittedById, submission.clientId), submission);
        return submission;
      }),
      updateMany: jest.fn(async (args: OfflineSubmissionUpdateManyArgs) => {
        const submission = offlineSubmissions.get(offlineSubmissionKey(args.where.submittedById, args.where.clientId));
        if (!submission || submission.status !== args.where.status) {
          return { count: 0 };
        }

        Object.assign(submission, args.data);
        return { count: 1 };
      }),
    },
    people: {
      findFirst: jest.fn().mockResolvedValue(input.people[0] ?? null),
      findMany: jest.fn().mockResolvedValue(input.people),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue(input.majorEventSubscriptions),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue(input.eventSubscriptions),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(input.collectorUsers),
    },
  };
}

type CollectorRecord = {
  id: string;
  userId?: string | null;
  event: {
    startDate: Date;
    endDate: Date;
    deletedAt: Date | null;
    publiclyVisible: boolean;
    shouldCollectAttendance: boolean;
  };
};

type TxMock = ReturnType<typeof createTxMock>;

function createCollectionResolver(input: {
  collector?: CollectorRecord | null;
  people?: { id: string; mergedIntoId?: string | null }[];
  transactionResult?: unknown;
  transactionError?: unknown;
  attendanceCategories?: { refreshForAttendance: jest.Mock };
  frozenResources?: { assertEventMutable: jest.Mock };
  grantsAttendancePermission?: boolean;
  offlineSubmissions?: OfflineSubmissionRecord[];
  notificationUsers?: { id: string; email: string; name: string }[];
  notifications?: ReturnType<typeof createNotificationsMock>;
}) {
  const prisma = createPrisma({
    attendances: [],
    eventSubscriptions: [],
    majorEventSubscriptions: [],
    collectors: [],
    people: input.people ?? [],
    collectorUsers: input.notificationUsers ?? [],
    offlineSubmissions: input.offlineSubmissions,
  }) as ReturnType<typeof createPrisma> & {
    $transaction: jest.Mock;
  };
  prisma.eventAttendanceCollector.findUnique.mockResolvedValue(
    Object.prototype.hasOwnProperty.call(input, 'collector') ? input.collector : collectorPerson(),
  );
  prisma.$transaction = jest.fn(async (callback: (tx: TxMock) => Promise<unknown>) => {
    if (input.transactionError) {
      throw input.transactionError;
    }
    return callback(createTxMock(input.transactionResult ?? { id: 'attendance-1' }));
  });
  const currentUserContext = {
    requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'collector-person' }),
  };
  const attendanceCategories = input.attendanceCategories ?? {
    refreshForAttendance: jest.fn().mockResolvedValue(undefined),
  };
  const frozenResources = input.frozenResources ?? {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const authorizationPolicy = {
    assertPermissions: jest.fn(async () => {
      if (!input.grantsAttendancePermission) {
        throw new ForbiddenException('Missing Event Manager permission grants: event-attendance#collect.');
      }
    }),
    assertAttendanceCollectorForEvent: jest.fn(
      async (
        eventId: string,
        personId: string,
        options: {
          enforceCollectionWindow?: boolean;
        },
      ) => {
        const collector = await prisma.eventAttendanceCollector.findUnique({
          where: {
            eventId_personId: {
              eventId,
              personId,
            },
          },
        });

        if (
          !collector ||
          collector.event.deletedAt ||
          !collector.event.publiclyVisible ||
          !collector.event.shouldCollectAttendance
        ) {
          throw new ForbiddenException('Você não pode coletar presença para este evento.');
        }

        if (options.enforceCollectionWindow && !isCollectionOpen(collector.event.startDate, collector.event.endDate)) {
          throw new ForbiddenException('A coleta de presença não está aberta para este evento.');
        }
      },
    ),
  };

  return {
    resolver: new CurrentUserAttendanceCollectionResolver(
      prisma as never,
      currentUserContext as never,
      attendanceCategories as never,
      frozenResources as never,
      authorizationPolicy as never,
      undefined,
      undefined,
      input.notifications as never,
    ),
    prisma,
    frozenResources,
    authorizationPolicy,
  };
}

function createNotificationsMock() {
  return {
    notifyOfflineAttendanceReviewQueued: jest.fn().mockResolvedValue(undefined),
    mapUserToRecipient: jest.fn((user: { id: string; email: string; name: string }) => {
      const [firstName, ...lastNameParts] = user.name.trim().split(/\s+/);
      return {
        subscriberId: user.id,
        email: user.email,
        firstName,
        lastName: lastNameParts.join(' ') || undefined,
        data: { userId: user.id },
      };
    }),
  };
}

function isCollectionOpen(startDate: Date, endDate: Date): boolean {
  return isWithinInterval(new Date(), {
    start: subHours(startDate, 3),
    end: addHours(endDate, 6),
  });
}

function createTxMock(attendance: unknown) {
  return {
    eventAttendance: {
      create: jest.fn().mockResolvedValue(undefined),
      findUniqueOrThrow: jest.fn().mockResolvedValue(attendance),
    },
  };
}

function collectorPerson(overrides: Partial<CollectorRecord> = {}): CollectorRecord {
  return {
    id: 'collector-person',
    userId: null,
    event: {
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      deletedAt: null,
      publiclyVisible: true,
      shouldCollectAttendance: true,
    },
    ...overrides,
  };
}

function preciseLocation() {
  return {
    latitude: -22.12,
    longitude: -51.4,
    accuracyMeters: 15,
  };
}
