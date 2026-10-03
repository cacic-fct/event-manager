import { ForbiddenException } from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountMergeService } from '../account-merge/account-merge.service';
import { AuthenticatedUserSyncService } from '../auth/authenticated-user-sync.service';
import { CertificateIssuingService } from '../certificate/certificate-issuing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserContextService } from './context.service';
import { PersonRecord, UserRecord } from './selects';

type PrismaMock = {
  accountUserMerge: { findMany: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  people: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  ticketTransfer: { updateMany: jest.Mock };
  ticketNotificationOutbox: { updateMany: jest.Mock };
  ticketRealtimeOutbox: { updateMany: jest.Mock };
  ticketTransferAuthorCooldown: {
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

describe('CurrentUserContextService', () => {
  let prisma: PrismaMock;
  let certificateIssuingService: {
    refreshIssuedCertificatesForPerson: jest.Mock;
  };
  let accountMergeService: {
    resolveFinalUserId: jest.Mock;
  };
  let service: CurrentUserContextService;

  beforeEach(() => {
    prisma = {
      accountUserMerge: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      people: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      ticketTransfer: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      ticketNotificationOutbox: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      ticketRealtimeOutbox: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      ticketTransferAuthorCooldown: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    certificateIssuingService = {
      refreshIssuedCertificatesForPerson: jest.fn().mockResolvedValue([]),
    };
    accountMergeService = {
      resolveFinalUserId: jest.fn().mockResolvedValue(null),
    };

    service = new CurrentUserContextService(
      prisma as unknown as PrismaService,
      certificateIssuingService as unknown as CertificateIssuingService,
      accountMergeService as unknown as AccountMergeService,
      new AuthenticatedUserSyncService(prisma as unknown as PrismaService),
    );
  });

  it('defers the circular account merge dependency token', () => {
    const dependencies = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, CurrentUserContextService) as Array<{
      index: number;
      param: unknown;
    }>;

    expect(dependencies).toContainEqual({
      index: 2,
      param: expect.objectContaining({ forwardRef: expect.any(Function) }),
    });
  });

  it.each([false, 'false', undefined])(
    'rejects non-onboarded current users before resolving a local person context for claim %p',
    async (isOnboarded) => {
      const authenticatedUser = createAuthenticatedUser({
        claims: {
          is_onboarded: isOnboarded,
        },
      });

      await expect(service.resolveCurrentUserContext(authenticatedUser, true)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.people.create).not.toHaveBeenCalled();
    },
  );

  it('allows internal profile sync to resolve a non-onboarded account update', async () => {
    const user = createUserRecord();
    const createdPerson = createPersonRecord({
      userId: user.id,
      user,
    });

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.people.findMany.mockResolvedValue([]);
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.people.create.mockResolvedValue(createdPerson);

    const result = await service.syncProfileUpdate({
      userId: 'keycloak-sub',
      email: 'student@example.edu',
      fullname: 'Student Name',
      identityDocument: '123.456.789-00',
      academicId: '20240001',
      isOnboarded: false,
    });

    expect(result).toEqual({
      user,
      person: createdPerson,
    });
    expect(prisma.people.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'keycloak-sub',
          identityDocument: '123.456.789-00',
          academicId: '20240001',
        }),
      }),
    );
  });

  it('refreshes last login when returning an existing matched user', async () => {
    const authenticatedUser = createAuthenticatedUser();
    const staleUser = createUserRecord({
      lastLoginAt: new Date('2024-06-23T12:00:00.000Z'),
    });
    const refreshedUser = createUserRecord({
      lastLoginAt: new Date('2026-06-23T12:00:00.000Z'),
    });
    const linkedPerson = createPersonRecord({
      userId: refreshedUser.id,
      user: refreshedUser,
    });

    prisma.user.findUnique.mockResolvedValue(staleUser);
    prisma.user.update.mockResolvedValue(refreshedUser);
    prisma.people.findMany.mockResolvedValue([linkedPerson]);

    const result = await service.resolveCurrentUserContext(authenticatedUser, true);

    expect(result.user).toEqual(refreshedUser);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: {
        id: 'keycloak-sub',
      },
      data: expect.objectContaining({
        lastLoginAt: expect.any(Date),
      }),
      select: expect.objectContaining({
        lastLoginAt: true,
      }),
    });
  });

  it('matches an existing person by email before creating a new person', async () => {
    const authenticatedUser = createAuthenticatedUser();
    const user = createUserRecord();
    const person = createPersonRecord({
      id: 'person-email',
      email: 'student@example.edu',
      userId: null,
    });
    const updatedPerson = createPersonRecord({
      ...person,
      phone: '+5511999999999',
      identityDocument: '123.456.789-00',
      academicId: '20240001',
      userId: user.id,
      externalRef: 'kc:keycloak-sub',
      user,
    });

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.people.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([person]);
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.people.update.mockResolvedValue(updatedPerson);

    const result = await service.resolveCurrentUserContext(authenticatedUser, true);

    expect(result).toEqual({
      user,
      person: updatedPerson,
    });
    expect(prisma.people.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'person-email',
        },
        data: expect.objectContaining({
          phone: '+5511999999999',
          identityDocument: '123.456.789-00',
          academicId: '20240001',
          userId: 'keycloak-sub',
          externalRef: 'kc:keycloak-sub',
        }),
      }),
    );
    expect(certificateIssuingService.refreshIssuedCertificatesForPerson).toHaveBeenCalledWith(
      'person-email',
      'keycloak-sub',
    );
    expect(prisma.people.create).not.toHaveBeenCalled();
  });

  it('falls back to identity document when no email match exists', async () => {
    const authenticatedUser = createAuthenticatedUser({
      email: 'other@example.edu',
    });
    const user = createUserRecord({
      email: 'other@example.edu',
    });
    const person = createPersonRecord({
      id: 'person-document',
      email: null,
      identityDocument: '12345678900',
      userId: null,
    });
    const updatedPerson = createPersonRecord({
      ...person,
      email: 'other@example.edu',
      phone: '+5511999999999',
      academicId: '20240001',
      userId: user.id,
      externalRef: 'kc:keycloak-sub',
      user,
    });

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.people.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([person]);
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.people.update.mockResolvedValue(updatedPerson);

    const result = await service.resolveCurrentUserContext(authenticatedUser, true);

    expect(result.person).toEqual(updatedPerson);
    expect(prisma.people.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          identityDocument: {
            in: ['123.456.789-00', '12345678900'],
          },
        }),
      }),
    );
    expect(prisma.people.create).not.toHaveBeenCalled();
  });

  it('does not refresh certificates when the matched person already has an identity document', async () => {
    const authenticatedUser = createAuthenticatedUser();
    const user = createUserRecord();
    const person = createPersonRecord({
      id: 'person-with-document',
      email: 'student@example.edu',
      identityDocument: '123.456.789-00',
      userId: null,
    });
    const updatedPerson = createPersonRecord({
      ...person,
      phone: '+5511999999999',
      academicId: '20240001',
      userId: user.id,
      externalRef: 'kc:keycloak-sub',
      user,
    });

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.people.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([person]);
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.people.update.mockResolvedValue(updatedPerson);

    const result = await service.resolveCurrentUserContext(authenticatedUser, true);

    expect(result.person).toEqual(updatedPerson);
    expect(certificateIssuingService.refreshIssuedCertificatesForPerson).not.toHaveBeenCalled();
  });

  it('refreshes certificates when the matched person name changes', async () => {
    const authenticatedUser = createAuthenticatedUser({
      claims: {
        name: 'Student Name',
        set_fullname: 'Updated Student Name',
        phone: '+5511999999999',
        identity_document: '987.654.321-00',
        enrollment_number: '20240001',
      },
    });
    const user = createUserRecord();
    const person = createPersonRecord({
      id: 'person-name-change',
      name: 'Old Student Name',
      email: 'student@example.edu',
      identityDocument: '123.456.789-00',
      userId: null,
    });
    const updatedPerson = createPersonRecord({
      ...person,
      name: 'Updated Student Name',
      phone: '+5511999999999',
      academicId: '20240001',
      userId: user.id,
      externalRef: 'kc:keycloak-sub',
      user,
    });

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.people.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([person]);
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.people.update.mockResolvedValue(updatedPerson);

    await service.resolveCurrentUserContext(authenticatedUser, true);

    expect(prisma.people.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          identityDocument: expect.anything(),
        }),
      }),
    );
    expect(certificateIssuingService.refreshIssuedCertificatesForPerson).toHaveBeenCalledWith(
      'person-name-change',
      'keycloak-sub',
    );
  });

  it('creates a new person with inferred Keycloak profile data when no match exists', async () => {
    const authenticatedUser = createAuthenticatedUser();
    const user = createUserRecord();
    const createdPerson = createPersonRecord({
      email: 'student@example.edu',
      phone: '+5511999999999',
      identityDocument: '123.456.789-00',
      academicId: '20240001',
      userId: user.id,
      externalRef: 'kc:keycloak-sub',
      user,
    });

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.people.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.people.create.mockResolvedValue(createdPerson);

    const result = await service.resolveCurrentUserContext(authenticatedUser, true);

    expect(result.person).toEqual(createdPerson);
    expect(prisma.people.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Student Name',
          email: 'student@example.edu',
          phone: '+5511999999999',
          identityDocument: '123.456.789-00',
          academicId: '20240001',
          userId: 'keycloak-sub',
          externalRef: 'kc:keycloak-sub',
        },
      }),
    );
  });

  it('reconciles ticket account references after the survivor User is created on first login', async () => {
    const authenticatedUser = createAuthenticatedUser({ sub: 'new-user' });
    const user = createUserRecord({ id: 'new-user' });
    const person = createPersonRecord({ id: 'survivor-person', userId: user.id, user });
    const lastSubmittedAt = new Date();

    accountMergeService.resolveFinalUserId.mockResolvedValue('new-user');
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValue(user);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.people.findMany.mockResolvedValue([person]);
    prisma.accountUserMerge.findMany.mockImplementation(({ where }: { where: { newUserId: { in: string[] } } }) => {
      if (where.newUserId.in.includes('new-user')) return Promise.resolve([{ oldUserId: 'middle-user' }]);
      if (where.newUserId.in.includes('middle-user')) return Promise.resolve([{ oldUserId: 'old-user' }]);
      return Promise.resolve([]);
    });
    prisma.ticketTransferAuthorCooldown.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: 'old-user', submissionCount: 5, lastSubmittedAt })
      .mockResolvedValueOnce(null);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        user: prisma.user,
        ticketTransfer: prisma.ticketTransfer,
        ticketNotificationOutbox: prisma.ticketNotificationOutbox,
        ticketRealtimeOutbox: prisma.ticketRealtimeOutbox,
        ticketTransferAuthorCooldown: prisma.ticketTransferAuthorCooldown,
        $queryRaw: prisma.$queryRaw,
      }),
    );

    await expect(service.resolveCurrentUserContext(authenticatedUser)).resolves.toEqual({ user, person });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 'new-user' }) }),
    );
    expect(prisma.accountUserMerge.findMany).toHaveBeenNthCalledWith(1, {
      where: { newUserId: { in: ['new-user'] } },
      select: { oldUserId: true },
    });
    expect(prisma.accountUserMerge.findMany).toHaveBeenNthCalledWith(2, {
      where: { newUserId: { in: ['middle-user'] } },
      select: { oldUserId: true },
    });
    expect(prisma.ticketTransfer.updateMany).toHaveBeenCalledWith({
      where: { senderStatus: 'PENDING', recipientUserId: 'old-user' },
      data: { recipientUserId: 'new-user' },
    });
    expect(prisma.ticketNotificationOutbox.updateMany).toHaveBeenCalledWith({
      where: { recipientUserId: 'old-user', sentAt: null },
      data: { recipientUserId: 'new-user' },
    });
    expect(prisma.ticketRealtimeOutbox.updateMany).toHaveBeenCalledWith({
      where: { recipientUserId: 'old-user', publishedAt: null },
      data: { recipientUserId: 'new-user' },
    });
    expect(prisma.ticketTransferAuthorCooldown.update).toHaveBeenCalledWith({
      where: { userId: 'old-user' },
      data: { userId: 'new-user' },
    });
  });
});

function createAuthenticatedUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  const { claims, ...rest } = overrides;

  return {
    realm_access: {
      roles: [],
    },
    sub: 'keycloak-sub',
    preferredUsername: 'student',
    email: 'student@example.edu',
    token: 'token',
    roles: [],
    roleSet: new Set(),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: ['openid', 'email', 'phone', 'identityDocument'],
    oidcScopeSet: new Set(['openid', 'email', 'phone', 'identityDocument']),
    scopes: ['openid', 'email', 'phone', 'identityDocument'],
    scopeSet: new Set(['openid', 'email', 'phone', 'identityDocument']),
    claims: {
      name: 'Student Name',
      phone: '+5511999999999',
      identity_document: '123.456.789-00',
      enrollment_number: '20240001',
      unesp_role: ['aluno-graduacao'],
      is_onboarded: true,
      ...(claims ?? {}),
    },
    ...rest,
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  const { lastLoginAt = null, ...rest } = overrides;

  return {
    id: 'keycloak-sub',
    email: 'student@example.edu',
    name: 'Student Name',
    identityDocument: '123.456.789-00',
    academicId: '20240001',
    unespRole: ['aluno-graduacao'],
    role: 'USER',
    lastLoginAt,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedById: null,
    ...rest,
  };
}

function createPersonRecord(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    id: 'person-id',
    name: 'Student Name',
    email: null,
    secondaryEmails: [],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    user: null,
    lecturerProfile: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedById: null,
    ...overrides,
  };
}
