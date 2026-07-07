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
      ambiguousValues: [],
    });
    expect(attendanceCategories.refreshForEventPersons).toHaveBeenCalledWith(['event-1'], ['person-1'], expect.any(Object));

    await expect(
      resolver.importEventAttendancesFromCsv(
        { eventId: 'event-1', selectedHeader: 'missing', csvContent: 'email\nada@example.com' },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('imports inferred document-like values by phone when no document match claims the same digits', async () => {
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.people.findMany.mockResolvedValue([
      personMatch({ id: 'person-1', name: 'Ada', phone: '+55 (11) 99999-9975' }),
    ]);
    prisma.eventAttendance.findMany.mockResolvedValue([]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback({ eventAttendance: { createMany } }));

    await expect(
      resolver.importEventAttendancesFromCsv(
        {
          eventId: 'event-1',
          selectedHeader: 'identifier',
          csvContent: 'identifier\n11999999975',
        },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual({
      createdCount: 1,
      duplicateCount: 0,
      failedCount: 0,
      failedValues: [],
      inferredMatchType: AttendanceImportMatchType.IDENTITY_DOCUMENT,
      ambiguousValues: [],
    });

    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { identityDocument: '11999999975' },
            {
              phone: {
                in: expect.arrayContaining(['11999999975', '5511999999975', '+5511999999975']),
              },
            },
          ]),
        }),
        select: expect.objectContaining({ phone: true }),
      }),
    );
    expect(attendanceCategories.refreshForEventPersons).toHaveBeenCalledWith(['event-1'], ['person-1'], expect.any(Object));
  });

  it('returns ambiguous inferred document-like values when CPF and phone aliases match different people', async () => {
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.people.findMany.mockResolvedValue([
      personMatch({ id: 'document-person', name: 'Ada', identityDocument: '11999999975' }),
      personMatch({ id: 'phone-person', name: 'Grace', phone: '+5511999999975' }),
    ]);

    const result = await resolver.importEventAttendancesFromCsv(
      {
        eventId: 'event-1',
        selectedHeader: 'identifier',
        csvContent: 'identifier\n11999999975',
      },
      {} as never,
    );

    expect(result).toEqual({
      createdCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      failedValues: [],
      inferredMatchType: AttendanceImportMatchType.IDENTITY_DOCUMENT,
      ambiguousValues: [
        {
          value: '11999999975',
          candidates: [
            { id: 'document-person', name: 'Ada' },
            { id: 'phone-person', name: 'Grace' },
          ],
        },
      ],
    });
    expect(result.ambiguousValues[0].candidates[0]).not.toHaveProperty('email');
    expect(result.ambiguousValues[0].candidates[0]).not.toHaveProperty('phone');
    expect(result.ambiguousValues[0].candidates[0]).not.toHaveProperty('identityDocument');
    expect(result.ambiguousValues[0].candidates[0]).not.toHaveProperty('academicId');
    expect(prisma.eventAttendance.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('imports resolved ambiguous document-like values with the selected person', async () => {
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.people.findMany.mockResolvedValue([
      personMatch({ id: 'document-person', name: 'Ada', identityDocument: '11999999975' }),
      personMatch({ id: 'phone-person', name: 'Grace', phone: '+5511999999975' }),
    ]);
    prisma.eventAttendance.findMany.mockResolvedValue([]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback({ eventAttendance: { createMany } }));

    await expect(
      resolver.importEventAttendancesFromCsv(
        {
          eventId: 'event-1',
          selectedHeader: 'identifier',
          csvContent: 'identifier\n11999999975',
          resolutions: [{ value: '11999999975', personId: 'phone-person' }],
        },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual({
      createdCount: 1,
      duplicateCount: 0,
      failedCount: 0,
      failedValues: [],
      inferredMatchType: AttendanceImportMatchType.IDENTITY_DOCUMENT,
      ambiguousValues: [],
    });
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ personId: 'phone-person' })],
      }),
    );
  });
});

function personMatch(input: {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  identityDocument?: string | null;
}) {
  return {
    id: input.id,
    name: input.name,
    email: input.email ?? null,
    secondaryEmails: [],
    phone: input.phone ?? null,
    identityDocument: input.identityDocument ?? null,
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
