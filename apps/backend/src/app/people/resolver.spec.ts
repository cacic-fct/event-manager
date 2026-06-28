import { ConflictException } from '@nestjs/common';
import { PeopleResolver } from './resolver';

describe('PeopleResolver', () => {
  it('lists event lecturer links as person linked data', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);

    prisma.eventLecturer.findMany.mockResolvedValue([
      {
        eventId: 'event-1',
        personId: 'person-1',
        createdAt: new Date('2026-06-20T12:00:00.000Z'),
        event: {
          id: 'event-1',
          name: 'Arquitetura Angular com Signals',
          startDate: new Date('2026-06-21T12:00:00.000Z'),
        },
      },
    ]);

    const summary = await resolver.personLinkedDataSummary('person-1');

    expect(summary.canDelete).toBe(false);
    expect(summary.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'EVENT_RELATION',
          items: [
            expect.objectContaining({
              id: 'event-1:person-1:lecturer',
              label: 'Arquitetura Angular com Signals',
              description: 'Ministrante',
              route: '/events/event-1',
            }),
          ],
        }),
      ]),
    );
  });

  it('blocks deleting people with linked app resources', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);

    prisma.eventAttendance.findMany.mockResolvedValue([
      {
        personId: 'person-1',
        eventId: 'event-1',
        attendedAt: new Date('2026-06-20T12:00:00.000Z'),
        category: 'REGULAR',
        event: {
          id: 'event-1',
          name: 'Arquitetura Angular com Signals',
          startDate: new Date('2026-06-21T12:00:00.000Z'),
        },
      },
    ]);

    await expect(resolver.deletePerson('person-1', {})).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.people.update).not.toHaveBeenCalled();
  });

  it('allows deleting people without linked app resources', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);

    await expect(resolver.deletePerson('person-1', {})).resolves.toEqual({
      deleted: true,
      id: 'person-1',
    });
    expect(prisma.people.update).toHaveBeenCalledWith({
      where: { id: 'person-1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

function createResolver(prisma: ReturnType<typeof createPrisma>): PeopleResolver {
  return new PeopleResolver(
    prisma as never,
    {
      isEnabled: jest.fn().mockReturnValue(false),
      deletePerson: jest.fn().mockResolvedValue(undefined),
      upsertPerson: jest.fn().mockResolvedValue(undefined),
    } as never,
    { refreshIssuedCertificatesForPerson: jest.fn() } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
  );
}

function createPrisma() {
  const prisma = {
    $transaction: jest.fn(),
    people: {
      findFirst: jest.fn().mockResolvedValue(person()),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(person({ deletedAt: new Date('2026-06-21T12:00:00.000Z') })),
    },
    certificate: { findMany: jest.fn().mockResolvedValue([]) },
    eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    eventGroupSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    majorEventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    eventAttendance: { findMany: jest.fn().mockResolvedValue([]) },
    eventLecturer: { findMany: jest.fn().mockResolvedValue([]) },
    eventAttendanceCollector: { findMany: jest.fn().mockResolvedValue([]) },
    offlineEventAttendanceSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    eventManagerPermissionGrant: { findMany: jest.fn().mockResolvedValue([]) },
    lecturerProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    mergeCandidate: { findMany: jest.fn().mockResolvedValue([]) },
    peopleMergeOperation: { findMany: jest.fn().mockResolvedValue([]) },
    majorEventReceipt: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return prisma;
}

function person(overrides: Partial<{ deletedAt: Date | null }> = {}) {
  return {
    id: 'person-1',
    name: 'Ana Clara',
    email: 'ana@example.com',
    secondaryEmails: [],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null,
    createdById: null,
    updatedById: null,
    user: null,
    mergedInto: null,
    ...overrides,
  };
}
