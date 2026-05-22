import { AttendanceImportMatchType } from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod } from '@prisma/client';
import { EventAttendancesResolver } from './event-attendances.resolver';
describe('EventAttendancesResolver operations', () => {
  let prisma: ReturnType<typeof createFullPrisma>;
  let attendanceCategories: {
    refreshForAttendance: jest.Mock;
    refreshForEventPersons: jest.Mock;
    refreshForMajorEventPerson: jest.Mock;
  };
  let resolver: EventAttendancesResolver;

  beforeEach(() => {
    prisma = createFullPrisma();
    attendanceCategories = {
      refreshForAttendance: jest.fn().mockResolvedValue(undefined),
      refreshForEventPersons: jest.fn().mockResolvedValue(undefined),
      refreshForMajorEventPerson: jest.fn().mockResolvedValue(undefined),
    };
    resolver = new EventAttendancesResolver(prisma as never, attendanceCategories as never);
  });

  it('lists attendances with collector full names', async () => {
    prisma.eventAttendance.findMany.mockResolvedValue([
      {
        personId: 'person-1',
        eventId: 'event-1',
        attendedAt: new Date('2026-05-21T12:00:00.000Z'),
        createdById: 'collector-1',
        person: { id: 'person-1' },
        event: { id: 'event-1' },
      },
      {
        personId: 'person-2',
        eventId: 'event-1',
        attendedAt: new Date('2026-05-21T12:01:00.000Z'),
        createdById: null,
        person: { id: 'person-2' },
        event: { id: 'event-1' },
      },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'collector-1', name: 'Grace Hopper' }]);

    await expect(resolver.eventAttendances('person-1', 'event-1', 1, 20)).resolves.toEqual([
      expect.objectContaining({
        personId: 'person-1',
        collectedByFullName: 'Grace Hopper',
      }),
      expect.objectContaining({
        personId: 'person-2',
        collectedByFullName: undefined,
      }),
    ]);
    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId: 'person-1',
          eventId: 'event-1',
        },
        skip: 1,
        take: 20,
      }),
    );
  });

  it('builds major event attendance rows from subscriptions and loose attendances', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([
      { id: 'event-1', name: 'Opening', startDate: new Date('2026-05-21T12:00:00.000Z') },
      { id: 'event-2', name: 'Workshop', startDate: new Date('2026-05-22T12:00:00.000Z') },
    ]);
    prisma.majorEventSubscription.findMany.mockResolvedValue([
      {
        id: 'subscription-1',
        personId: 'person-1',
        subscriptionStatus: 'CONFIRMED',
        amountPaid: 1000,
        paymentDate: new Date('2026-05-20T12:00:00.000Z'),
        paymentTier: 'student',
        person: { id: 'person-1', name: 'Ada' },
      },
    ]);
    prisma.eventAttendance.findMany.mockResolvedValue([
      {
        personId: 'person-1',
        eventId: 'event-1',
        attendedAt: new Date('2026-05-21T12:30:00.000Z'),
        category: 'ATTENDEE',
        person: { id: 'person-1', name: 'Ada' },
      },
      {
        personId: 'person-2',
        eventId: 'event-2',
        attendedAt: new Date('2026-05-22T12:30:00.000Z'),
        category: 'NON_SUBSCRIBER',
        person: { id: 'person-2', name: 'Linus' },
      },
    ]);

    await expect(resolver.majorEventUserAttendances('major-1')).resolves.toEqual([
      expect.objectContaining({
        personId: 'person-1',
        subscriptionId: 'subscription-1',
        subscriptionStatus: 'CONFIRMED',
        attendances: [
          expect.objectContaining({ eventId: 'event-1', attended: true, category: 'ATTENDEE' }),
          expect.objectContaining({ eventId: 'event-2', attended: false, category: 'UNKNOWN' }),
        ],
      }),
      expect.objectContaining({
        personId: 'person-2',
        subscriptionStatus: 'UNKNOWN',
        attendances: [
          expect.objectContaining({ eventId: 'event-1', attended: false }),
          expect.objectContaining({ eventId: 'event-2', attended: true, category: 'NON_SUBSCRIBER' }),
        ],
      }),
    ]);

    prisma.majorEvent.findFirst.mockResolvedValueOnce(null);
    await expect(resolver.majorEventUserAttendances('missing-major')).rejects.toBeInstanceOf(NotFoundException);

    prisma.majorEvent.findFirst.mockResolvedValueOnce({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValueOnce([]);
    await expect(resolver.majorEventUserAttendances('major-1')).resolves.toEqual([]);
  });

  it('returns one attendance or throws when it is missing', async () => {
    prisma.eventAttendance.findUnique.mockResolvedValue({ personId: 'person-1', eventId: 'event-1' });
    await expect(resolver.eventAttendance('person-1', 'event-1')).resolves.toEqual({
      personId: 'person-1',
      eventId: 'event-1',
    });

    prisma.eventAttendance.findUnique.mockResolvedValue(null);
    await expect(resolver.eventAttendance('person-1', 'event-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates, updates, and deletes attendances while refreshing categories', async () => {
    const tx = createTxMock();
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue({
      personId: 'person-1',
      eventId: 'event-1',
      createdById: 'collector-1',
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.createEventAttendance(
        {
          personId: 'person-1',
          eventId: 'event-1',
          attendedAt: new Date('2026-05-21T12:00:00.000Z'),
        },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual({
      personId: 'person-1',
      eventId: 'event-1',
      createdById: 'collector-1',
    });
    expect(tx.eventAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        }),
      }),
    );
    expect(attendanceCategories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx);

    prisma.$transaction.mockImplementationOnce(async (callback) =>
      callback({
        eventAttendance: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    );
    prisma.eventAttendance.findUnique.mockResolvedValue({
      personId: 'person-1',
      eventId: 'event-1',
      createdById: 'collector-2',
    });
    await expect(resolver.updateEventAttendance('person-1', 'event-1', { createdById: 'collector-2' })).resolves.toEqual({
      personId: 'person-1',
      eventId: 'event-1',
      createdById: 'collector-2',
    });

    prisma.$transaction.mockImplementationOnce(async (callback) =>
      callback({
        eventAttendance: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      }),
    );
    await expect(resolver.updateEventAttendance('person-1', 'missing-event', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.eventAttendance.deleteMany.mockResolvedValue({ count: 1 });
    await expect(resolver.deleteEventAttendance('person-1', 'event-1')).resolves.toEqual({
      deleted: true,
      personId: 'person-1',
      eventId: 'event-1',
    });
    prisma.eventAttendance.deleteMany.mockResolvedValue({ count: 0 });
    await expect(resolver.deleteEventAttendance('person-1', 'event-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates scanner and manual attendances with location metadata', async () => {
    const tx = createTxMock();
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue({
      personId: 'person-1',
      eventId: 'event-1',
      collectedLatitude: -22.1,
      collectedLongitude: -51.4,
      collectedAccuracyMeters: 12,
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    prisma.people.findFirst.mockResolvedValue({ id: 'person-1' });

    await expect(
      resolver.createEventAttendanceFromScannerCode(
        {
          eventId: 'event-1',
          code: 'user:user-1',
          location: {
            latitude: -22.1,
            longitude: -51.4,
            accuracyMeters: 12,
          },
        },
        { request: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ personId: 'person-1' }));

    expect(tx.eventAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByMethod: AttendanceCreationMethod.SCANNER,
          collectedLatitude: -22.1,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 12,
        }),
      }),
    );

    await expect(
      resolver.createEventAttendanceFromScannerCode({ eventId: 'event-1', code: 'bad-code' }, {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.people.findMany.mockResolvedValue([{ id: 'person-2', mergedIntoId: null }]);
    await expect(
      resolver.createEventAttendanceFromManualInput({ eventId: 'event-1', value: 'ada@example.com' }, {} as never),
    ).resolves.toEqual(expect.objectContaining({ eventId: 'event-1' }));

    prisma.people.findMany.mockResolvedValue([
      { id: 'person-1', mergedIntoId: null },
      { id: 'person-2', mergedIntoId: null },
    ]);
    await expect(
      resolver.createEventAttendanceFromManualInput({ eventId: 'event-1', value: 'duplicate@example.com' }, {} as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('imports CSV attendances by inferred email match type', async () => {
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.people.findMany.mockResolvedValue([
      {
        id: 'person-1',
        name: 'Ada',
        email: 'ada@example.com',
        secondaryEmails: [],
        identityDocument: null,
        academicId: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 'person-2',
        name: 'Grace',
        email: 'grace@example.com',
        secondaryEmails: [],
        identityDocument: null,
        academicId: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    prisma.eventAttendance.findMany.mockResolvedValue([{ personId: 'person-2' }]);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        eventAttendance: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    );

    await expect(
      resolver.importEventAttendancesFromCsv(
        {
          eventId: 'event-1',
          selectedHeader: 'email',
          csvContent: 'email\nada@example.com\ngrace@example.com\nmissing@example.com\nada@example.com',
        },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual({
      createdCount: 1,
      duplicateCount: 2,
      failedCount: 1,
      failedValues: ['missing@example.com'],
      inferredMatchType: AttendanceImportMatchType.EMAIL,
    });

    await expect(
      resolver.importEventAttendancesFromCsv(
        {
          eventId: 'event-1',
          selectedHeader: 'missing',
          csvContent: 'email\nada@example.com',
        },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
function createFullPrisma() {
  return {
    $transaction: jest.fn(),
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    majorEvent: {
      findFirst: jest.fn(),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    people: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
  };
}

function createTxMock() {
  return {
    eventAttendance: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
}
