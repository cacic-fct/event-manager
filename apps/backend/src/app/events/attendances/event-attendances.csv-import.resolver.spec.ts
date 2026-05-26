import { AttendanceImportMatchType } from '@cacic-fct/shared-data-types';
import { BadRequestException } from '@nestjs/common';
import { EventAttendanceCsvImportResolver } from './event-attendances.csv-import.resolver';

describe('EventAttendanceCsvImportResolver', () => {
  let prisma: ReturnType<typeof createFullPrisma>;
  let attendanceCategories: { refreshForEventPersons: jest.Mock };
  let resolver: EventAttendanceCsvImportResolver;

  beforeEach(() => {
    prisma = createFullPrisma();
    attendanceCategories = { refreshForEventPersons: jest.fn().mockResolvedValue(undefined) };
    resolver = new EventAttendanceCsvImportResolver(prisma as never, attendanceCategories as never);
  });

  it('imports CSV attendances by inferred email match type', async () => {
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.people.findMany.mockResolvedValue([
      personMatch({ id: 'person-1', name: 'Ada', email: 'ada@example.com' }),
      personMatch({ id: 'person-2', name: 'Grace', email: 'grace@example.com' }),
    ]);
    prisma.eventAttendance.findMany.mockResolvedValue([{ personId: 'person-2' }]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback({ eventAttendance: { createMany } }));

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
    expect(attendanceCategories.refreshForEventPersons).toHaveBeenCalledWith(['event-1'], ['person-1'], expect.any(Object));

    await expect(
      resolver.importEventAttendancesFromCsv(
        { eventId: 'event-1', selectedHeader: 'missing', csvContent: 'email\nada@example.com' },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function personMatch(input: { id: string; name: string; email: string }) {
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    secondaryEmails: [],
    identityDocument: null,
    academicId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

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
