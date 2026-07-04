import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { CurrentUserAttendanceCollectionResolver } from './attendance-collection.resolver';
import {
  buildOfflineSubmissionRecord,
  collectorPerson,
  createCollectionResolver,
  createNotificationsMock,
  createPrisma,
  createTxMock,
  preciseLocation,
  type TxMock,
} from './attendance-collection.resolver.spec-support';

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
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [{ id: { in: ['event-2'] } }],
            }),
          ]),
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
        createdById: 'collector-user',
        committedById: 'collector-user',
        attendedAt: new Date('2026-05-23T14:00:00.000Z'),
      }),
    });
  });

  it('stages offline attendances when send-time collection authorization has expired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:30:00.000Z'));
    const notifications = createNotificationsMock();
    const { resolver, prisma, auditLog } = createCollectionResolver({
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
          authorUserId: 'collector-user',
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
          authorUserId: 'collector-user',
          submittedById: 'collector-user',
          collectedAt: new Date('2026-05-20T12:30:00.000Z'),
          collectedLatitude: -22.12,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 15,
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'person-1:event-1',
        entityLabel: 'submission-1',
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

  it('rejects offline synchronization batches above the configured limit before touching persistence', async () => {
    const { resolver, prisma, currentUserContext } = createCollectionResolver({
      collector: collectorPerson(),
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: Array.from({ length: 151 }, (_, index) => ({
            clientId: `queue-${index}`,
            eventId: 'event-1',
            createdByMethod: AttendanceCreationMethod.SCANNER,
            code: 'user:user-1',
            location: preciseLocation(),
            collectedAt: new Date('2026-05-23T14:00:00.000Z'),
          })),
        },
        context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(currentUserContext.requireCurrentPerson).not.toHaveBeenCalled();
    expect(prisma.offlineEventAttendanceSubmission.create).not.toHaveBeenCalled();
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

  it('stages duplicate-person offline manual inputs for admin correction', async () => {
    const { resolver, prisma } = createCollectionResolver({
      collector: collectorPerson(),
      people: [
        { id: 'person-1', mergedIntoId: null },
        { id: 'person-2', mergedIntoId: null },
      ],
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: [
            {
              clientId: 'queue-duplicate-person',
              eventId: 'event-1',
              createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
              value: 'duplicate@example.com',
              location: preciseLocation(),
              collectedAt: new Date('2026-05-23T14:00:00.000Z'),
              authorUserId: 'offline-user',
            },
          ],
        },
        context as never,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        clientId: 'queue-duplicate-person',
        eventId: 'event-1',
        status: 'STAGED',
        stagedSubmission: expect.objectContaining({
          personId: undefined,
          resolutionIssue: 'DUPLICATE_PERSON',
          resolutionError: expect.stringContaining('Pessoa tem registros duplicados'),
        }),
      }),
    ]);
    expect(prisma.offlineEventAttendanceSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'queue-duplicate-person',
          personId: null,
          manualValue: 'duplicate@example.com',
          resolutionError: expect.stringContaining('Pessoa tem registros duplicados'),
        }),
      }),
    );
  });

  it('stages offline identity conflicts for permissioned senders instead of returning terminal conflicts', async () => {
    const { resolver, authorizationPolicy } = createCollectionResolver({
      collector: null,
      people: [
        { id: 'person-1', mergedIntoId: null },
        { id: 'person-2', mergedIntoId: null },
      ],
      grantsAttendancePermission: true,
    });

    await expect(
      resolver.commitCurrentUserOfflineAttendances(
        {
          attendances: [
            {
              clientId: 'queue-admin-duplicate-person',
              eventId: 'event-1',
              createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
              value: 'duplicate@example.com',
              location: preciseLocation(),
              collectedAt: new Date('2026-05-23T14:00:00.000Z'),
              authorUserId: 'offline-user',
            },
          ],
        },
        context as never,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        clientId: 'queue-admin-duplicate-person',
        eventId: 'event-1',
        status: 'STAGED',
        stagedSubmission: expect.objectContaining({
          resolutionIssue: 'DUPLICATE_PERSON',
        }),
      }),
    ]);
    expect(authorizationPolicy.assertAttendanceCollectorForEvent).not.toHaveBeenCalled();
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
                in: expect.arrayContaining(['5518999990000', '18999990000', '+5518999990000']),
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

    const staleDuplicateResolver = createCollectionResolver({
      collector: collectorPerson(),
      people: [
        { id: 'old-person-1', mergedIntoId: 'person-1' },
        { id: 'old-person-2', mergedIntoId: 'person-2' },
      ],
    }).resolver;
    await expect(
      staleDuplicateResolver.collectCurrentUserManualAttendance(
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
