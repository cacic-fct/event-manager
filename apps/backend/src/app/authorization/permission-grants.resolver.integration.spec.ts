import { Permission } from '@cacic-fct/shared-permissions';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditLogOperation,
  EventManagerPermissionGrantScope,
} from '@prisma/client';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionGrantsResolver } from './permission-grants.resolver';
import { PermissionGrantsService } from './permission-grants.service';

describe('PermissionGrantsResolver integration', () => {
  let moduleRef: TestingModule;
  let prisma: ReturnType<typeof createPrisma>;
  let auditLog: ReturnType<typeof createAuditLog>;
  let resolver: PermissionGrantsResolver;

  beforeEach(async () => {
    prisma = createPrisma();
    auditLog = createAuditLog();
    moduleRef = await Test.createTestingModule({
      providers: [
        PermissionGrantsResolver,
        PermissionGrantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();
    resolver = moduleRef.get(PermissionGrantsResolver);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('guards every permission-grant GraphQL operation with the matching DB permission', () => {
    expect(permissionMetadata('eventManagerPermissionGrants')).toEqual([Permission.PermissionGrant.Read]);
    expect(permissionMetadata('eventManagerPermissionGrantTargets')).toEqual([Permission.PermissionGrant.Read]);
    expect(permissionMetadata('createEventManagerPermissionGrant')).toEqual([Permission.PermissionGrant.Create]);
    expect(permissionMetadata('updateEventManagerPermissionGrant')).toEqual([Permission.PermissionGrant.Update]);
    expect(permissionMetadata('deleteEventManagerPermissionGrant')).toEqual([Permission.PermissionGrant.Delete]);
  });

  it('lists and creates grants through the injected service with the GraphQL request actor', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValueOnce([
      grantRecord({ permission: Permission.Event.Read }),
    ]);

    await expect(resolver.eventManagerPermissionGrants('user-1')).resolves.toEqual([
      expect.objectContaining({
        userId: 'user-1',
        permission: Permission.Event.Read,
      }),
    ]);
    expect(prisma.eventManagerPermissionGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          deletedAt: null,
        },
      }),
    );

    const created = await resolver.createEventManagerPermissionGrant(
      {
        userId: ' user-1 ',
        permission: Permission.Event.Create,
        scope: EventManagerPermissionGrantScope.GLOBAL,
      },
      { request: { user: authenticatedUser('actor-1') } },
    );

    expect(created).toEqual(expect.objectContaining({
      userId: 'user-1',
      permission: Permission.Event.Create,
      createdById: 'actor-1',
      updatedById: 'actor-1',
    }));
    expect(prisma.eventManagerPermissionGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          permission: Permission.Event.Create,
          createdById: 'actor-1',
          updatedById: 'actor-1',
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.CREATE,
        actor: expect.objectContaining({ sub: 'actor-1' }),
      }),
      prisma,
    );
  });

  it('updates and deletes grants through the injected service with the GraphQL request actor', async () => {
    prisma.eventManagerPermissionGrant.findFirst
      .mockResolvedValueOnce(grantRecord({ permission: Permission.Event.Read }))
      .mockResolvedValueOnce(null);

    const updated = await resolver.updateEventManagerPermissionGrant(
      'grant-1',
      {
        permission: Permission.Event.Update,
        scope: EventManagerPermissionGrantScope.GLOBAL,
      },
      { req: { user: authenticatedUser('actor-2') } },
    );

    expect(updated).toEqual(expect.objectContaining({
      id: 'grant-1',
      permission: Permission.Event.Update,
      updatedById: 'actor-2',
    }));
    expect(prisma.eventManagerPermissionGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'grant-1',
          deletedAt: null,
        },
        data: expect.objectContaining({
          permission: Permission.Event.Update,
          updatedById: 'actor-2',
        }),
      }),
    );

    prisma.eventManagerPermissionGrant.findFirst.mockResolvedValueOnce(
      grantRecord({ permission: Permission.Event.Update }),
    );
    prisma.eventManagerPermissionGrant.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      resolver.deleteEventManagerPermissionGrant('grant-1', {
        req: { user: authenticatedUser('actor-2') },
      }),
    ).resolves.toEqual({
      deleted: true,
      id: 'grant-1',
    });
    expect(prisma.eventManagerPermissionGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          updatedById: 'actor-2',
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.DELETE,
        force: true,
        actor: expect.objectContaining({ sub: 'actor-2' }),
      }),
      prisma,
    );
  });
});

function permissionMetadata(method: keyof PermissionGrantsResolver): unknown {
  return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PermissionGrantsResolver.prototype[method]);
}

function createPrisma() {
  const prisma = {
    eventManagerPermissionGrant: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async (args: GrantWriteArgs) => grantRecord(args.data)),
      update: jest.fn(async (args: GrantWriteArgs) => grantRecord({ id: 'grant-1', ...args.data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    people: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    event: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    majorEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventGroup: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (operation: (tx: typeof prisma) => Promise<unknown>) => operation(prisma));
  return prisma;
}

function createAuditLog() {
  return {
    record: jest.fn().mockResolvedValue(undefined),
  };
}

type GrantWriteData = {
  id?: string;
  userId?: string;
  personId?: string | null;
  permission?: string;
  scope?: EventManagerPermissionGrantScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  createdById?: string | null;
  updatedById?: string | null;
};

type GrantWriteArgs = {
  data: GrantWriteData;
};

function grantRecord(overrides: GrantWriteData = {}) {
  return {
    id: overrides.id ?? 'grant-1',
    userId: overrides.userId ?? 'user-1',
    personId: overrides.personId ?? null,
    permission: overrides.permission ?? Permission.Event.Read,
    scope: overrides.scope ?? EventManagerPermissionGrantScope.GLOBAL,
    eventId: overrides.eventId ?? null,
    majorEventId: overrides.majorEventId ?? null,
    eventGroupId: overrides.eventGroupId ?? null,
    event: null,
    majorEvent: null,
    eventGroup: null,
    validFrom: overrides.validFrom ?? null,
    validUntil: overrides.validUntil ?? null,
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
    createdById: overrides.createdById ?? null,
    updatedAt: new Date('2026-07-01T12:00:00.000Z'),
    updatedById: overrides.updatedById ?? null,
  };
}

function authenticatedUser(sub: string): AuthenticatedUser {
  return {
    realm_access: {
      roles: [],
    },
    sub,
    token: 'token',
    roles: [],
    roleSet: new Set(),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: {},
  };
}
