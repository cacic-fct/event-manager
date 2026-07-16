import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
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

  it('filters people by direct fields and SQL text search when Typesense is disabled', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);
    prisma.people.findMany.mockResolvedValueOnce([person()]);

    await expect(
      resolver.people(
        ' Ana ',
        'user-1',
        'ana@example.com',
        '555',
        '123',
        2,
        3,
      ),
    ).resolves.toEqual([person()]);

    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          userId: 'user-1',
          email: { equals: 'ana@example.com', mode: 'insensitive' },
          phone: { contains: '555', mode: 'insensitive' },
          identityDocument: '123',
          OR: [
            { name: { contains: 'Ana', mode: 'insensitive' } },
            { email: { contains: 'Ana', mode: 'insensitive' } },
            { phone: { contains: 'Ana', mode: 'insensitive' } },
            { identityDocument: { contains: 'Ana' } },
            { academicId: { contains: 'Ana' } },
          ],
        },
        skip: 2,
        take: 3,
      }),
    );
  });

  it('uses Typesense rank for people search pagination when no scoped filters are active', async () => {
    const prisma = createPrisma();
    const typesenseSearch = createTypesenseSearch();
    typesenseSearch.isEnabled.mockReturnValue(true);
    typesenseSearch.searchPeople.mockResolvedValue({
      available: true,
      ids: ['person-2', 'person-1', 'person-3'],
    });
    prisma.people.findMany.mockResolvedValueOnce([
      person({ id: 'person-3', name: 'Carlos' }),
      person({ id: 'person-1', name: 'Ana' }),
      person({ id: 'person-2', name: 'Bruno' }),
    ]);
    const resolver = createResolver(prisma, createAuthorizationPolicy(), { typesenseSearch });

    await expect(
      resolver.people('Ana', undefined, undefined, undefined, undefined, 1, 1),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'person-1',
      }),
    ]);

    expect(typesenseSearch.searchPeople).toHaveBeenCalledWith('Ana', 2);
    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['person-2', 'person-1', 'person-3'] },
        }),
        skip: 0,
        take: 3,
      }),
    );
  });

  it('returns an empty page without querying SQL when Typesense finds no people', async () => {
    const prisma = createPrisma();
    const typesenseSearch = createTypesenseSearch();
    typesenseSearch.isEnabled.mockReturnValue(true);
    typesenseSearch.searchPeople.mockResolvedValue({ available: true, ids: [] });
    const resolver = createResolver(prisma, createAuthorizationPolicy(), { typesenseSearch });

    await expect(resolver.people('nobody', undefined, undefined, undefined, undefined, 0, 10)).resolves.toEqual([]);

    expect(prisma.people.findMany).not.toHaveBeenCalled();
  });

  it('falls back to SQL text search when Typesense is unavailable', async () => {
    const prisma = createPrisma();
    const typesenseSearch = createTypesenseSearch();
    typesenseSearch.isEnabled.mockReturnValue(true);
    typesenseSearch.searchPeople.mockResolvedValue({ available: false, ids: [] });
    const resolver = createResolver(prisma, createAuthorizationPolicy(), { typesenseSearch });

    await resolver.people('Ana', undefined, undefined, undefined, undefined, 0, 10);

    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'Ana', mode: 'insensitive' } },
            { email: { contains: 'Ana', mode: 'insensitive' } },
            { phone: { contains: 'Ana', mode: 'insensitive' } },
            { identityDocument: { contains: 'Ana' } },
            { academicId: { contains: 'Ana' } },
          ],
        }),
      }),
    );
  });

  it('loads a single person or throws when it is missing', async () => {
    const resolver = createResolver(createPrisma());

    await expect(resolver.person('person-1')).resolves.toEqual(expect.objectContaining({ id: 'person-1' }));
    await expect(resolver.person('missing-person')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks linked-data summaries as non-deletable when delete permission is absent', async () => {
    const prisma = createPrisma();
    const authorizationPolicy = createAuthorizationPolicy();
    authorizationPolicy.evaluatePermissions.mockResolvedValueOnce([]);
    const resolver = createResolver(prisma, authorizationPolicy);
    prisma.people.findFirst.mockResolvedValueOnce({ id: 'person-1', userId: null, mergedIntoId: null });

    await expect(resolver.personLinkedDataSummary('person-1', userContext())).resolves.toEqual(
      expect.objectContaining({
        hasLinkedData: false,
        canDelete: false,
      }),
    );
  });

  it('creates people through a transaction and synchronizes audit and search documents', async () => {
    const prisma = createPrisma();
    const auditLog = createAuditLog();
    const typesenseSearch = createTypesenseSearch();
    const resolver = createResolver(prisma, createAuthorizationPolicy(), { auditLog, typesenseSearch });
    const created = person({
      id: 'created-person',
      email: 'ana@example.com',
      phone: '555',
      identityDocument: '123',
      academicId: 'RA123',
      userId: 'user-1',
    });
    prisma.people.create.mockResolvedValueOnce(created);
    prisma.people.findUniqueOrThrow.mockResolvedValueOnce(created);

    await expect(
      resolver.createPerson(
        {
          id: 'created-person',
          name: 'Ana Clara',
          email: 'ana@example.com',
          secondaryEmails: ['ana.alt@example.com'],
          phone: '555',
          identityDocument: '123',
          academicId: 'RA123',
          userId: 'user-1',
        },
        userContext(),
      ),
    ).resolves.toEqual(created);

    expect(prisma.people.create).toHaveBeenCalledWith({
      data: {
        id: 'created-person',
        name: 'Ana Clara',
        email: 'ana@example.com',
        secondaryEmails: ['ana.alt@example.com'],
        phone: '555',
        identityDocument: '123',
        academicId: 'RA123',
        userId: 'user-1',
      },
      include: { user: true, lecturerProfile: true },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'created-person',
        operation: 'CREATE',
        summary: 'Pessoa criada.',
      }),
      prisma,
    );
    expect(typesenseSearch.upsertPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'created-person',
        email: 'ana@example.com',
        identityDocument: '123',
      }),
    );
  });

  it('requires at least one identity field, allows namesakes, and rejects duplicate identifiers', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);

    await expect(resolver.createPerson({}, userContext())).rejects.toBeInstanceOf(UnprocessableEntityException);

    const created = person({ id: 'namesake-person' });
    prisma.people.create.mockResolvedValueOnce(created);
    prisma.people.findUniqueOrThrow.mockResolvedValueOnce(created);
    await expect(resolver.createPerson({ name: 'Ana Clara' }, userContext())).resolves.toEqual(created);

    prisma.people.findFirst.mockResolvedValueOnce({
      id: 'duplicate-person',
      name: 'Ana Clara',
      email: 'ana@example.com',
      identityDocument: null,
    });
    await expect(resolver.createPerson({ email: 'ana@example.com', name: 'Outra Ana' }, userContext())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows updating a person to a name already used by someone else', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);
    const updated = person({ name: 'Ana Clara' });
    prisma.people.findFirst.mockResolvedValueOnce(person({ name: 'Outra Ana' }));
    prisma.people.update.mockResolvedValueOnce(updated);
    prisma.people.findUniqueOrThrow.mockResolvedValueOnce(updated);

    await expect(resolver.updatePerson('person-1', { name: 'Ana Clara' }, userContext())).resolves.toEqual(updated);

    expect(prisma.people.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.people.update).toHaveBeenCalledWith({
      where: { id: 'person-1', deletedAt: null },
      data: { name: 'Ana Clara' },
      include: { user: true, lecturerProfile: true },
    });
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

  it('updates people and refreshes issued certificates when certificate identity changes', async () => {
    const prisma = createPrisma();
    const auditLog = createAuditLog();
    const certificateIssuingService = createCertificateIssuingService();
    const typesenseSearch = createTypesenseSearch();
    const resolver = createResolver(prisma, createAuthorizationPolicy(), {
      auditLog,
      certificateIssuingService,
      typesenseSearch,
    });
    const existing = person({ identityDocument: 'old-id' });
    const updated = person({ identityDocument: 'new-id' });
    prisma.people.findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
    prisma.people.update.mockResolvedValueOnce(updated);
    prisma.people.findUniqueOrThrow.mockResolvedValueOnce(updated);

    await expect(
      resolver.updatePerson('person-1', { identityDocument: 'new-id', phone: '555' }, requestContext()),
    ).resolves.toEqual(updated);

    expect(prisma.people.update).toHaveBeenCalledWith({
      where: { id: 'person-1', deletedAt: null },
      data: {
        phone: '555',
        identityDocument: 'new-id',
      },
      include: { user: true, lecturerProfile: true },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'UPDATE',
        actor: requestContext().request.user,
        before: existing,
        after: updated,
      }),
      prisma,
    );
    expect(typesenseSearch.upsertPerson).toHaveBeenCalledWith(expect.objectContaining({ identityDocument: 'new-id' }));
    expect(certificateIssuingService.refreshIssuedCertificatesForPerson).toHaveBeenCalledWith('person-1');
  });

  it('continues updates when certificate refresh fails after the person is saved', async () => {
    const prisma = createPrisma();
    const certificateIssuingService = createCertificateIssuingService();
    certificateIssuingService.refreshIssuedCertificatesForPerson.mockRejectedValueOnce(new Error('refresh failed'));
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const resolver = createResolver(prisma, createAuthorizationPolicy(), { certificateIssuingService });
    const updated = person({ name: 'Ana Atualizada' });
    prisma.people.findFirst.mockResolvedValueOnce(person()).mockResolvedValueOnce(null);
    prisma.people.update.mockResolvedValueOnce(updated);
    prisma.people.findUniqueOrThrow.mockResolvedValueOnce(updated);

    try {
      await expect(resolver.updatePerson('person-1', { name: 'Ana Atualizada' }, userContext())).resolves.toEqual(
        updated,
      );

      expect(loggerError).toHaveBeenCalledWith(
        'Failed to refresh certificates after admin update for person person-1.',
        expect.stringContaining('refresh failed'),
      );
    } finally {
      loggerError.mockRestore();
    }
  });

  it('rejects updates for missing people and externally managed field changes', async () => {
    const prisma = createPrisma();
    const resolver = createResolver(prisma);

    prisma.people.findFirst.mockResolvedValueOnce(null);
    await expect(resolver.updatePerson('missing-person', { name: 'Ana' }, userContext())).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.people.findFirst.mockResolvedValueOnce(person({ userId: 'user-1' }));
    await expect(
      resolver.updatePerson('person-1', { email: 'changed@example.com' }, userContext()),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
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

  it('throws when deleting a missing person', async () => {
    const prisma = createPrisma();
    const typesenseSearch = createTypesenseSearch();
    const resolver = createResolver(prisma, createAuthorizationPolicy(), { typesenseSearch });
    prisma.people.findFirst.mockResolvedValueOnce(null);

    await expect(resolver.deletePerson('missing-person', userContext())).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.people.update).not.toHaveBeenCalled();
    expect(typesenseSearch.deletePerson).not.toHaveBeenCalled();
  });

  it('allows deleting people without linked app resources', async () => {
    const prisma = createPrisma();
    const auditLog = createAuditLog();
    const typesenseSearch = createTypesenseSearch();
    const resolver = createResolver(prisma, createAuthorizationPolicy(), { auditLog, typesenseSearch });

    await expect(resolver.deletePerson('person-1', {})).resolves.toEqual({
      deleted: true,
      id: 'person-1',
    });
    expect(prisma.people.update).toHaveBeenCalledWith({
      where: { id: 'person-1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'person-1',
        operation: 'DELETE',
        summary: 'Pessoa excluída.',
        force: true,
      }),
      prisma,
    );
    expect(typesenseSearch.deletePerson).toHaveBeenCalledWith('person-1');
  });
});

function createResolver(
  prisma: ReturnType<typeof createPrisma>,
  authorizationPolicy = createAuthorizationPolicy(),
  dependencies: Partial<{
    auditLog: ReturnType<typeof createAuditLog>;
    certificateIssuingService: ReturnType<typeof createCertificateIssuingService>;
    typesenseSearch: ReturnType<typeof createTypesenseSearch>;
  }> = {},
): PeopleResolver {
  return new PeopleResolver(
    prisma as never,
    (dependencies.typesenseSearch ?? createTypesenseSearch()) as never,
    (dependencies.certificateIssuingService ?? createCertificateIssuingService()) as never,
    (dependencies.auditLog ?? createAuditLog()) as never,
    authorizationPolicy as never,
  );
}

function createTypesenseSearch() {
  return {
    isEnabled: jest.fn().mockReturnValue(false),
    searchPeople: jest.fn().mockResolvedValue({ available: false, ids: [] }),
    deletePerson: jest.fn().mockResolvedValue(undefined),
    upsertPerson: jest.fn().mockResolvedValue(undefined),
  };
}

function createCertificateIssuingService() {
  return {
    refreshIssuedCertificatesForPerson: jest.fn().mockResolvedValue(undefined),
  };
}

function createAuditLog() {
  return {
    record: jest.fn().mockResolvedValue(undefined),
  };
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
      findUniqueOrThrow: jest.fn().mockResolvedValue(person()),
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

function requestContext() {
  return {
    request: userContext().req,
  };
}

function person(overrides: Partial<{
  id: string;
  name: string;
  email: string | null;
  secondaryEmails: string[];
  phone: string | null;
  identityDocument: string | null;
  academicId: string | null;
  userId: string | null;
  mergedIntoId: string | null;
  externalRef: string | null;
  deletedAt: Date | null;
  createdById: string | null;
  updatedById: string | null;
  user: unknown;
  mergedInto: unknown;
}> = {}) {
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
