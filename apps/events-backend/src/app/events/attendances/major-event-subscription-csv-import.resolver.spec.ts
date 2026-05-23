import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MajorEventSubscriptionCsvImportInput } from '@cacic-fct/shared-data-types';
import { MajorEventSubscriptionCsvImportResolver } from './major-event-subscription-csv-import.resolver';

describe('MajorEventSubscriptionCsvImportResolver', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let attendanceCategories: { refreshForMajorEventPerson: jest.Mock };
  let resolver: MajorEventSubscriptionCsvImportResolver;

  beforeEach(() => {
    prisma = createPrisma();
    attendanceCategories = { refreshForMajorEventPerson: jest.fn().mockResolvedValue(undefined) };
    resolver = new MajorEventSubscriptionCsvImportResolver(prisma as never, attendanceCategories as never);
  });

  it('creates people, subscriptions, and event subscriptions from mapped CSV rows', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);

    const tx = createTx();
    tx.people.findFirst.mockResolvedValue(null);
    tx.people.create.mockResolvedValue(personMatch('person-1'));
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.importMajorEventSubscriptionsFromCsv(
        {
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          csvContent: 'email,name,events\nada@example.com,Ada Lovelace,"event-1,event-2"',
          columnMapping: {
            emailHeader: 'email',
            fullNameHeader: 'name',
            enrollmentNumberHeader: null,
            identityDocumentHeader: null,
            subscribedEventIdsHeader: 'events',
          },
        },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual({
      createdSubscriptionCount: 1,
      updatedSubscriptionCount: 0,
      duplicateCount: 0,
      createdPeopleCount: 1,
      failedCount: 0,
      createdPeople: [personMatch('person-1')],
      failedRows: [],
    });

    expect(tx.people.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          createdById: 'collector-1',
        }),
      }),
    );
    expect(tx.majorEventSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          majorEventId: 'major-1',
          personId: 'person-1',
          subscriptionStatus: 'CONFIRMED',
        }),
      }),
    );
    expect(tx.eventSubscription.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ eventId: 'event-1', personId: 'person-1' }),
        expect.objectContaining({ eventId: 'event-2', personId: 'person-1' }),
      ],
    });
    expect(attendanceCategories.refreshForMajorEventPerson).toHaveBeenCalledWith('major-1', 'person-1', tx);
  });

  it('reports invalid rows and validates major event and mapping inputs', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue(null);
    await expect(
      resolver.importMajorEventSubscriptionsFromCsv(
        {
          majorEventId: 'missing-major',
          subscriptionStatus: 'CONFIRMED',
          csvContent: 'email,events\nada@example.com,event-1',
          columnMapping: {
            emailHeader: 'email',
            fullNameHeader: null,
            enrollmentNumberHeader: null,
            identityDocumentHeader: null,
            subscribedEventIdsHeader: 'events',
          },
        },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    await expect(
      resolver.importMajorEventSubscriptionsFromCsv(
        {
          majorEventId: 'major-1',
          subscriptionStatus: 'NOT_A_STATUS',
          csvContent: 'email,events\nada@example.com,event-1',
          columnMapping: {
            emailHeader: 'email',
            fullNameHeader: null,
            enrollmentNumberHeader: null,
            identityDocumentHeader: null,
            subscribedEventIdsHeader: 'events',
          },
        } as unknown as MajorEventSubscriptionCsvImportInput,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createPrisma() {
  return {
    $transaction: jest.fn(),
    majorEvent: {
      findFirst: jest.fn(),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    people: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
}

function createTx() {
  return {
    people: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    majorEventSubscription: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
}

function personMatch(id: string) {
  return {
    id,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    secondaryEmails: [],
    identityDocument: null,
    academicId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}
