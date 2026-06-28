import { ConflictException } from '@nestjs/common';
import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
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

    prisma.eventLecturer.count.mockResolvedValue(1);

    const summary = await resolver.personLinkedDataSummary('person-1', userContext());
    const page = await resolver.personLinkedResources('person-1', 'EVENT_RELATION', 0, 10);

    expect(summary.canDelete).toBe(false);
    expect(summary.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'EVENT_RELATION',
          totalCount: 1,
          items: [],
        }),
      ]),
    );
    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'event-1:person-1:lecturer',
          label: 'Arquitetura Angular com Signals',
          description: 'Ministrante',
          route: '/events/event-1',
        }),
      ]),
    );
  });

  it('blocks deleting people with linked app resources', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);

    prisma.eventAttendance.findFirst.mockResolvedValue({
      personId: 'person-1',
    });
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
    expect(prisma.eventAttendance.findFirst).toHaveBeenCalledWith({
      where: { personId: 'person-1' },
      select: { personId: true },
    });
    expect(prisma.eventAttendance.findMany).not.toHaveBeenCalled();
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
    {
      evaluatePermissions: jest.fn().mockResolvedValue([Permission.Person.Delete]),
    } as never,
  );
}

function createPrisma() {
  const linkedModel = () => ({
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  });
  const prisma = {
    $transaction: jest.fn(),
    people: {
      findFirst: jest.fn().mockImplementation(({ where }: { where?: { id?: string } } = {}) =>
        where?.id === 'person-1' ? Promise.resolve(person()) : Promise.resolve(null),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(person({ deletedAt: new Date('2026-06-21T12:00:00.000Z') })),
    },
    certificate: linkedModel(),
    eventSubscription: linkedModel(),
    eventGroupSubscription: linkedModel(),
    majorEventSubscription: linkedModel(),
    eventAttendance: linkedModel(),
    eventLecturer: linkedModel(),
    eventAttendanceCollector: linkedModel(),
    offlineEventAttendanceSubmission: linkedModel(),
    eventManagerPermissionGrant: linkedModel(),
    lecturerProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    mergeCandidate: linkedModel(),
    peopleMergeOperation: linkedModel(),
    majorEventReceipt: linkedModel(),
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return prisma;
}

function userContext() {
  return {
    req: {
      user: {
        sub: 'admin',
        roleSet: new Set([EventManagerKeycloakRole.SuperAdmin]),
      },
    },
  };
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
