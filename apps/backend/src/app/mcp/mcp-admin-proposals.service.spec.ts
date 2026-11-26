import type { McpEventReviewInput, McpProposalDecisionInput } from '@cacic-fct/event-manager-mcp-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, type McpAdminDelegation, Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { SportsBackingResourceLifecycleService } from '../sports/sports-backing-resource-lifecycle.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminConfig } from './mcp-admin.config';
import { McpAdminInvalidationService } from './mcp-admin-invalidation.service';
import { McpAdminProposalsService } from './mcp-admin-proposals.service';

const { jest } = import.meta;

function principal(): AuthenticatedUser {
  return {
    sub: 'user-1',
    token: 'unused',
    preferredUsername: 'author',
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    claims: {},
  };
}

function context() {
  const now = new Date();
  const storedDelegation: McpAdminDelegation = {
    id: 'delegation-1',
    userId: 'user-1',
    clientId: 'mcp-client',
    resource: 'https://events.example/api/mcp/admin',
    eventIds: ['event-1'],
    capabilities: ['EVENT_READ', 'DESCRIPTION_PROPOSE'],
    maxProposals: 2,
    createdAt: now,
    expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    revokedAt: null,
  };
  const event = {
    id: 'event-1',
    name: 'Evento revisado',
    description: 'Descrição anterior',
    updatedAt: now,
    createdAt: now,
    endDate: now,
    eventGroupId: null,
    majorEventId: null,
    publicationState: 'PUBLISHED',
  };
  const storedProposal = {
    id: 'proposal-1',
    delegationId: storedDelegation.id,
    delegation: storedDelegation,
    eventId: event.id,
    event,
    idempotencyKey: 'idempotency-1',
    descriptionBefore: event.description,
    descriptionAfter: 'Descrição aprovada',
    baseUpdatedAt: now,
    state: 'PENDING',
    createdAt: now,
    expiresAt: new Date(Date.now() + 60 * 60_000),
    decidedAt: null,
    approvedById: null,
    approvedByName: null,
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    event: { findFirst: jest.fn().mockResolvedValue(event), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Autora Humana' }) },
    mcpAdminProposal: {
      findMany: jest.fn().mockResolvedValue([storedProposal]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(storedProposal),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(storedProposal),
      update: jest.fn().mockResolvedValue(storedProposal),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    mcpEventContentSync: { upsert: jest.fn().mockResolvedValue({ eventId: event.id, revision: 1 }) },
  };
  let committed = false;
  const prisma = {
    mcpAdminProposal: tx.mcpAdminProposal,
    $transaction: jest.fn(async (operation: (client: Prisma.TransactionClient) => Promise<unknown>) => {
      const result = await operation(tx as unknown as Prisma.TransactionClient);
      committed = true;
      return result;
    }),
  };
  const access = {
    eventWhere: jest.fn().mockResolvedValue({ deletedAt: null }),
    assertToolAccess: jest.fn().mockResolvedValue(storedDelegation),
    assertEligible: jest.fn().mockResolvedValue(undefined),
    assertEventPermission: jest.fn().mockResolvedValue(undefined),
    assertActive: jest.fn(),
  };
  const frozenPolicy = { assertEventUpdateMutable: jest.fn().mockResolvedValue(undefined) };
  const frozen = {
    assertLoadedEventMutable: jest.fn().mockResolvedValue(undefined),
    forTransaction: jest.fn().mockReturnValue(frozenPolicy),
  };
  const sports = { assertEventUpdateAllowed: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const config = {
    resourceUrl: storedDelegation.resource,
    applicationOrigin: 'https://events.example',
    proposalsEnabled: true,
  };
  const invalidations = { publish: jest.fn().mockResolvedValue(undefined) };
  const service = new McpAdminProposalsService(
    prisma as unknown as PrismaService,
    access as unknown as McpAdminAccessService,
    frozen as unknown as FrozenResourceService,
    sports as unknown as SportsBackingResourceLifecycleService,
    audit as unknown as AuditLogService,
    config as McpAdminConfig,
    invalidations as unknown as McpAdminInvalidationService,
  );
  const input = {
    delegationId: storedDelegation.id,
    eventId: event.id,
    idempotencyKey: storedProposal.idempotencyKey,
    expectedUpdatedAt: now.toISOString(),
    description: storedProposal.descriptionAfter,
  };
  const decision = { decision: 'APPROVE' as const, expectedUpdatedAt: now.toISOString() };
  return {
    service,
    user: principal(),
    input,
    decision,
    tx,
    prisma,
    access,
    frozen,
    frozenPolicy,
    sports,
    audit,
    event,
    storedProposal,
    storedDelegation,
    config,
    invalidations,
    committed: () => committed,
  };
}

describe('McpAdminProposalsService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('returns an existing location proposal as stale before validating the changed event', async () => {
    const f = context();
    const proposal = {
      ...f.storedProposal,
      operation: 'EVENT_LOCATION',
      afterValues: { locationName: 'Sala B' },
      beforeValues: { locationName: 'Sala A' },
    };
    f.tx.mcpAdminProposal.findUnique.mockResolvedValue(proposal);
    const updatedAt = new Date(Date.now() + 1000);
    f.tx.event.findFirst.mockResolvedValue({ ...f.event, isVirtual: true, updatedAt });
    f.event.updatedAt = updatedAt;
    const input = {
      delegationId: f.input.delegationId,
      eventId: f.input.eventId,
      idempotencyKey: f.input.idempotencyKey,
      expectedUpdatedAt: f.input.expectedUpdatedAt,
      changes: { locationName: 'Sala B' },
    };
    await expect(f.service.proposeChange(f.user, 'EVENT_LOCATION', input)).resolves.toMatchObject({
      proposalId: proposal.id,
      state: 'STALE',
    });
    expect(f.tx.mcpAdminProposal.create).not.toHaveBeenCalled();
    f.tx.mcpAdminProposal.findUnique.mockResolvedValue(null);
    await expect(
      f.service.proposeChange(f.user, 'EVENT_LOCATION', {
        ...input,
        expectedUpdatedAt: f.event.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  function editedContext() {
    const ctx = context();
    const input: McpEventReviewInput = {
      expectedOperation: 'EVENT_CONTENT',
      expectedUpdatedAt: ctx.decision.expectedUpdatedAt,
      selections: [{ field: 'description', value: '  Descrição ajustada pela autora.  ' }],
    };
    const stored = {
      ...ctx.storedProposal,
      operation: 'EVENT_CONTENT',
      beforeValues: { name: ctx.event.name, description: ctx.event.description },
      afterValues: { name: 'Novo nome proposto', description: ctx.storedProposal.descriptionAfter },
    };
    ctx.tx.mcpAdminProposal.findFirst.mockResolvedValue(stored);
    async function reviewDecision(): Promise<McpProposalDecisionInput> {
      const preview = await ctx.service.prepareReview(ctx.user, stored.id, input);
      return {
        decision: 'APPROVE',
        expectedOperation: input.expectedOperation,
        expectedUpdatedAt: input.expectedUpdatedAt,
        review: { token: preview.token, selections: input.selections },
      };
    }
    return { ...ctx, input, stored, reviewDecision };
  }

  it('shows the normalized selected patch and audits an adjusted approval without rewriting the proposal', async () => {
    const { service, user, input, stored, tx, access, frozenPolicy, sports, audit, event } = editedContext();
    const preview = await service.prepareReview(user, stored.id, input);

    expect(preview.changes).toEqual([
      {
        field: 'description',
        label: 'Descrição',
        before: event.description,
        after: 'Descrição ajustada pela autora.',
      },
    ]);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(tx.mcpAdminProposal.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();

    await service.decide(user, stored.id, {
      decision: 'APPROVE',
      expectedOperation: input.expectedOperation,
      expectedUpdatedAt: input.expectedUpdatedAt,
      review: { token: preview.token, selections: input.selections },
    });

    expect(access.assertEventPermission).toHaveBeenCalledTimes(2);
    expect(frozenPolicy.assertEventUpdateMutable).toHaveBeenCalledTimes(2);
    expect(sports.assertEventUpdateAllowed).toHaveBeenLastCalledWith(tx, event.id, {
      description: 'Descrição ajustada pela autora.',
    });
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: { id: event.id, deletedAt: null, updatedAt: event.updatedAt, description: event.description },
      data: { description: 'Descrição ajustada pela autora.', updatedById: user.sub },
    });
    expect(tx.mcpAdminProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: 'APPLIED', decidedAt: new Date(), approvedById: user.sub, approvedByName: 'Autora Humana' },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Alteração MCP ajustada e aprovada por Autora Humana.',
        before: { description: event.description },
        after: { description: 'Descrição ajustada pela autora.' },
        metadata: expect.objectContaining({
          source: 'mcp',
          proposalId: stored.id,
          delegationId: stored.delegationId,
          clientId: stored.delegation.clientId,
          proposedById: stored.delegation.userId,
          approvedById: user.sub,
          approvedByName: 'Autora Humana',
          review: { selectedFields: ['description'], discardedFields: ['name'], editedFields: ['description'] },
        }),
      }),
      tx,
    );
  });

  it.each([
    'another selection',
    'modified value',
    'proposal',
    'event target',
    'author',
    'client',
    'publication',
    'original',
    'base revision',
    'expired token',
  ])('rejects a preview replay with %s before claiming or mutating', async (change) => {
    const { service, user, stored, tx, audit, event, reviewDecision } = editedContext();
    const decision = await reviewDecision();
    const review = decision.review;
    if (!review) throw new Error('Missing signed review fixture');
    if (change === 'another selection') review.selections = [{ field: 'name' }];
    if (change === 'modified value') review.selections = [{ field: 'description', value: 'Texto diferente' }];
    if (change === 'proposal') stored.id = 'other-proposal';
    if (change === 'event target') stored.eventId = 'other-event';
    if (change === 'author') stored.delegation.userId = 'other-author';
    if (change === 'client') stored.delegation.clientId = 'other-client';
    if (change === 'publication') event.publicationState = 'UNPUBLISHED';
    if (change === 'original') stored.afterValues.name = 'Proposta diferente';
    if (change === 'base revision') {
      stored.baseUpdatedAt = new Date(Date.now() + 1);
      event.updatedAt = stored.baseUpdatedAt;
      decision.expectedUpdatedAt = stored.baseUpdatedAt.toISOString();
    }
    if (change === 'expired token') jest.setSystemTime(Date.now() + 11 * 60_000);

    await expect(service.decide(user, stored.id, decision)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.mcpAdminProposal.updateMany).not.toHaveBeenCalled();
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each(['permission', 'frozen', 'revoked', 'expired', 'stale'])(
    'rechecks %s after preparing a review',
    async (failure) => {
      const { service, user, stored, tx, access, frozenPolicy, event, reviewDecision } = editedContext();
      const decision = await reviewDecision();
      if (failure === 'permission') access.assertEventPermission.mockRejectedValue(new ForbiddenException());
      if (failure === 'frozen') frozenPolicy.assertEventUpdateMutable.mockRejectedValue(new ForbiddenException());
      if (failure === 'revoked') stored.delegation.revokedAt = new Date();
      if (failure === 'expired') stored.expiresAt = new Date();
      if (failure === 'stale') event.updatedAt = new Date(Date.now() + 1);

      await expect(service.decide(user, stored.id, decision)).rejects.toThrow();
      expect(tx.event.updateMany).not.toHaveBeenCalled();
    },
  );

  it('denies MCP principals before preview and decision reads or writes', async () => {
    const { service, user, stored, input, tx, reviewDecision } = editedContext();
    const decision = await reviewDecision();
    tx.mcpAdminProposal.findFirst.mockClear();
    user.authenticationTransport = 'mcp';
    await expect(service.prepareReview(user, stored.id, input)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.decide(user, stored.id, decision)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.mcpAdminProposal.findFirst).not.toHaveBeenCalled();
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it('returns a review link on the configured application origin without changing OAuth resource binding', async () => {
    const { service, config, user, input, access, storedDelegation } = context();
    config.applicationOrigin = 'https://admin.example';

    const result = await service.propose(user, input);

    expect(result.reviewUrl).toBe('https://admin.example/admin/mcp?id=proposal-1');
    expect(access.assertToolAccess).toHaveBeenCalledWith(
      user,
      storedDelegation.id,
      'DESCRIPTION_PROPOSE',
      input.eventId,
      expect.anything(),
    );
  });

  it('evaluates a queue page from loaded freeze dates without per-event database reads', async () => {
    const { service, user, tx, storedProposal, event, frozen, frozenPolicy, access } = context();
    tx.mcpAdminProposal.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        ...storedProposal,
        id: `proposal-${index}`,
        event: { ...event, id: `event-${index}` },
        eventId: `event-${index}`,
      })),
    );

    const result = await service.list(user, 0);

    expect(result.items).toHaveLength(20);
    expect(result.items.every((proposal) => proposal.canApprove)).toBe(true);
    expect(frozen.assertLoadedEventMutable).toHaveBeenCalledTimes(20);
    expect(frozen.assertLoadedEventMutable).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: event.createdAt, endDate: event.endDate }),
      user,
      'edit',
    );
    expect(tx.event.findFirst).not.toHaveBeenCalled();
    expect(frozenPolicy.assertEventUpdateMutable).not.toHaveBeenCalled();
    expect(access.eventWhere).toHaveBeenCalledTimes(2);
  });

  it('checks approval expiry using the decision time after acquiring the proposal lock', async () => {
    const { service, user, decision, storedProposal, tx } = context();
    tx.$executeRaw
      .mockImplementationOnce(async () => 1)
      .mockImplementationOnce(async () => {
        jest.setSystemTime(storedProposal.expiresAt);
        return 1;
      });

    await expect(service.decide(user, storedProposal.id, decision)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(tx.mcpAdminProposal.updateMany).not.toHaveBeenCalled();
  });

  it('creates a proposal without updating the event and audits submission in the transaction', async () => {
    const { service, user, input, tx, access, audit, frozenPolicy, sports } = context();

    const result = await service.propose(user, input);

    expect(result).toEqual(expect.objectContaining({ proposalId: 'proposal-1', appliesAutomatically: false }));
    expect(access.assertToolAccess).toHaveBeenCalledWith(
      user,
      input.delegationId,
      'DESCRIPTION_PROPOSE',
      input.eventId,
      tx,
    );
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(tx.mcpAdminProposal.create).toHaveBeenCalledWith({
      data: {
        delegationId: input.delegationId,
        eventId: input.eventId,
        idempotencyKey: input.idempotencyKey,
        descriptionBefore: 'Descrição anterior',
        descriptionAfter: input.description,
        baseUpdatedAt: new Date(input.expectedUpdatedAt),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    expect(frozenPolicy.assertEventUpdateMutable).toHaveBeenCalledWith(input.eventId, {}, user);
    expect(sports.assertEventUpdateAllowed).toHaveBeenCalledWith(tx, input.eventId, { description: input.description });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.SUBMIT,
        metadata: {
          source: 'mcp',
          proposalId: 'proposal-1',
          delegationId: input.delegationId,
          clientId: 'mcp-client',
          proposedById: user.sub,
        },
        squashWindowMs: 0,
      }),
      tx,
    );
  });

  it('denies proposal creation when actual target permissions fail', async () => {
    const { service, user, input, access, tx } = context();
    access.assertToolAccess.mockRejectedValue(new ForbiddenException());

    await expect(service.propose(user, input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.mcpAdminProposal.create).not.toHaveBeenCalled();
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it('returns an identical idempotent retry without quota consumption or duplicate audit', async () => {
    const { service, user, input, storedProposal, tx, audit } = context();
    tx.mcpAdminProposal.findUnique.mockResolvedValue(storedProposal);

    await expect(service.propose(user, input)).resolves.toEqual(
      expect.objectContaining({ proposalId: storedProposal.id }),
    );
    expect(tx.mcpAdminProposal.count).not.toHaveBeenCalled();
    expect(tx.mcpAdminProposal.create).not.toHaveBeenCalled();
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each(['STALE', 'EXPIRED'])('reports effective %s state for an idempotent retry', async (state) => {
    const { service, user, input, storedProposal, event, tx, audit } = context();
    tx.mcpAdminProposal.findUnique.mockResolvedValue(storedProposal);
    if (state === 'STALE') event.description = 'Descrição alterada após o envio';
    if (state === 'EXPIRED') storedProposal.expiresAt = new Date();

    await expect(service.propose(user, input)).resolves.toEqual(expect.objectContaining({ state }));
    expect(tx.mcpAdminProposal.create).not.toHaveBeenCalled();
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('retries a serialization conflict and reuses the previously committed idempotent proposal', async () => {
    const { service, user, input, storedProposal, prisma, tx, audit } = context();
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Concurrent transaction conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    tx.mcpAdminProposal.findUnique.mockResolvedValue(storedProposal);

    const pending = service.propose(user, input);
    await jest.runAllTimersAsync();

    await expect(pending).resolves.toEqual(expect.objectContaining({ proposalId: storedProposal.id }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.mcpAdminProposal.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each(['event', 'description', 'revision'])('rejects an idempotency key reused for another %s', async (field) => {
    const { service, user, input, storedProposal, tx, audit } = context();
    tx.mcpAdminProposal.findUnique.mockResolvedValue(storedProposal);
    if (field === 'event') input.eventId = 'other-event';
    if (field === 'description') input.description = 'Outra descrição';
    if (field === 'revision') input.expectedUpdatedAt = new Date(Date.now() - 1).toISOString();

    await expect(service.propose(user, input)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(tx.mcpAdminProposal.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('enforces proposal quota before reading event content or creating a row', async () => {
    const { service, user, input, storedDelegation, tx } = context();
    tx.mcpAdminProposal.count.mockResolvedValue(storedDelegation.maxProposals);
    await expect(service.propose(user, input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.event.findFirst).not.toHaveBeenCalled();
    expect(tx.mcpAdminProposal.create).not.toHaveBeenCalled();
  });

  it('rejects a stale proposal base and a proposal that changes nothing', async () => {
    const { service, user, input, event, tx } = context();
    await expect(
      service.propose(user, {
        ...input,
        expectedUpdatedAt: new Date(Date.now() - 1).toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.propose(user, { ...input, description: event.description })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.mcpAdminProposal.create).not.toHaveBeenCalled();
  });

  it('applies only stored description fields after current access and mutable-resource checks', async () => {
    const { service, user, decision, tx, access, frozen, frozenPolicy, sports, audit, storedProposal } = context();

    const attemptedOverride = {
      ...decision,
      eventId: 'attacker-selected-event',
      descriptionAfter: 'Texto fora da proposta armazenada',
      publicationState: 'UNPUBLISHED',
    };
    await service.decide(user, storedProposal.id, attemptedOverride);

    expect(access.assertEligible).toHaveBeenCalledWith(user, tx);
    expect(access.assertEventPermission).toHaveBeenCalledWith(user, storedProposal.eventId, 'DESCRIPTION_PROPOSE', tx);
    expect(access.assertActive).toHaveBeenCalledWith(
      storedProposal.delegation,
      'DESCRIPTION_PROPOSE',
      storedProposal.eventId,
    );
    expect(frozen.forTransaction).toHaveBeenCalledWith(tx);
    expect(frozenPolicy.assertEventUpdateMutable).toHaveBeenCalledWith(storedProposal.eventId, {}, user);
    expect(sports.assertEventUpdateAllowed).toHaveBeenCalledWith(tx, storedProposal.eventId, {
      description: storedProposal.descriptionAfter,
    });
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: {
        id: storedProposal.eventId,
        deletedAt: null,
        updatedAt: storedProposal.baseUpdatedAt,
        description: storedProposal.descriptionBefore,
      },
      data: { description: storedProposal.descriptionAfter, updatedById: user.sub },
    });
    expect(tx.mcpAdminProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: 'APPLIED', decidedAt: new Date(), approvedById: user.sub, approvedByName: 'Autora Humana' },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT,
        operation: AuditLogOperation.UPDATE,
        before: { description: storedProposal.descriptionBefore },
        after: { description: storedProposal.descriptionAfter },
        summary: 'Alteração MCP aprovada por Autora Humana.',
        scope: {
          permission: Permission.Event.Update,
          eventId: storedProposal.eventId,
          eventGroupId: null,
          majorEventId: null,
        },
        metadata: {
          source: 'mcp',
          proposalId: storedProposal.id,
          delegationId: storedProposal.delegationId,
          clientId: storedProposal.delegation.clientId,
          proposedById: storedProposal.delegation.userId,
          approvedById: user.sub,
          approvedByName: 'Autora Humana',
          effects: 'EVENT_DESCRIPTION',
          operation: 'EVENT_DESCRIPTION',
        },
        squashWindowMs: 0,
      }),
      tx,
    );
    expect(tx.mcpEventContentSync.upsert).toHaveBeenCalledWith({
      where: { eventId: storedProposal.eventId },
      create: { eventId: storedProposal.eventId },
      update: { revision: { increment: 1 } },
    });
  });

  it.each(['displayed revision', 'event revision', 'event description', 'expired', 'replayed'])(
    'rejects approval with %s before event mutation',
    async (condition) => {
      const { service, user, decision, event, storedProposal, tx, audit } = context();
      if (condition === 'displayed revision') decision.expectedUpdatedAt = new Date(Date.now() - 1).toISOString();
      if (condition === 'event revision') event.updatedAt = new Date(Date.now() + 1);
      if (condition === 'event description') event.description = 'Alterada fora da proposta';
      if (condition === 'expired') storedProposal.expiresAt = new Date();
      if (condition === 'replayed') storedProposal.state = 'APPLIED';

      await expect(service.decide(user, storedProposal.id, decision)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.event.updateMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it.each(['eligibility', 'permission', 'delegation', 'frozen', 'sports'])(
    'rechecks current %s during approval',
    async (condition) => {
      const { service, user, decision, access, frozenPolicy, sports, storedProposal, tx } = context();
      const denied = new ForbiddenException('Current policy denied');
      if (condition === 'eligibility') access.assertEligible.mockRejectedValue(denied);
      if (condition === 'permission') access.assertEventPermission.mockRejectedValue(denied);
      if (condition === 'delegation')
        access.assertActive.mockImplementation(() => {
          throw denied;
        });
      if (condition === 'frozen') frozenPolicy.assertEventUpdateMutable.mockRejectedValue(denied);
      if (condition === 'sports') sports.assertEventUpdateAllowed.mockRejectedValue(denied);

      await expect(service.decide(user, storedProposal.id, decision)).rejects.toBe(denied);
      expect(tx.event.updateMany).not.toHaveBeenCalled();
    },
  );

  it('checks expiry after acquiring the proposal lock, using one decision timestamp', async () => {
    const { service, user, decision, storedProposal, tx } = context();
    const afterWait = new Date(storedProposal.expiresAt.getTime() + 1);
    tx.$executeRaw.mockImplementation(async (parts: TemplateStringsArray) => {
      if (parts.join('').includes('FOR UPDATE OF p')) jest.setSystemTime(afterWait);
      return 1;
    });

    await expect(service.decide(user, storedProposal.id, decision)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it('evaluates queued freeze state from the loaded event without per-row event reads', async () => {
    const { service, user, tx, frozen, storedProposal } = context();

    const result = await service.list(user, 0);

    expect(result.items[0]?.canApprove).toBe(true);
    expect(frozen.assertLoadedEventMutable).toHaveBeenCalledWith(storedProposal.event, user, 'edit');
    expect(tx.event.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a lost concurrent proposal claim without updating event or audit', async () => {
    const { service, user, decision, storedProposal, tx, audit } = context();
    tx.mcpAdminProposal.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.decide(user, storedProposal.id, decision)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(tx.mcpEventContentSync.upsert).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a lost event revision comparison without scheduling effects or recording success', async () => {
    const { service, user, decision, storedProposal, tx, audit, committed } = context();
    tx.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.decide(user, storedProposal.id, decision)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.mcpEventContentSync.upsert).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(committed()).toBe(false);
  });

  it('propagates audit failure from the same transaction without a successful commit', async () => {
    const { service, user, decision, storedProposal, tx, audit, committed } = context();
    const failure = new Error('Audit unavailable');
    audit.record.mockRejectedValue(failure);

    await expect(service.decide(user, storedProposal.id, decision)).rejects.toBe(failure);
    expect(audit.record).toHaveBeenCalledWith(expect.any(Object), tx);
    expect(committed()).toBe(false);
  });

  it('rejects a proposal without changing description or scheduling projections', async () => {
    const { service, user, decision, storedProposal, tx, audit } = context();

    await service.decide(user, storedProposal.id, { ...decision, decision: 'REJECT' });

    expect(tx.mcpAdminProposal.update).toHaveBeenCalledWith({
      where: { id: storedProposal.id },
      data: { state: 'REJECTED', decidedAt: new Date() },
    });
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(tx.mcpEventContentSync.upsert).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.REJECT,
        squashWindowMs: 0,
      }),
      tx,
    );
  });

  it('publishes proposal creation only after its audit and transaction commit', async () => {
    const { service, user, input, audit, invalidations, committed } = context();
    audit.record.mockImplementation(async () => {
      expect(invalidations.publish).not.toHaveBeenCalled();
    });
    invalidations.publish.mockImplementation(async () => {
      expect(committed()).toBe(true);
    });

    await service.propose(user, input);

    expect(invalidations.publish).toHaveBeenCalledTimes(1);
    expect(invalidations.publish).toHaveBeenCalledWith(user.sub);
  });

  it('does not publish a proposal that failed its audit transaction', async () => {
    const { service, user, input, audit, invalidations, committed } = context();
    audit.record.mockRejectedValue(new Error('Audit unavailable'));

    await expect(service.propose(user, input)).rejects.toThrow('Audit unavailable');
    expect(committed()).toBe(false);
    expect(invalidations.publish).not.toHaveBeenCalled();
  });

  it.each(['APPROVE', 'REJECT'] as const)(
    'publishes %s only after the decision transaction commits',
    async (decisionKind) => {
      const { service, user, decision, storedProposal, audit, invalidations, committed } = context();
      audit.record.mockImplementation(async () => {
        expect(invalidations.publish).not.toHaveBeenCalled();
      });
      invalidations.publish.mockImplementation(async () => {
        expect(committed()).toBe(true);
      });

      await service.decide(user, storedProposal.id, { ...decision, decision: decisionKind });

      expect(invalidations.publish).toHaveBeenCalledTimes(1);
      expect(invalidations.publish).toHaveBeenCalledWith(user.sub);
    },
  );

  it('does not publish a decision after an audit failure rejects its transaction', async () => {
    const { service, user, decision, storedProposal, audit, invalidations } = context();
    audit.record.mockRejectedValue(new Error('Audit unavailable'));

    await expect(service.decide(user, storedProposal.id, decision)).rejects.toThrow('Audit unavailable');
    expect(invalidations.publish).not.toHaveBeenCalled();
  });

  it('allows idempotent retry after successful notification without duplicating the business write', async () => {
    const { service, user, input, storedProposal, tx, audit, invalidations } = context();
    tx.mcpAdminProposal.findUnique.mockResolvedValueOnce(null).mockResolvedValue(storedProposal);

    const initial = await service.propose(user, input);
    const retried = await service.propose(user, input);

    expect(retried).toEqual(initial);
    expect(tx.mcpAdminProposal.create).toHaveBeenCalledTimes(1);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(invalidations.publish).toHaveBeenCalledWith(user.sub);
  });
});
