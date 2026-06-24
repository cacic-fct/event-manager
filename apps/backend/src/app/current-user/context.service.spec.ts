import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountMergeService } from '../account-merge/account-merge.service';
import { AuthenticatedUserSyncService } from '../auth/authenticated-user-sync.service';
import { CertificateIssuingService } from '../certificate/certificate-issuing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserContextService } from './context.service';
import { PersonRecord, UserRecord } from './selects';

type PrismaMock = {
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
        identityDocument: '987.654.321-00',
        enrollmentNumber: '20240001',
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
      identityDocument: '123.456.789-00',
      enrollmentNumber: '20240001',
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
