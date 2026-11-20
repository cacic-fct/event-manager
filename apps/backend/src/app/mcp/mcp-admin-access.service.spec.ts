import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { type McpAdminDelegation, type Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminInvalidationService } from './mcp-admin-invalidation.service';
import { McpAdminConfig, MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE } from './mcp-admin.config';

const { jest } = import.meta;

function principal(): AuthenticatedUser {
  const scopes = [MCP_ADMIN_READ_SCOPE, MCP_ADMIN_PROPOSE_SCOPE];
  return {
    sub: 'user-1',
    token: 'unused',
    realm_access: { roles: [] },
    roles: ['access', 'super-admin'],
    roleSet: new Set(['access', 'super-admin']),
    permissions: [],
    permissionSet: new Set(),
    scopes,
    scopeSet: new Set(scopes),
    oidcScopes: scopes,
    oidcScopeSet: new Set(scopes),
    claims: { azp: 'mcp-client' },
  };
}

function delegation(): McpAdminDelegation {
  return {
    id: 'delegation-1',
    userId: 'user-1',
    clientId: 'mcp-client',
    resource: 'https://events.example/api/mcp/admin',
    eventIds: ['event-1'],
    capabilities: ['EVENT_READ', 'DESCRIPTION_PROPOSE'],
    maxProposals: 2,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };
}

function context() {
  const stored = delegation();
  const authorization = {
    assertPermissions: jest.fn().mockResolvedValue(undefined),
    accessibleEventTargets: jest.fn().mockResolvedValue(null),
    forTransaction: jest.fn(),
  };
  authorization.forTransaction.mockReturnValue(authorization);
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    people: { findMany: jest.fn().mockResolvedValue([{ deletedAt: null, lgpdDeletionRequestId: null }]) },
    event: {
      findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'event-1', name: 'Evento permitido' }]),
    },
    mcpAdminDelegation: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(stored),
      create: jest.fn().mockResolvedValue(stored),
      update: jest.fn().mockResolvedValue(stored),
    },
    mcpAdminProposal: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
  let committed = false;
  prisma.$transaction.mockImplementation(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    const result = await operation(prisma as unknown as Prisma.TransactionClient);
    committed = true;
    return result;
  });
  const invalidations = { publish: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const config = {
    enabled: true,
    proposalsEnabled: true,
    allowedClients: ['mcp-client'],
    resourceUrl: stored.resource,
  };
  const service = new McpAdminAccessService(
    prisma as unknown as PrismaService,
    authorization as unknown as AuthorizationPolicyService,
    audit as unknown as AuditLogService,
    config as McpAdminConfig,
    invalidations as unknown as McpAdminInvalidationService,
  );
  return {
    service,
    prisma,
    authorization,
    audit,
    config,
    stored,
    invalidations,
    committed: () => committed,
    user: principal(),
  };
}

describe('McpAdminAccessService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it.each([
    ['no linked person', []],
    ['ambiguous linked people', [{ deletedAt: null }, { deletedAt: null }]],
    ['deleted person', [{ deletedAt: new Date(1), lgpdDeletionRequestId: null }]],
    ['pending LGPD deletion', [{ deletedAt: null, lgpdDeletionRequestId: 'request-1' }]],
  ])('denies %s even to a super-admin', async (_name, people) => {
    const { service, prisma, user } = context();
    prisma.people.findMany.mockResolvedValue(people);

    await expect(service.assertEligible(user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.people.findMany).toHaveBeenCalledWith({
      where: { userId: user.sub },
      select: { deletedAt: true, lgpdDeletionRequestId: true },
      take: 2,
    });
  });

  it('requires a subject and one active linked identity', async () => {
    const { service, user, prisma } = context();
    await expect(service.assertEligible(user)).resolves.toBeUndefined();
    await expect(service.assertEligible({ ...user, sub: undefined })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.people.findMany).toHaveBeenCalledTimes(1);
  });

  it('binds tool lookup to owner and OAuth client before rechecking actual read and update permission', async () => {
    const { service, user, prisma, authorization, stored } = context();
    const tx = prisma as unknown as Prisma.TransactionClient;

    await expect(service.assertToolAccess(user, stored.id, 'DESCRIPTION_PROPOSE', 'event-1', tx)).resolves.toEqual(
      stored,
    );

    expect(prisma.mcpAdminDelegation.findFirst).toHaveBeenCalledWith({
      where: { id: stored.id, userId: user.sub, clientId: 'mcp-client' },
    });
    expect(authorization.forTransaction).toHaveBeenCalledWith(tx);
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.Event.Read, Permission.Event.Update],
      { eventId: 'event-1' },
    );
  });

  it('denies a delegation belonging to another owner or client', async () => {
    const { service, user, prisma, authorization } = context();
    prisma.mcpAdminDelegation.findFirst.mockResolvedValue(null);

    await expect(service.assertToolAccess(user, 'not-owned', 'EVENT_READ', 'event-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(authorization.assertPermissions).not.toHaveBeenCalled();
  });

  it.each([MCP_ADMIN_READ_SCOPE, MCP_ADMIN_PROPOSE_SCOPE])(
    'requires OAuth grant %s independently of delegation',
    async (scope) => {
      const { service, user, prisma } = context();
      user.oidcScopeSet.delete(scope);
      const capability = scope === MCP_ADMIN_READ_SCOPE ? 'EVENT_READ' : 'DESCRIPTION_PROPOSE';

      await expect(service.assertToolAccess(user, 'delegation-1', capability, 'event-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.mcpAdminDelegation.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(['revoked', 'expired', 'resource', 'client', 'capability', 'event', 'disabled'])(
    'denies %s delegation access before checking event permissions',
    async (condition) => {
      const { service, user, stored, config, authorization } = context();
      if (condition === 'revoked') stored.revokedAt = new Date();
      if (condition === 'expired') stored.expiresAt = new Date();
      if (condition === 'resource') stored.resource += '/different';
      if (condition === 'client') stored.clientId = 'unapproved';
      if (condition === 'capability') stored.capabilities = ['EVENT_READ'];
      if (condition === 'event') stored.eventIds = ['other-event'];
      if (condition === 'disabled') config.proposalsEnabled = false;

      await expect(service.assertToolAccess(user, stored.id, 'DESCRIPTION_PROPOSE', 'event-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(authorization.assertPermissions).not.toHaveBeenCalled();
    },
  );

  it('intersects explicit target relationships with active resources and audience visibility', async () => {
    const { service, user, authorization } = context();
    authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['event-1']),
      eventGroupIds: new Set(['group-1']),
      majorEventIds: new Set(['major-1']),
    });

    const where = await service.eventWhere(user, Permission.Event.Read);

    expect(authorization.accessibleEventTargets).toHaveBeenCalledWith(user, Permission.Event.Read);
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { deletedAt: null },
        {
          OR: [
            { id: { in: ['event-1'] } },
            { eventGroupId: { in: ['group-1'] } },
            { majorEventId: { in: ['major-1'] } },
            { eventGroup: { is: { majorEventId: { in: ['major-1'] } } } },
          ],
        },
        { OR: [{ majorEventId: null }, { majorEvent: { is: { deletedAt: null } } }] },
      ]),
    );
  });

  it('rejects an event filtered out by publication audience or resource visibility', async () => {
    const { service, user, prisma } = context();
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(service.assertEventPermission(user, 'event-1', 'DESCRIPTION_PROPOSE')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('checks every requested permission and audits newly created delegation in the same transaction', async () => {
    const { service, user, stored, prisma, audit, authorization } = context();
    await service.create(user, {
      clientId: stored.clientId,
      eventIds: stored.eventIds,
      capabilities: stored.capabilities,
      maxProposals: stored.maxProposals,
      expiresAt: stored.expiresAt.toISOString(),
    });

    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.Event.Read, Permission.Event.Update],
      { eventId: 'event-1' },
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ source: 'mcp', delegationId: stored.id, clientId: stored.clientId }),
        squashWindowMs: 0,
      }),
      prisma,
    );
  });

  it('enforces active delegation quota before creating or auditing', async () => {
    const { service, user, stored, prisma, audit } = context();
    prisma.mcpAdminDelegation.count.mockResolvedValue(10);

    await expect(
      service.create(user, {
        clientId: stored.clientId,
        eventIds: stored.eventIds,
        capabilities: stored.capabilities,
        maxProposals: 2,
        expiresAt: stored.expiresAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.mcpAdminDelegation.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('publishes delegation creation only after the transaction commits', async () => {
    const { service, user, stored, invalidations, committed, audit } = context();
    invalidations.publish.mockImplementation(async () => {
      expect(committed()).toBe(true);
    });
    audit.record.mockImplementation(async () => {
      expect(invalidations.publish).not.toHaveBeenCalled();
    });

    await service.create(user, {
      clientId: stored.clientId,
      eventIds: stored.eventIds,
      capabilities: stored.capabilities,
      maxProposals: stored.maxProposals,
      expiresAt: stored.expiresAt.toISOString(),
    });

    expect(invalidations.publish).toHaveBeenCalledWith(user.sub);
    expect(invalidations.publish).toHaveBeenCalledTimes(1);
  });

  it('does not publish creation after an audit failure aborts the transaction', async () => {
    const { service, user, stored, invalidations, audit, committed } = context();
    const failure = new Error('Audit unavailable');
    audit.record.mockRejectedValue(failure);

    await expect(
      service.create(user, {
        clientId: stored.clientId,
        eventIds: stored.eventIds,
        capabilities: stored.capabilities,
        maxProposals: stored.maxProposals,
        expiresAt: stored.expiresAt.toISOString(),
      }),
    ).rejects.toBe(failure);

    expect(committed()).toBe(false);
    expect(invalidations.publish).not.toHaveBeenCalled();
  });

  it('publishes revocation only after its audited transaction has committed', async () => {
    const { service, user, stored, invalidations, committed, audit, prisma } = context();
    invalidations.publish.mockImplementation(async () => {
      expect(committed()).toBe(true);
    });
    audit.record.mockImplementation(async () => {
      expect(invalidations.publish).not.toHaveBeenCalled();
    });

    await service.revoke(user, stored.id);

    expect(prisma.mcpAdminDelegation.update).toHaveBeenCalledTimes(1);
    expect(invalidations.publish).toHaveBeenCalledWith(user.sub);
  });

  it('does not publish a failed revocation', async () => {
    const { service, user, stored, invalidations, audit } = context();
    audit.record.mockRejectedValue(new Error('Audit unavailable'));

    await expect(service.revoke(user, stored.id)).rejects.toThrow('Audit unavailable');
    expect(invalidations.publish).not.toHaveBeenCalled();
  });

  it('keeps an older active grant visible and revocable ahead of recent inactive history using bulk projections', async () => {
    const { service, prisma, stored, user } = context();
    stored.createdAt = new Date(Date.now() - 10 * 60 * 60_000);
    const history = Array.from({ length: 40 }, (_, index) => ({
      ...stored,
      id: `inactive-${index}`,
      createdAt: new Date(Date.now() - index * 60_000),
      revokedAt: new Date(),
      eventIds: ['event-2'],
    }));
    prisma.mcpAdminDelegation.findMany.mockResolvedValueOnce([stored]).mockResolvedValueOnce(history);
    prisma.event.findMany.mockResolvedValue([
      { id: 'event-1', name: 'Evento da delegação ativa' },
      { id: 'event-2', name: 'Evento do histórico' },
    ]);
    prisma.mcpAdminProposal.groupBy.mockResolvedValue([
      { delegationId: stored.id, _count: { _all: 3 } },
      { delegationId: history[0].id, _count: { _all: 1 } },
    ]);

    const result = await service.list(user);

    expect(prisma.mcpAdminDelegation.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.mcpAdminDelegation.findMany).toHaveBeenNthCalledWith(1, {
      where: { userId: user.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
    });
    expect(prisma.mcpAdminDelegation.findMany).toHaveBeenNthCalledWith(2, {
      where: { userId: user.sub, OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: new Date() } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 40,
    });
    expect(result).toHaveLength(41);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: stored.id,
        revokedAt: null,
        proposalCount: 3,
        events: [{ id: 'event-1', name: 'Evento da delegação ativa' }],
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        id: history[0].id,
        proposalCount: 1,
        events: [{ id: 'event-2', name: 'Evento do histórico' }],
      }),
    );
    expect(result[2].proposalCount).toBe(0);
    expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ id: { in: ['event-1', 'event-2'] } }, expect.any(Object)] },
        select: { id: true, name: true },
      }),
    );
    expect(prisma.mcpAdminProposal.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.mcpAdminProposal.groupBy).toHaveBeenCalledWith({
      by: ['delegationId'],
      where: { delegationId: { in: [stored.id, ...history.map((entry) => entry.id)] } },
      _count: { _all: true },
    });
    expect(prisma.mcpAdminProposal.count).not.toHaveBeenCalled();

    await service.revoke(user, result[0].id);

    expect(prisma.mcpAdminDelegation.update).toHaveBeenCalledWith({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
  });
});
