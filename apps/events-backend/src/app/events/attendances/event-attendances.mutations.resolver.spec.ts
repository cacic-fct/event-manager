import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod } from '@prisma/client';
import { EventAttendancesMutationsResolver } from './event-attendances.mutations.resolver';

describe('EventAttendancesMutationsResolver', () => {
  let prisma: ReturnType<typeof createFullPrisma>;
  let attendanceCategories: { refreshForAttendance: jest.Mock };
  let resolver: EventAttendancesMutationsResolver;

  beforeEach(() => {
    prisma = createFullPrisma();
    attendanceCategories = { refreshForAttendance: jest.fn().mockResolvedValue(undefined) };
    resolver = new EventAttendancesMutationsResolver(prisma as never, attendanceCategories as never);
  });

  it('creates, updates, and deletes attendances while refreshing categories', async () => {
    const tx = createTxMock();
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue({ personId: 'person-1', eventId: 'event-1', createdById: 'collector-1' });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.createEventAttendance(
        { personId: 'person-1', eventId: 'event-1', attendedAt: new Date('2026-05-21T12:00:00.000Z') },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual({ personId: 'person-1', eventId: 'event-1', createdById: 'collector-1' });
    expect(tx.eventAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdByMethod: AttendanceCreationMethod.MANUAL_INPUT }) }),
    );
    expect(attendanceCategories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx);

    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementationOnce(async (callback) => callback({ eventAttendance: { updateMany } }));
    prisma.eventAttendance.findUnique.mockResolvedValue({ personId: 'person-1', eventId: 'event-1', createdById: 'collector-2' });
    const attendedAt = new Date('2026-05-21T13:00:00.000Z');
    await expect(resolver.updateEventAttendance('person-1', 'event-1', { attendedAt })).resolves.toEqual({
      personId: 'person-1',
      eventId: 'event-1',
      createdById: 'collector-2',
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          attendedAt,
        },
      }),
    );

    prisma.$transaction.mockImplementationOnce(async (callback) => callback({ eventAttendance: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } }));
    await expect(resolver.updateEventAttendance('person-1', 'missing-event', {})).rejects.toBeInstanceOf(NotFoundException);

    prisma.eventAttendance.deleteMany.mockResolvedValue({ count: 1 });
    await expect(resolver.deleteEventAttendance('person-1', 'event-1')).resolves.toEqual({ deleted: true, personId: 'person-1', eventId: 'event-1' });
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
        { eventId: 'event-1', code: 'user:user-1', location: { latitude: -22.1, longitude: -51.4, accuracyMeters: 12 } },
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

    await expect(resolver.createEventAttendanceFromScannerCode({ eventId: 'event-1', code: 'bad-code' }, {} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.people.findMany.mockResolvedValue([{ id: 'person-2', mergedIntoId: null }]);
    await expect(resolver.createEventAttendanceFromManualInput({ eventId: 'event-1', value: 'ada@example.com' }, {} as never)).resolves.toEqual(
      expect.objectContaining({ eventId: 'event-1' }),
    );

    prisma.people.findMany.mockResolvedValue([
      { id: 'person-1', mergedIntoId: null },
      { id: 'person-2', mergedIntoId: null },
    ]);
    await expect(resolver.createEventAttendanceFromManualInput({ eventId: 'event-1', value: 'duplicate@example.com' }, {} as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
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
    eventSubscription: {
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
