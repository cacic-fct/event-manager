import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
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

    service = new CurrentUserContextService(prisma as unknown as PrismaService);
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
    prisma.people.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([person]);
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.people.update.mockResolvedValue(updatedPerson);

    const result = await service.resolveCurrentUserContext(
      authenticatedUser,
      true,
    );

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
    prisma.people.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([person]);
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.people.update.mockResolvedValue(updatedPerson);

    const result = await service.resolveCurrentUserContext(
      authenticatedUser,
      true,
    );

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
    prisma.people.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.people.create.mockResolvedValue(createdPerson);

    const result = await service.resolveCurrentUserContext(
      authenticatedUser,
      true,
    );

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

function createAuthenticatedUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
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
    },
    ...overrides,
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'keycloak-sub',
    email: 'student@example.edu',
    name: 'Student Name',
    identityDocument: '123.456.789-00',
    academicId: '20240001',
    role: 'USER',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedById: null,
    ...overrides,
  };
}

function createPersonRecord(
  overrides: Partial<PersonRecord> = {},
): PersonRecord {
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
