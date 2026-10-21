import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MajorEventSubscriptionCsvImportInput } from '@cacic-fct/shared-data-types';
import { REQUIRED_PERMISSIONS_KEY } from '../../auth/auth.constants';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { MajorEventSubscriptionCsvImportResolver } from './major-event-subscription-csv-import.resolver';
const { jest } = import.meta;

describe('MajorEventSubscriptionCsvImportResolver', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let attendanceCategories: { refreshForMajorEventPerson: jest.Mock };
  let auditLog: { record: jest.Mock };
  let resolver: MajorEventSubscriptionCsvImportResolver;

  beforeEach(() => {
    prisma = createPrisma();
    attendanceCategories = { refreshForMajorEventPerson: jest.fn().mockResolvedValue(undefined) };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    resolver = new MajorEventSubscriptionCsvImportResolver(
      prisma as never,
      attendanceCategories as never,
      undefined,
      auditLog as never,
    );
  });

  it('applies and persists the selected import tier when tier rules are enabled', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);
    const tx = createTx();
    tx.people.findFirst.mockResolvedValue(personMatch('person-1'));
    tx.majorEvent.findFirst.mockResolvedValue({
      majorEventPrices: [
        {
          tiers: [
            {
              name: 'Aluno',
              restrictEventSelection: true,
              allowedEventIds: ['event-1'],
            },
          ],
        },
      ],
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    await resolver.importMajorEventSubscriptionsFromCsv(
      {
        majorEventId: 'major-1',
        subscriptionStatus: 'CONFIRMED',
        paymentTier: ' aluno ',
        csvContent: 'email,events\nada@example.com,event-1',
        columnMapping: { emailHeader: 'email', subscribedEventIdsHeader: 'events' },
      } as MajorEventSubscriptionCsvImportInput,
      { req: { user: { sub: 'admin-1' } } } as never,
    );
    expect(tx.majorEventSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentTier: 'Aluno' }),
      }),
    );
    expect(tx.majorEventSubscriptionEventSelection.createMany).toHaveBeenCalledWith({
      data: [{ subscriptionId: 'subscription-1', eventId: 'event-1', createdById: 'admin-1' }],
    });
  });

  it('reports missing-tier rows without creating subscriptions', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);
    const tx = createTx();
    tx.people.findFirst.mockResolvedValue(personMatch('person-1'));
    tx.majorEvent.findFirst.mockResolvedValue({
      majorEventPrices: [
        {
          tiers: [
            {
              name: 'Aluno',
              restrictEventSelection: true,
              allowedEventIds: ['event-1'],
            },
          ],
        },
      ],
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    await expect(
      resolver.importMajorEventSubscriptionsFromCsv(
        {
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          csvContent: 'email,events\nada@example.com,event-1',
          columnMapping: { emailHeader: 'email', subscribedEventIdsHeader: 'events' },
        } as MajorEventSubscriptionCsvImportInput,
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        failedCount: 1,
        failedRows: [expect.stringContaining('política de inscrição válida')],
      }),
    );
    expect(tx.majorEventSubscription.create).not.toHaveBeenCalled();
    expect(tx.eventSubscription.createMany).not.toHaveBeenCalled();
  });

  it('preserves the existing tier during an import without an explicit tier', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);
    const tx = createTx();
    tx.people.findFirst.mockResolvedValue(personMatch('person-1'));
    tx.majorEventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1', paymentTier: 'Aluno' });
    tx.majorEvent.findFirst.mockResolvedValue({
      majorEventPrices: [
        {
          tiers: [
            {
              name: 'Aluno',
              restrictEventSelection: true,
              allowedEventIds: ['event-1'],
            },
          ],
        },
      ],
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    await resolver.importMajorEventSubscriptionsFromCsv(
      {
        majorEventId: 'major-1',
        subscriptionStatus: 'CONFIRMED',
        csvContent: 'email,events\nada@example.com,event-1',
        columnMapping: { emailHeader: 'email', subscribedEventIdsHeader: 'events' },
      } as MajorEventSubscriptionCsvImportInput,
      { req: { user: { sub: 'admin-1' } } } as never,
    );
    expect(tx.majorEventSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { subscriptionStatus: 'CONFIRMED', paymentTier: 'Aluno' },
      }),
    );
  });

  it('keeps valid people in a CSV import when another selection is disallowed', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);
    const tx = createTx();
    tx.people.findFirst.mockResolvedValueOnce(personMatch('person-1')).mockResolvedValueOnce(personMatch('person-2'));
    tx.majorEvent.findFirst.mockResolvedValue({
      majorEventPrices: [
        {
          tiers: [
            {
              name: 'Aluno',
              restrictEventSelection: true,
              allowedEventIds: ['event-1'],
            },
          ],
        },
      ],
    });
    tx.event.findMany.mockResolvedValue([
      { id: 'event-1', type: 'MINICURSO', eventGroupId: null },
      { id: 'event-2', type: 'MINICURSO', eventGroupId: null },
    ]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    await expect(
      resolver.importMajorEventSubscriptionsFromCsv(
        {
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          paymentTier: 'Aluno',
          csvContent: 'email,events\nada@example.com,event-1\ngrace@example.com,event-2',
          columnMapping: { emailHeader: 'email', subscribedEventIdsHeader: 'events' },
        } as MajorEventSubscriptionCsvImportInput,
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        createdSubscriptionCount: 1,
        failedCount: 1,
        failedRows: [expect.stringContaining('Linha 3:')],
      }),
    );
    expect(tx.majorEventSubscription.create).toHaveBeenCalledTimes(1);
  });

  it('does not retain a newly imported person when combined rows exceed the tier quota', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);
    const tx = createTx();
    tx.people.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(personMatch('new-person'));
    tx.people.create.mockResolvedValue(personMatch('new-person'));
    tx.majorEvent.findFirst.mockResolvedValue({
      majorEventPrices: [
        {
          tiers: [
            {
              name: 'Aluno',
              customizeSubscriptionLimits: true,
              maxCoursesPerAttendee: 1,
            },
          ],
        },
      ],
    });
    tx.event.findMany.mockResolvedValue([
      { id: 'event-1', type: 'MINICURSO', eventGroupId: null },
      { id: 'event-2', type: 'MINICURSO', eventGroupId: null },
    ]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    await expect(
      resolver.importMajorEventSubscriptionsFromCsv(
        {
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          paymentTier: 'Aluno',
          csvContent: 'email,events\nada@example.com,event-1\nada@example.com,event-2',
          columnMapping: { emailHeader: 'email', subscribedEventIdsHeader: 'events' },
        } as MajorEventSubscriptionCsvImportInput,
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        createdSubscriptionCount: 0,
        createdPeopleCount: 0,
        createdPeople: [],
        failedCount: 2,
      }),
    );
    expect(tx.people.delete).toHaveBeenCalledWith({ where: { id: 'new-person' } });
    expect(tx.majorEventSubscription.create).not.toHaveBeenCalled();
  });

  it('validates grouped event selections after combining rows for a new person', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);
    const tx = createTx();
    tx.people.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(personMatch('new-person'));
    tx.people.create.mockResolvedValue(personMatch('new-person'));
    tx.majorEvent.findFirst.mockResolvedValue({
      majorEventPrices: [
        {
          tiers: [
            {
              name: 'Aluno',
              restrictEventSelection: true,
              allowedEventIds: ['event-1', 'event-2'],
            },
          ],
        },
      ],
    });
    tx.event.findMany.mockResolvedValue([
      { id: 'event-1', type: 'MINICURSO', eventGroupId: 'group-1' },
      { id: 'event-2', type: 'MINICURSO', eventGroupId: 'group-1' },
    ]);
    tx.eventSubscription.createMany.mockResolvedValue({ count: 2 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.importMajorEventSubscriptionsFromCsv(
        {
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          paymentTier: 'Aluno',
          csvContent: 'email,events\nada@example.com,event-1\nada@example.com,event-2',
          columnMapping: { emailHeader: 'email', subscribedEventIdsHeader: 'events' },
        } as MajorEventSubscriptionCsvImportInput,
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        createdPeopleCount: 1,
        createdSubscriptionCount: 1,
        failedCount: 0,
        failedRows: [],
      }),
    );

    expect(tx.people.create).toHaveBeenCalledTimes(1);
    expect(tx.people.delete).not.toHaveBeenCalled();
    expect(tx.eventSubscription.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ eventId: 'event-1', personId: 'new-person' }),
        expect.objectContaining({ eventId: 'event-2', personId: 'new-person' }),
      ],
    });
  });

  it('requires subscription import permission for CSV subscription imports', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        MajorEventSubscriptionCsvImportResolver.prototype.importMajorEventSubscriptionsFromCsv,
      ),
    ).toEqual(['subscription#import']);
  });

  it('creates people, subscriptions, and event subscriptions from mapped CSV rows', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);

    const tx = createTx();
    tx.people.findFirst.mockResolvedValue(null);
    tx.people.create.mockResolvedValue(personMatch('person-1'));
    tx.eventSubscription.createMany.mockResolvedValue({ count: 2 });
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
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.SYSTEM,
        entityId: 'major-event-subscription-import:major-1',
        operation: AuditLogOperation.IMPORT,
        metadata: expect.objectContaining({
          resourceType: 'MAJOR_EVENT_SUBSCRIPTION_CSV_IMPORT',
          importedRows: 1,
          createdPeopleCount: 1,
          createdSubscriptionCount: 1,
          updatedSubscriptionCount: 0,
          changedSubscriptionCount: 0,
          createdEventSubscriptionCount: 2,
          archivedEventSubscriptionCount: 0,
          duplicateCount: 0,
          failedCount: 0,
        }),
      }),
      tx,
    );
  });

  it('does not audit an import when every row is rejected before persistence', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);
    const tx = createTx();
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.importMajorEventSubscriptionsFromCsv(
        {
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          csvContent: 'email,events\n,event-1',
          columnMapping: {
            emailHeader: 'email',
            subscribedEventIdsHeader: 'events',
          },
        },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ failedCount: 1 }));

    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('does not audit a no-op import when subscriptions and event links already match', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);
    const tx = createTx();
    tx.people.findFirst.mockResolvedValue(personMatch('person-1'));
    tx.majorEventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1', subscriptionStatus: 'CONFIRMED' });
    tx.eventSubscription.findMany.mockResolvedValue([{ eventId: 'event-1' }]);
    tx.majorEventSubscriptionEventSelection.findMany.mockResolvedValue([{ eventId: 'event-1' }]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.importMajorEventSubscriptionsFromCsv(
        {
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          csvContent: 'email,events\nada@example.com,event-1',
          columnMapping: {
            emailHeader: 'email',
            subscribedEventIdsHeader: 'events',
          },
        },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ updatedSubscriptionCount: 1, duplicateCount: 1 }));

    expect(tx.majorEventSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: 'subscription-1', subscriptionStatus: { not: 'CONFIRMED' } },
      data: { subscriptionStatus: 'CONFIRMED' },
    });
    expect(auditLog.record).not.toHaveBeenCalled();
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
      delete: jest.fn(),
    },
  };
}

function createTx() {
  return {
    majorEvent: { findFirst: jest.fn().mockResolvedValue({ majorEventPrices: [] } as unknown) },
    event: { findMany: jest.fn().mockResolvedValue([{ id: 'event-1', type: 'MINICURSO', eventGroupId: null }]) },
    people: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    majorEventSubscription: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    majorEventSubscriptionEventSelection: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
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
