import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import { PeopleResolver } from './resolver';

describe('PeopleResolver', () => {
  it('filters people by active permission grants and lecturer profile presence', async () => {
    const prisma = createPrisma();
    const authorizationPolicy = createAuthorizationPolicy();
    const resolver = createResolver(prisma, authorizationPolicy);

    await resolver.people(undefined, undefined, undefined, undefined, undefined, 0, 10, 'ACTIVE', true, userContext());

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(userContext().req.user, [
      Permission.PermissionGrant.Read,
    ]);

    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          lecturerProfile: { isNot: null },
          AND: [
            {
              OR: [
                {
                  eventManagerPermissionGrants: {
                    some: expect.objectContaining({
                      deletedAt: null,
                      OR: [{ validFrom: null }, { validFrom: { lte: expect.any(Date) } }],
                      AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: expect.any(Date) } }] }],
                    }),
                  },
                },
                {
                  user: {
                    is: {
                      eventManagerPermissionGrants: {
                        some: expect.objectContaining({
                          deletedAt: null,
                          OR: [{ validFrom: null }, { validFrom: { lte: expect.any(Date) } }],
                          AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: expect.any(Date) } }] }],
                        }),
                      },
                    },
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('filters people by any non-deleted permission grants without active validity constraints', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);

    await resolver.people(undefined, undefined, undefined, undefined, undefined, 0, 10, 'ANY', false, userContext());

    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                {
                  eventManagerPermissionGrants: {
                    some: {
                      deletedAt: null,
                    },
                  },
                },
                {
                  user: {
                    is: {
                      eventManagerPermissionGrants: {
                        some: {
                          deletedAt: null,
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('rejects permission grant filters without permission-grant read permission', async () => {
    const prisma = createPrisma();
    const authorizationPolicy = createAuthorizationPolicy();
    authorizationPolicy.assertPermissions.mockRejectedValue(
      new ForbiddenException('Missing Event Manager permission grants.'),
    );
    const resolver = createResolver(prisma, authorizationPolicy);

    await expect(
      resolver.people(undefined, undefined, undefined, undefined, undefined, 0, 10, 'ANY', false, userContext()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.people.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid permission grant filters', async () => {
    const resolver = createResolver(createPrisma());

    await expect(
      resolver.people(undefined, undefined, undefined, undefined, undefined, 0, 10, 'INVALID', false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects merge-managed fields on person creation outside merge operations', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);

    await expect(
      resolver.createPerson(
        { name: 'Ana Clara', mergedIntoId: 'target-person', externalRef: 'external-1' },
        userContext(),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.people.create).not.toHaveBeenCalled();
  });

  it('rejects merge-managed fields on person updates outside merge operations', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);

    await expect(
      resolver.updatePerson(
        'person-1',
        { mergedIntoId: 'target-person', externalRef: 'external-1' },
        userContext(),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.people.update).not.toHaveBeenCalled();
  });

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

function createResolver(
  prisma: ReturnType<typeof createPrisma>,
  authorizationPolicy = createAuthorizationPolicy(),
): PeopleResolver {
  return new PeopleResolver(
    prisma as never,
    {
      isEnabled: jest.fn().mockReturnValue(false),
      deletePerson: jest.fn().mockResolvedValue(undefined),
      upsertPerson: jest.fn().mockResolvedValue(undefined),
    } as never,
    { refreshIssuedCertificatesForPerson: jest.fn() } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    authorizationPolicy as never,
  );
}

function createAuthorizationPolicy() {
  return {
    assertPermissions: jest.fn().mockResolvedValue(undefined),
    evaluatePermissions: jest.fn().mockResolvedValue([Permission.Person.Delete]),
  };
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
      create: jest.fn(),
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
