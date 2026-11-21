import {
  LGPD_MCP_OPERATION_DELEGATION_SELECT,
  LGPD_MCP_COMMAND_SELECT,
  LGPD_MCP_ADMIN_DELEGATION_SELECT,
  LGPD_MCP_ADMIN_OPERATION_LOG_SELECT,
  LGPD_MCP_ADMIN_PROPOSAL_SELECT,
} from './lgpd-selects';
import {
  createLgpdServiceTestContext,
  LgpdServiceTestContext,
  restoreLgpdServiceTestContext,
} from './lgpd.service.spec-support';

describe('LgpdService MCP privacy', () => {
  let context: LgpdServiceTestContext;

  beforeEach(() => {
    context = createLgpdServiceTestContext();
  });

  afterEach(() => {
    restoreLgpdServiceTestContext();
  });

  it('exports only subject consent, proposal decisions and operation evidence across merged users', async () => {
    const { prisma, service } = context;
    const createdAt = new Date();
    prisma.mcpAdminDelegation.findMany.mockResolvedValue([
      {
        id: 'delegation-1',
        userId: 'old-user',
        clientId: 'mcp-client',
        resource: 'https://example.com/api/mcp/admin',
        eventIds: ['event-1'],
        capabilities: ['EVENT_READ'],
        maxProposals: 1,
        createdAt,
        expiresAt: createdAt,
        revokedAt: null,
        event: { name: 'Private event title' },
      },
    ]);
    prisma.mcpAdminProposal.findMany.mockResolvedValue([
      {
        id: 'proposal-1',
        delegationId: 'delegation-1',
        eventId: 'event-1',
        state: 'APPLIED',
        createdAt,
        expiresAt: createdAt,
        decidedAt: createdAt,
        approvedById: 'old-user',
        approvedByName: 'Old User',
        descriptionBefore: 'Private original description',
        descriptionAfter: 'Private proposed description',
        event: { name: 'Private event title' },
        idempotencyKey: 'internal-key',
        effectsPending: true,
      },
    ]);
    prisma.mcpAdminOperationLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        userId: 'old-user',
        clientId: 'mcp-client',
        delegationId: 'delegation-1',
        tool: 'list_events',
        eventId: 'event-1',
        proposalId: null,
        outcome: 'success',
        createdAt,
        arguments: { description: 'Private proposed description' },
        result: { name: 'Private event title' },
      },
    ]);

    const result = await service.collectUserData({ userId: 'new-user' });

    expect(prisma.mcpAdminDelegation.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['new-user', 'old-user'] } },
      select: LGPD_MCP_ADMIN_DELEGATION_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.mcpAdminProposal.findMany).toHaveBeenCalledWith({
      where: { delegation: { userId: { in: ['new-user', 'old-user'] } } },
      select: LGPD_MCP_ADMIN_PROPOSAL_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.mcpAdminOperationLog.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['new-user', 'old-user'] } },
      select: LGPD_MCP_ADMIN_OPERATION_LOG_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    expect(result.mcp).toEqual({
      operationDelegations: [],
      commands: [],
      delegations: [
        {
          id: 'delegation-1',
          userId: 'old-user',
          clientId: 'mcp-client',
          resource: 'https://example.com/api/mcp/admin',
          eventIds: ['event-1'],
          capabilities: ['EVENT_READ'],
          maxProposals: 1,
          createdAt,
          expiresAt: createdAt,
          revokedAt: null,
        },
      ],
      proposals: [
        {
          id: 'proposal-1',
          delegationId: 'delegation-1',
          eventId: 'event-1',
          state: 'APPLIED',
          createdAt,
          expiresAt: createdAt,
          decidedAt: createdAt,
          approvedById: 'old-user',
          approvedByName: 'Old User',
        },
      ],
      operationLogs: [
        {
          id: 'log-1',
          userId: 'old-user',
          clientId: 'mcp-client',
          delegationId: 'delegation-1',
          tool: 'list_events',
          eventId: 'event-1',
          proposalId: null,
          outcome: 'success',
          createdAt,
        },
      ],
    });
    expect(JSON.stringify(result.mcp)).not.toContain('Private');
    expect(JSON.stringify(result.mcp)).not.toContain('description');
    expect(JSON.stringify(result.mcp)).not.toContain('internal-key');
  });

  it('exports only operation consent and command decision metadata, never administrative payloads', async () => {
    const { prisma, service } = context;
    const now = new Date();
    const delegation = {
      id: 'operation-access',
      userId: 'old-user',
      clientId: 'mcp-client',
      resource: 'https://example.com/api/mcp/admin',
      operations: ['updateSportsMatch'],
      scope: { mode: 'ALL_AUTHORIZED' },
      personalData: true,
      maxProposals: 5,
      createdAt: now,
      expiresAt: now,
      revokedAt: null,
    };
    const command = {
      id: 'command-1',
      delegationId: delegation.id,
      operation: 'updateSportsMatch',
      state: 'UNCERTAIN',
      createdAt: now,
      expiresAt: now,
      decidedAt: now,
      approvedById: 'old-user',
      approvedByName: 'Nome do titular',
    };
    prisma.mcpAdminOperationDelegation.findMany.mockResolvedValue([
      { ...delegation, proposals: [{ arguments: { email: 'private@example.com' } }] },
    ]);
    prisma.mcpAdminCommand.findMany.mockResolvedValue([
      {
        ...command,
        arguments: { contact: 'private@example.com', financialValue: 500 },
        reviewedArguments: { contact: 'private-reviewed@example.com' },
        fingerprint: 'internal-fingerprint',
        idempotencyKey: 'internal-command-key',
        delegation: { userId: 'unrelated-user' },
      },
    ]);

    const result = await service.collectUserData({ userId: 'new-user' });

    expect(prisma.mcpAdminOperationDelegation.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['new-user', 'old-user'] } },
      select: LGPD_MCP_OPERATION_DELEGATION_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.mcpAdminCommand.findMany).toHaveBeenCalledWith({
      where: { delegation: { userId: { in: ['new-user', 'old-user'] } } },
      select: LGPD_MCP_COMMAND_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    expect(result.mcp).toEqual({
      operationDelegations: [delegation],
      commands: [command],
      delegations: [],
      proposals: [],
      operationLogs: [],
    });
    const serialized = JSON.stringify(result.mcp);
    for (const forbidden of [
      'arguments',
      'reviewedArguments',
      'fingerprint',
      'idempotencyKey',
      'private@',
      'financialValue',
      'unrelated-user',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('deletes broad operation grants for merged users immediately and never restores them on cancellation', async () => {
    const { tx, service } = context;
    tx.mcpAdminOperationDelegation.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.scheduleDeletion({ userId: 'new-user', requestId: 'request-1' });

    expect(result.recordsUpdated).toBe(4);
    expect(tx.mcpAdminOperationDelegation.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['new-user', 'old-user'] } },
    });
    await service.cancelDeletion({ userId: 'new-user', requestId: 'request-1' });
    expect(tx.mcpAdminOperationDelegation.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('revokes MCP access immediately when deletion is scheduled and does not restore it on cancellation', async () => {
    const { tx, service } = context;
    tx.mcpAdminDelegation.deleteMany.mockResolvedValue({ count: 2 });
    tx.mcpAdminOperationLog.deleteMany.mockResolvedValue({ count: 3 });

    await expect(service.scheduleDeletion({ userId: 'new-user', requestId: 'request-1' })).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 7,
    });
    expect(tx.mcpAdminDelegation.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['new-user', 'old-user'] } },
    });
    expect(tx.mcpAdminOperationLog.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['new-user', 'old-user'] } },
    });

    await service.cancelDeletion({ userId: 'new-user', requestId: 'request-1' });

    expect(tx.mcpAdminDelegation.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.mcpAdminOperationLog.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('cleans MCP records during direct hard deletion as well as scheduled deletion', async () => {
    const { tx, service } = context;

    await service.hardDelete({ userId: 'new-user', requestId: 'request-1' });

    expect(tx.mcpAdminCommand.updateMany).toHaveBeenCalledWith({
      where: { approvedById: { in: ['new-user', 'old-user'] } },
      data: { approvedById: null, approvedByName: null },
    });
    expect(tx.mcpAdminOperationDelegation.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['new-user', 'old-user'] } },
    });
    expect(tx.mcpAdminOperationDelegation.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.mcpAdminProposal.updateMany).toHaveBeenCalledWith({
      where: { approvedById: { in: ['new-user', 'old-user'] } },
      data: { approvedById: null, approvedByName: null },
    });
    expect(tx.mcpAdminOperationLog.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['new-user', 'old-user'] } },
    });
    expect(tx.mcpAdminDelegation.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['new-user', 'old-user'] } },
    });
    expect(tx.mcpAdminDelegation.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.deleteMany.mock.invocationCallOrder[0],
    );
  });
});
