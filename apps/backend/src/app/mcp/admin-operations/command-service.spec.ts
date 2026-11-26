import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { Prisma, type McpAdminCommand, type McpAdminOperationDelegation } from '@prisma/client';
import type { AdminMcpCommandDecision } from '@cacic-fct/event-manager-mcp-contracts';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE } from '../mcp-admin.config';
import { ADMIN_MCP_OPERATIONS } from './catalog';
import { AdminMcpCommandService } from './command-service';
import type { AdminMcpExecution } from './execution-context';
const { jest } = import.meta;

function fixture() {
  const now = Date.now();
  const user: AuthenticatedUser = {
    sub: 'operator',
    token: '',
    claims: { azp: 'client-a', is_onboarded: true },
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    oidcScopes: [MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE],
    oidcScopeSet: new Set([MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE]),
  };
  const delegation: McpAdminOperationDelegation = {
    id: 'delegation-a',
    userId: 'operator',
    clientId: 'client-a',
    resource: 'https://events.example.test/api/mcp/admin',
    operations: ['event', 'updateEvent', 'person'],
    scope: { mode: 'ALL_AUTHORIZED' },
    personalData: false,
    maxProposals: 10,
    createdAt: new Date(now),
    expiresAt: new Date(now + 3600000),
    revokedAt: null,
  };
  let command: McpAdminCommand | undefined;
  let latest = [{ id: 'business-audit-a', lastRecordedAt: new Date(now - 1000), groupedCount: 1 }];
  const prisma = {
    $queryRaw: jest.fn(async (...args: unknown[]) => {
      void args;
      return latest;
    }),
    $transaction: jest.fn(
      async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>): Promise<unknown> =>
        callback(prisma as never),
    ),
    event: { findFirst: jest.fn(async () => ({ publicationState: 'DRAFT' })) },
    user: { findUnique: jest.fn(async () => ({ name: 'Current reviewer' })) },
    mcpAdminOperationDelegation: {
      findMany: jest.fn(async () => [delegation]),
      findFirst: jest.fn(
        async (input: {
          where: { id?: string; userId?: string; clientId?: string; revokedAt?: null; expiresAt?: { gt: Date } };
        }) => {
          const { where } = input;
          return (where.id && where.id !== delegation.id) ||
            (where.userId && where.userId !== delegation.userId) ||
            (where.clientId && where.clientId !== delegation.clientId) ||
            (where.revokedAt === null && delegation.revokedAt) ||
            (where.expiresAt && delegation.expiresAt <= where.expiresAt.gt)
            ? null
            : { ...delegation };
        },
      ),
      count: jest.fn(async () => 0),
    },
    mcpAdminCommand: {
      findMany: jest.fn(async () => (command ? [{ ...command, delegation }] : [])),
      findUnique: jest.fn(async () => (command ? { ...command } : null)),
      findFirst: jest.fn(async (input: { where: { id: string; delegation: { userId: string } } }) =>
        command && input.where.id === command.id && input.where.delegation.userId === delegation.userId
          ? { ...command, delegation: { ...delegation } }
          : null,
      ),
      count: jest.fn(async () => (command ? 1 : 0)),
      create: jest.fn(
        async (input: {
          data: Pick<
            McpAdminCommand,
            'delegationId' | 'operation' | 'arguments' | 'fingerprint' | 'idempotencyKey' | 'expiresAt'
          >;
        }) => {
          command = {
            ...input.data,
            id: 'command-a',
            state: 'PENDING',
            createdAt: new Date(),
            decidedAt: null,
            approvedById: null,
            approvedByName: null,
            reviewedArguments: null,
            result: null,
          };
          return { ...command };
        },
      ),
      updateMany: jest.fn(
        async (input: {
          where: { id: string; state: string; expiresAt?: { gt: Date } };
          data: Partial<Omit<McpAdminCommand, 'result'>> & { result?: unknown };
        }) => {
          if (
            !command ||
            command.id !== input.where.id ||
            command.state !== input.where.state ||
            (input.where.expiresAt && command.expiresAt <= input.where.expiresAt.gt)
          )
            return { count: 0 };
          const result = input.data.result;
          command = {
            ...command,
            ...input.data,
            result:
              result === undefined
                ? command.result
                : result === Prisma.JsonNull
                  ? null
                  : (result as McpAdminCommand['result']),
          };
          return { count: 1 };
        },
      ),
    },
  };
  const access = { assertEligible: jest.fn(async () => undefined) };
  const config = {
    enabled: true,
    proposalsEnabled: true,
    allowedClients: ['client-a'],
    resourceUrl: delegation.resource,
    applicationOrigin: 'https://events.example.test',
  };
  const policy = {
    assertPermissions: jest.fn(async (...args: unknown[]) => {
      void args;
    }),
    isSuperAdmin: jest.fn(() => false),
    buildResourceContext: jest.fn(() => ({ eventId: 'event-a', primaryResource: 'event' })),
  };
  const scopes = {
    operation: jest.fn(async (...args: unknown[]) => {
      void args;
    }),
    assert: jest.fn(async (...args: unknown[]) => {
      void args;
    }),
  };
  const domainWrite = jest.fn(async () => ({ id: 'event-a' }));
  const bridge = {
    preflight: jest.fn(async () => undefined),
    operation: jest.fn((field: string) => {
      const definition = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === field);
      if (!definition) throw new BadRequestException('Unknown operation');
      return { definition, info: { label: field, domain: definition.domain, inputSchema: {} } };
    }),
    arguments: jest.fn(
      (_field: string, input: unknown) => JSON.parse(JSON.stringify(input)) as Record<string, unknown>,
    ),
    execute: jest.fn(
      async (
        _field: string,
        _args: Record<string, unknown>,
        _user: AuthenticatedUser,
        execution: Omit<AdminMcpExecution, 'request' | 'user'>,
      ) => {
        if (execution.phase === 'apply') {
          await execution.beforeTransaction?.(prisma as never);
          await execution.assertScope?.([Permission.Event.Update], { eventId: 'event-a' });
          return domainWrite();
        }
        return { id: 'event-a' };
      },
    ),
    catalog: jest.fn(),
    coverage: jest.fn(),
  };
  const audit = {
    record: jest.fn(async (...args: unknown[]) => {
      void args;
    }),
  };
  const invalidations = { publish: jest.fn(async () => undefined) };
  const executionLock = { runForCommand: jest.fn(async (_id: string, work: () => Promise<unknown>) => work()) };
  const service = new AdminMcpCommandService(
    prisma as never,
    access as never,
    config as never,
    bridge as never,
    scopes as never,
    policy as never,
    audit as never,
    invalidations as never,
    executionLock as never,
  );
  const args = { id: 'event-a', input: { name: 'Nome proposto' } };
  const propose = () => service.propose(user, delegation.id, 'updateEvent', args, 'idempotent-a');
  const review = async (finalArguments: Record<string, unknown> = args) => {
    if (!command) await propose();
    if (!command) throw new Error('Proposal missing');
    return service.review(user, command.id, { arguments: finalArguments, expectedFingerprint: command.fingerprint });
  };
  const approve = async () => {
    const preview = await review();
    return service.decide(user, 'command-a', {
      decision: 'APPROVE',
      expectedFingerprint: preview.expectedFingerprint,
      review: preview,
    });
  };
  return {
    service,
    user,
    delegation,
    prisma,
    bridge,
    policy,
    scopes,
    access,
    audit,
    invalidations,
    executionLock,
    config,
    domainWrite,
    args,
    propose,
    review,
    approve,
    command: () => command,
    state: (state: string) => {
      if (command) command.state = state;
    },
    advanceBusiness: () => {
      latest = [{ id: 'business-audit-b', lastRecordedAt: new Date(now + 1000), groupedCount: 1 }];
    },
  };
}

describe('administrative MCP reviewed command lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date() });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('only stages a proposal, audits its queue transaction, and never calls the domain', async () => {
    const f = fixture();
    await expect(f.propose()).resolves.toEqual(
      expect.objectContaining({ proposalId: 'command-a', state: 'PENDING', appliesAutomatically: false }),
    );
    expect(f.bridge.execute).not.toHaveBeenCalled();
    expect(f.domainWrite).not.toHaveBeenCalled();
    expect(f.bridge.preflight).toHaveBeenCalledWith('updateEvent', f.args, f.user, {
      delegationId: f.delegation.id,
      clientId: f.delegation.clientId,
    });
    expect(f.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ queueOnly: true, proposalId: 'command-a' }) }),
      f.prisma,
    );
    await expect(f.service.read(f.user, f.delegation.id, 'updateEvent', f.args)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      f.service.propose(f.user, f.delegation.id, 'event', { id: 'event-a' }, 'query-key'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.bridge.execute).not.toHaveBeenCalled();
  });

  it.each(['client', 'user', 'operation', 'personal', 'oauth', 'scope', 'current-permissions', 'revoked', 'expired'])(
    'denies %s before staging or executing',
    async (boundary) => {
      const f = fixture();
      let operation = 'updateEvent';
      if (boundary === 'client') f.user.claims['azp'] = 'other-client';
      if (boundary === 'user') f.user.sub = 'other-user';
      if (boundary === 'operation') f.delegation.operations = ['event'];
      if (boundary === 'personal') operation = 'person';
      if (boundary === 'oauth') f.user.oidcScopeSet.clear();
      if (boundary === 'scope') f.scopes.operation.mockRejectedValue(new ForbiddenException());
      if (boundary === 'current-permissions') f.policy.assertPermissions.mockRejectedValue(new ForbiddenException());
      if (boundary === 'revoked') f.delegation.revokedAt = new Date();
      if (boundary === 'expired') f.delegation.expiresAt = new Date(Date.now() - 1);
      const attempt =
        operation === 'person'
          ? f.service.read(f.user, f.delegation.id, operation, { id: 'person-a' })
          : f.service.propose(f.user, f.delegation.id, operation, f.args, 'key');
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.prisma.mcpAdminCommand.create).not.toHaveBeenCalled();
      expect(f.bridge.execute).not.toHaveBeenCalled();
    },
  );

  it('does not widen ALL_AUTHORIZED beyond current permissions and passes inner read scope checks', async () => {
    const f = fixture();
    await f.service.read(f.user, f.delegation.id, 'event', { id: 'event-a' });
    expect(f.policy.assertPermissions).toHaveBeenCalled();
    const execution = f.bridge.execute.mock.calls[0][3];
    await execution.assertScope?.([Permission.Event.Read], { eventId: 'event-b' });
    expect(f.scopes.assert).toHaveBeenCalledWith({ mode: 'ALL_AUTHORIZED' }, [Permission.Event.Read], {
      eventId: 'event-b',
    });
    expect(execution.phase).toBe('read');
  });

  it('makes identical idempotent proposals stable and rejects reuse with changed input', async () => {
    const f = fixture();
    const first = await f.propose();
    await expect(f.propose()).resolves.toEqual(first);
    expect(f.prisma.mcpAdminCommand.create).toHaveBeenCalledTimes(1);
    expect(f.bridge.preflight).toHaveBeenCalledTimes(1);
    await expect(
      f.service.propose(
        f.user,
        f.delegation.id,
        'updateEvent',
        { ...f.args, input: { name: 'Outro nome' } },
        'idempotent-a',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores the applied domain result and serves repeat status reads without re-executing', async () => {
    const f = fixture();
    const result = { id: 'event-a', message: 'Evento atualizado' };
    f.domainWrite.mockResolvedValue(result);

    await expect(f.approve()).resolves.toBe('APPLIED');
    expect(f.command()?.result).toEqual(result);

    f.bridge.execute.mockClear();
    f.policy.assertPermissions.mockClear();
    const firstStatus = await f.service.status(f.user, 'command-a');
    const secondStatus = await f.service.status(f.user, 'command-a');
    expect(firstStatus).toEqual(expect.objectContaining({ state: 'APPLIED', result }));
    expect(secondStatus).toEqual(firstStatus);
    expect(f.policy.assertPermissions).toHaveBeenCalledWith(
      f.user,
      [Permission.Event.Update],
      expect.objectContaining({ eventId: 'event-a' }),
    );
    await expect(f.service.status({ ...f.user, sub: 'other-operator' }, 'command-a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(f.bridge.execute).not.toHaveBeenCalled();
  });

  it.each(['APPLIED', 'UNCERTAIN'])('returns %s after the last content review change was removed', async (state) => {
    const f = fixture();
    await f.propose();
    const command = f.command();
    if (!command) throw new Error('Proposal missing');
    command.operation = 'decideContentReview';
    command.arguments = { id: 'removed-review' };
    command.state = state;
    f.delegation.operations.push(command.operation);
    f.delegation.personalData = true;
    const contentReview = { findUnique: jest.fn(async () => null) };
    Object.assign(f.prisma, { contentReview });
    await expect(f.service.status(f.user, command.id)).resolves.toMatchObject({ state });
    expect(contentReview.findUnique).not.toHaveBeenCalled();
    command.state = 'PENDING';
    await expect(f.service.status(f.user, command.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('omits a result after an uncertain execution', async () => {
    const f = fixture();
    f.bridge.execute.mockRejectedValueOnce(new Error('unconfirmed execution'));

    await expect(f.approve()).resolves.toBe('UNCERTAIN');
    expect(f.command()?.result).toBeNull();
    f.bridge.execute.mockClear();

    const status = await f.service.status(f.user, 'command-a');
    expect(status).toMatchObject({ state: 'UNCERTAIN' });
    expect(status).not.toHaveProperty('result');
    expect(f.bridge.execute).not.toHaveBeenCalled();
  });

  it('does not expose an applied result without MCP read scope', async () => {
    const f = fixture();
    await f.approve();
    f.user.oidcScopeSet.delete(MCP_ADMIN_READ_SCOPE);
    f.bridge.execute.mockClear();

    const status = await f.service.status(f.user, 'command-a');
    expect(status).toMatchObject({ state: 'APPLIED' });
    expect(status).not.toHaveProperty('result');
    expect(f.bridge.execute).not.toHaveBeenCalled();
  });

  it('allows a read-only client to retrieve a past applied result when proposals are disabled', async () => {
    const f = fixture();
    const result = { id: 'event-a', message: 'Evento atualizado' };
    f.domainWrite.mockResolvedValue(result);
    await f.approve();
    f.user.oidcScopeSet.delete(MCP_ADMIN_PROPOSE_SCOPE);
    f.config.proposalsEnabled = false;
    f.bridge.execute.mockClear();

    await expect(f.service.status(f.user, 'command-a')).resolves.toEqual(
      expect.objectContaining({ state: 'APPLIED', result }),
    );
    expect(f.bridge.execute).not.toHaveBeenCalled();
  });

  it('rechecks personal-data consent before exposing a sensitive applied result', async () => {
    const f = fixture();
    const args = { id: 'person-a' };
    f.delegation.operations = ['deletePerson'];
    f.delegation.personalData = true;
    await f.service.propose(f.user, f.delegation.id, 'deletePerson', args, 'personal-a');
    const command = f.command();
    if (!command) throw new Error('Proposal missing');
    const review = await f.service.review(f.user, command.id, {
      arguments: args,
      expectedFingerprint: command.fingerprint,
    });
    await expect(
      f.service.decide(f.user, command.id, {
        decision: 'APPROVE',
        expectedFingerprint: review.expectedFingerprint,
        review,
      }),
    ).resolves.toBe('APPLIED');

    f.delegation.personalData = false;
    f.bridge.execute.mockClear();
    await expect(f.service.status(f.user, command.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.bridge.execute).not.toHaveBeenCalled();
  });

  it('rechecks idempotency inside the transaction before the quota', async () => {
    const f = fixture();
    const first = await f.propose();
    f.prisma.mcpAdminCommand.findUnique.mockResolvedValueOnce(null);
    f.prisma.mcpAdminCommand.count.mockClear();
    f.delegation.maxProposals = 1;
    await expect(f.propose()).resolves.toEqual(first);
    expect(f.prisma.mcpAdminCommand.count).not.toHaveBeenCalled();
    expect(f.prisma.mcpAdminCommand.create).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('recovers a unique-key collision and detects changed input: %s', async (changed) => {
    const f = fixture();
    const first = await f.propose();
    f.prisma.mcpAdminCommand.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    f.prisma.mcpAdminCommand.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Duplicate key', { code: 'P2002', clientVersion: 'test' }),
    );
    if (changed) f.args.input.name = 'Outro nome';
    const retry = f.propose();
    if (changed) await expect(retry).rejects.toBeInstanceOf(ConflictException);
    else await expect(retry).resolves.toEqual(first);
  });

  it('keeps equivalent JSON object key orders fresh', async () => {
    const f = fixture();
    const args = { input: { description: 'Descrição', name: 'Nome' }, id: 'event-a' };
    await f.service.propose(f.user, f.delegation.id, 'updateEvent', args, 'json-key');
    const command = f.command();
    if (!command) throw new Error('Missing command');
    command.arguments = { id: 'event-a', input: { name: 'Nome', description: 'Descrição' } };
    await expect(f.review(args)).resolves.toEqual(expect.objectContaining({ arguments: args }));
  });

  it.each(['PUBLISHED', 'SCHEDULED', 'DRAFT'])('signs the actual publication consequence for %s', async (state) => {
    const f = fixture();
    f.prisma.event.findFirst.mockResolvedValue({ publicationState: state });
    const preview = await f.review();
    if (state === 'PUBLISHED') expect(preview.effects).toContain('sairá de publicação');
    if (state === 'SCHEDULED') expect(preview.effects).toContain('agendamento de publicação será cancelado');
    if (state === 'DRAFT') expect(preview.effects).not.toMatch(/sairá de publicação|agendamento de publicação/);
    const published = await f.review({ ...f.args, input: { ...f.args.input, publishAfterUpdate: true } });
    expect(published.effects).toContain('ficará publicado');
    expect(published.effects).not.toContain('sairá de publicação');
  });

  it('keeps older active grants ahead of bounded revoked history', async () => {
    const f = fixture();
    const history = Array.from({ length: 50 }, (_, index) => ({
      ...f.delegation,
      id: `revoked-${index}`,
      revokedAt: new Date(),
    }));
    f.prisma.mcpAdminOperationDelegation.findMany.mockResolvedValueOnce([f.delegation]).mockResolvedValueOnce(history);
    const listed = await f.service.delegations(f.user);
    expect(listed).toHaveLength(51);
    expect(listed[0].id).toBe(f.delegation.id);
    expect(f.prisma.mcpAdminOperationDelegation.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId: 'operator', revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      }),
    );
    expect(f.prisma.mcpAdminOperationDelegation.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ take: 50 }),
    );
  });

  it('lists unavailable catalog operations alongside normal proposals', async () => {
    const f = fixture();
    await f.propose();
    const command = f.command();
    if (!command) throw new Error('Missing command');
    f.prisma.mcpAdminCommand.findMany.mockResolvedValue([
      { ...command, operation: 'removedOperation', delegation: f.delegation },
      { ...command, state: 'APPLIED', delegation: f.delegation },
    ]);
    const page = await f.service.list(f.user, 0);
    expect(page.items[0]).toMatchObject({ operationLabel: 'removedOperation', canApprove: false });
    expect(page.items[0].unavailableReason).toContain('catálogo');
    expect(page.items[1].operation).toBe('updateEvent');
  });

  it('requires personal-data consent to delegate and read certificate recipients', async () => {
    const f = fixture();
    const operations = ['certificateManualRecipients'];
    await expect(
      f.service.createDelegation(f.user, {
        clientId: 'client-a',
        operations,
        scope: { mode: 'ALL_AUTHORIZED' },
        personalData: false,
        maxProposals: 1,
        expiresAt: f.delegation.expiresAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    f.delegation.operations = operations;
    await expect(
      f.service.read(f.user, f.delegation.id, operations[0], { configId: 'config-a' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    f.delegation.personalData = true;
    await f.service.read(f.user, f.delegation.id, operations[0], { configId: 'config-a' });
    expect(f.policy.assertPermissions).toHaveBeenLastCalledWith(
      f.user,
      [Permission.Certificate.Read],
      expect.any(Object),
    );
  });

  it('requires an exact signed final preview, including manually edited values and effects', async () => {
    const f = fixture();
    const reviewedArguments = { id: 'event-a', input: { name: 'Nome revisado' } };
    const preview = await f.review(reviewedArguments);
    expect(f.bridge.preflight).toHaveBeenNthCalledWith(2, 'updateEvent', reviewedArguments, f.user, {
      delegationId: f.delegation.id,
      clientId: f.delegation.clientId,
      proposalId: 'command-a',
    });
    const fingerprint = preview.expectedFingerprint;
    await expect(
      f.service.decide(f.user, 'command-a', { decision: 'APPROVE', expectedFingerprint: fingerprint }),
    ).rejects.toBeInstanceOf(ConflictException);
    for (const changed of [
      { ...preview, arguments: { id: 'event-a', input: { name: 'Troca após assinatura' } } },
      { ...preview, effects: 'Efeito adulterado' },
      { ...preview, token: preview.token.slice(0, -2) + 'xx' },
    ])
      await expect(
        f.service.decide(f.user, 'command-a', {
          decision: 'APPROVE',
          expectedFingerprint: fingerprint,
          review: changed,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    expect(f.bridge.execute).not.toHaveBeenCalled();
    await f.service.decide(f.user, 'command-a', {
      decision: 'APPROVE',
      expectedFingerprint: fingerprint,
      review: preview,
    });
    expect(f.command()?.state).toBe('APPLIED');
    expect(f.command()?.reviewedArguments).toEqual(preview.arguments);
    expect(f.domainWrite).toHaveBeenCalledTimes(1);
  });

  it('preserves original target identities and ownership through human review', async () => {
    const f = fixture();
    await f.propose();
    for (const argumentsValue of [
      { id: 'event-b', input: { name: 'Mudança' } },
      { input: { name: 'Sem destino' } },
      { ...f.args, input: { personId: 'new-person' } },
    ]) {
      await expect(f.review(argumentsValue)).rejects.toBeInstanceOf(BadRequestException);
    }
    const otherUser = { ...f.user, sub: 'other-user' };
    await expect(
      f.service.review(otherUser, 'command-a', {
        arguments: f.args,
        expectedFingerprint: f.command()?.fingerprint ?? '',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.bridge.execute).not.toHaveBeenCalled();
  });

  it('denies stale or expired signed previews and never claims the command', async () => {
    const f = fixture();
    const preview = await f.review();
    f.advanceBusiness();
    await expect(
      f.service.decide(f.user, 'command-a', {
        decision: 'APPROVE',
        expectedFingerprint: preview.expectedFingerprint,
        review: preview,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.command()?.state).toBe('PENDING');
    expect(f.bridge.execute).not.toHaveBeenCalled();
    const fresh = fixture();
    const expiring = await fresh.review();
    jest.advanceTimersByTime(11 * 60000);
    await expect(
      fresh.service.decide(fresh.user, 'command-a', {
        decision: 'APPROVE',
        expectedFingerprint: expiring.expectedFingerprint,
        review: expiring,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fresh.bridge.execute).not.toHaveBeenCalled();
  });

  it('claims APPLYING atomically so concurrent approvals execute the domain at most once', async () => {
    const f = fixture();
    const preview = await f.review();
    const decision: AdminMcpCommandDecision = {
      decision: 'APPROVE',
      expectedFingerprint: preview.expectedFingerprint,
      review: preview,
    };
    const outcomes = await Promise.allSettled([
      f.service.decide(f.user, 'command-a', decision),
      f.service.decide(f.user, 'command-a', decision),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(f.bridge.execute).toHaveBeenCalledTimes(1);
    expect(f.domainWrite).toHaveBeenCalledTimes(1);
    expect(f.command()?.state).toBe('APPLIED');
  });

  it('performs freshness and row-lock checks inside the owning domain transaction before writes', async () => {
    const f = fixture();
    const preview = await f.review();
    f.bridge.execute.mockImplementation(async (_field, _args, _user, execution) => {
      expect(execution).toEqual(
        expect.objectContaining({ phase: 'apply', proposalId: 'command-a', approvedByName: 'Current reviewer' }),
      );
      f.advanceBusiness();
      await execution.beforeTransaction?.(f.prisma as never);
      return f.domainWrite();
    });
    await f.service.decide(f.user, 'command-a', {
      decision: 'APPROVE',
      expectedFingerprint: preview.expectedFingerprint,
      review: preview,
    });
    expect(f.domainWrite).not.toHaveBeenCalled();
    expect(f.command()?.state).toBe('UNCERTAIN');
    const queries = f.prisma.$queryRaw.mock.calls
      .flat()
      .map((argument) =>
        typeof argument === 'object' && argument !== null && 'strings' in argument
          ? String(argument.strings)
          : String(argument),
      )
      .join(' ');
    expect(queries).toContain('FOR UPDATE');
  });

  it('passes the local delegation callback to every owning service check before a domain write', async () => {
    const f = fixture();
    const preview = await f.review();
    f.scopes.assert.mockImplementation(async (_scope, _permissions, context) => {
      if ((context as { eventId?: string }).eventId === 'event-b')
        throw new ForbiddenException('outside local delegation');
    });
    f.bridge.execute.mockImplementation(async (_field, _args, _user, execution) => {
      await execution.beforeTransaction?.(f.prisma as never);
      await execution.assertScope?.([Permission.Event.Update], { eventId: 'event-a' });
      await execution.assertScope?.([Permission.Event.Update], { eventId: 'event-b' });
      return f.domainWrite();
    });
    await f.service.decide(f.user, 'command-a', {
      decision: 'APPROVE',
      expectedFingerprint: preview.expectedFingerprint,
      review: preview,
    });
    expect(f.scopes.assert).toHaveBeenCalledTimes(2);
    expect(f.domainWrite).not.toHaveBeenCalled();
    expect(f.command()?.state).toBe('UNCERTAIN');
  });

  it('marks a post-commit failure UNCERTAIN and never retries APPLYING or UNCERTAIN', async () => {
    const f = fixture();
    const preview = await f.review();
    f.bridge.execute.mockImplementation(async () => {
      await f.domainWrite();
      throw new Error('response failed after commit');
    });
    const decision: AdminMcpCommandDecision = {
      decision: 'APPROVE',
      expectedFingerprint: preview.expectedFingerprint,
      review: preview,
    };
    await f.service.decide(f.user, 'command-a', decision);
    expect(f.command()?.state).toBe('UNCERTAIN');
    await expect(f.service.decide(f.user, 'command-a', decision)).rejects.toBeInstanceOf(ConflictException);
    f.state('APPLYING');
    await expect(f.service.decide(f.user, 'command-a', decision)).rejects.toBeInstanceOf(ConflictException);
    expect(f.bridge.execute).toHaveBeenCalledTimes(1);
    expect(f.domainWrite).toHaveBeenCalledTimes(1);
  });

  it('allows rejection without a domain call and rejects arbitrary operation documents', async () => {
    const f = fixture();
    await f.propose();
    await f.service.decide(f.user, 'command-a', {
      decision: 'REJECT',
      expectedFingerprint: f.command()?.fingerprint ?? '',
    });
    expect(f.command()?.state).toBe('REJECTED');
    expect(f.bridge.execute).not.toHaveBeenCalled();
    await expect(f.service.read(f.user, f.delegation.id, 'query { event { id } }', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
