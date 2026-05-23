import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
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

    const feed = await (resolver as unknown as { getScannerFeed: (eventId: string) => Promise<ScannerFeedItem[]> })
      .getScannerFeed('standalone-event');

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

    const feed = await (resolver as unknown as { getScannerFeed: (eventId: string) => Promise<ScannerFeedItem[]> })
      .getScannerFeed('major-session');

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
      collectors: [
        {
          eventId: 'event-1',
          event: { id: 'event-1', name: 'Aula aberta' },
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
    );

    await expect(resolver.currentUserAttendanceCollectionEvents(context as never)).resolves.toEqual([
      { eventId: 'event-1', event: { id: 'event-1', name: 'Aula aberta' } },
    ]);

    expect(prisma.eventAttendanceCollector.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          personId: 'collector-person',
          event: expect.objectContaining({
            startDate: {
              gte: new Date('2026-05-22T21:00:00.000Z'),
              lte: new Date('2026-05-24T02:59:59.999Z'),
            },
          }),
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

    await expect(forbiddenResolver.currentUserAttendanceCollectionFeed('event-1', context as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

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

    await expect(closedResolver.currentUserAttendanceCollectionFeed('event-1', context as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    jest.useRealTimers();
  });
});

type ScannerFeedItem = {
  personId: string;
  subscriptionStatus?: string;
  collectedByFirstName?: string;
};

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
    createdByMethod: 'SCANNER',
    person: {
      name: input.personId,
      user: {
        role: 'student',
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
  people: { id: string; mergedIntoId?: string | null }[];
  collectorUsers: { id: string; name: string }[];
}) {
  return {
    eventAttendanceCollector: {
      findMany: jest.fn().mockResolvedValue(input.collectors),
      findUnique: jest.fn(),
    },
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue(input.attendances),
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
}) {
  const prisma = createPrisma({
    attendances: [],
    eventSubscriptions: [],
    majorEventSubscriptions: [],
    collectors: [],
    people: input.people ?? [],
    collectorUsers: [],
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

  return {
    resolver: new CurrentUserAttendanceCollectionResolver(
      prisma as never,
      currentUserContext as never,
      attendanceCategories as never,
    ),
    prisma,
  };
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
