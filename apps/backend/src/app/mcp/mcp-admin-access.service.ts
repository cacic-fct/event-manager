import type {
  McpAdminCapability,
  McpAdminDelegation,
  McpDelegationInput,
} from '@cacic-fct/event-manager-mcp-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  type McpAdminDelegation as StoredDelegation,
  type Prisma,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { eventAudienceWhere } from '../audiences/audience-context';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { McpAdminConfig, MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE } from './mcp-admin.config';
import { McpAdminInvalidationService } from './mcp-admin-invalidation.service';
import { assertMcpAccountEligible, mcpUserId } from './shared/principal';

export const MCP_CAPABILITY_PERMISSION = {
  EVENT_READ: Permission.Event.Read,
  ATTENDANCE_READ: Permission.EventAttendance.Read,
  DESCRIPTION_PROPOSE: Permission.Event.Update,
  PREPARATION_READ: Permission.Event.Read,
  MATERIALS_READ: Permission.Event.Update,
  SUBSCRIPTIONS_READ: Permission.Subscription.Read,
  FORMS_READ: Permission.EventForm.Read,
  CONTENT_REVIEWS_READ: Permission.Event.Update,
  EVENT_CONTENT_PROPOSE: Permission.Event.Update,
  LOCATION_PROPOSE: Permission.Event.Update,
  PREPARATION_PROPOSE: Permission.Event.Update,
  LIVESTREAM_PROPOSE: Permission.Event.Update,
} as const satisfies Record<McpAdminCapability, Permission>;

@Injectable()
export class McpAdminAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly audit: AuditLogService,
    private readonly config: McpAdminConfig,
    @Optional() private readonly invalidations?: McpAdminInvalidationService,
  ) {}

  async create(user: AuthenticatedUser, input: McpDelegationInput): Promise<McpAdminDelegation> {
    this.assertEnabled();
    const now = new Date();
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 24 * 60 * 60_000) {
      throw new BadRequestException('A delegação deve expirar nas próximas 24 horas.');
    }
    if (!this.config.allowedClients.includes(input.clientId) || !input.capabilities.includes('EVENT_READ')) {
      throw new BadRequestException('Selecione um aplicativo permitido e inclua a leitura de eventos.');
    }
    if (input.capabilities.some((capability) => capability.endsWith('_PROPOSE')) && !this.config.proposalsEnabled) {
      throw new ForbiddenException('As propostas MCP estão desativadas.');
    }
    const delegation = await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      await this.assertEligible(user, tx);
      const activeCount = await tx.mcpAdminDelegation.count({
        where: { userId: mcpUserId(user), revokedAt: null, expiresAt: { gt: now } },
      });
      if (activeCount >= 10) throw new BadRequestException('Revogue uma delegação antes de criar outra. Limite: 10.');
      for (const eventId of input.eventIds) {
        for (const capability of input.capabilities) {
          await this.assertEventPermission(user, eventId, capability, tx);
        }
      }
      const created = await tx.mcpAdminDelegation.create({
        data: { ...input, userId: mcpUserId(user), resource: this.config.resourceUrl, createdAt: now, expiresAt },
      });
      await this.audit.record(
        {
          entityType: AuditLogEntityType.SYSTEM,
          entityId: created.id,
          entityLabel: 'Delegação MCP',
          operation: AuditLogOperation.CREATE,
          actor: user,
          after: {
            clientId: created.clientId,
            eventIds: created.eventIds,
            capabilities: created.capabilities,
            expiresAt,
          },
          summary: 'Acesso delegado a aplicativo MCP.',
          metadata: {
            source: 'mcp',
            action: 'delegation-created',
            delegationId: created.id,
            clientId: created.clientId,
          },
          squashWindowMs: 0,
        },
        tx,
      );
      return created;
    });
    await this.invalidations?.publish(mcpUserId(user));
    return this.mapDelegation(user, delegation);
  }

  async list(user: AuthenticatedUser): Promise<McpAdminDelegation[]> {
    const now = new Date();
    const userId = mcpUserId(user);
    const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }] as const;
    const [active, history] = await Promise.all([
      this.prisma.mcpAdminDelegation.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: [...orderBy],
        take: 10,
      }),
      this.prisma.mcpAdminDelegation.findMany({
        where: { userId, OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }] },
        orderBy: [...orderBy],
        take: 40,
      }),
    ]);
    // All active grants remain revocable even after many older authorizations.
    const delegations = [...active, ...history];
    if (delegations.length === 0) return [];
    const eventIds = [...new Set(delegations.flatMap((delegation) => delegation.eventIds))];
    const [events, counts] = await Promise.all([
      this.prisma.event.findMany({
        where: { AND: [{ id: { in: eventIds } }, await this.eventWhere(user, Permission.Event.Read)] },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.mcpAdminProposal.groupBy({
        by: ['delegationId'],
        where: { delegationId: { in: delegations.map((delegation) => delegation.id) } },
        _count: { _all: true },
      }),
    ]);
    const countsById = new Map(counts.map((count) => [count.delegationId, count._count._all]));
    return delegations.map((delegation) =>
      this.delegationResponse(
        delegation,
        events.filter((event) => delegation.eventIds.includes(event.id)),
        countsById.get(delegation.id) ?? 0,
      ),
    );
  }

  async revoke(user: AuthenticatedUser, id: string): Promise<void> {
    await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      const delegation = await tx.mcpAdminDelegation.findFirst({ where: { id, userId: mcpUserId(user) } });
      if (!delegation) throw new NotFoundException('Delegação não encontrada.');
      if (delegation.revokedAt) return;
      const revokedAt = new Date();
      await tx.mcpAdminDelegation.update({ where: { id }, data: { revokedAt } });
      await this.audit.record(
        {
          entityType: AuditLogEntityType.SYSTEM,
          entityId: id,
          entityLabel: 'Delegação MCP',
          operation: AuditLogOperation.UPDATE,
          actor: user,
          before: { revokedAt: null },
          after: { revokedAt },
          summary: 'Acesso de aplicativo MCP revogado.',
          metadata: { source: 'mcp', action: 'delegation-revoked', delegationId: id, clientId: delegation.clientId },
          squashWindowMs: 0,
        },
        tx,
      );
    });
    await this.invalidations?.publish(mcpUserId(user));
  }

  async assertToolAccess(
    user: AuthenticatedUser,
    delegationId: string,
    capability: McpAdminCapability,
    eventId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<StoredDelegation> {
    await this.assertEligible(user, tx);
    const requiredScope = capability.endsWith('_PROPOSE') ? MCP_ADMIN_PROPOSE_SCOPE : MCP_ADMIN_READ_SCOPE;
    if (!user.oidcScopeSet.has(requiredScope)) throw new ForbiddenException('Escopo OAuth insuficiente.');
    if (tx) {
      // Concurrent reads/proposals can share the grant; revocation must wait for
      // already admitted writes, or commit before their fresh admission check.
      await tx.$executeRaw`
        SELECT "id" FROM "mcp_admin_delegations"
        WHERE "id" = ${delegationId} AND "userId" = ${mcpUserId(user)} AND "clientId" = ${String(user.claims['azp'])}
        FOR SHARE
      `;
    }
    const delegation = await (tx ?? this.prisma).mcpAdminDelegation.findFirst({
      where: { id: delegationId, userId: mcpUserId(user), clientId: String(user.claims['azp']) },
    });
    if (!delegation) throw new ForbiddenException('Delegação MCP indisponível.');
    this.assertActive(delegation, capability, eventId);
    if (eventId) await this.assertEventPermission(user, eventId, capability, tx);
    return delegation;
  }

  async assertEligible(user: AuthenticatedUser, tx?: Prisma.TransactionClient): Promise<void> {
    await assertMcpAccountEligible(user, tx ?? this.prisma);
  }

  assertActive(delegation: StoredDelegation, capability: McpAdminCapability, eventId?: string): void {
    this.assertEnabled();
    if (
      delegation.revokedAt ||
      delegation.expiresAt <= new Date() ||
      delegation.resource !== this.config.resourceUrl ||
      !this.config.allowedClients.includes(delegation.clientId) ||
      !delegation.capabilities.includes(capability) ||
      (eventId !== undefined && !delegation.eventIds.includes(eventId)) ||
      (capability.endsWith('_PROPOSE') && !this.config.proposalsEnabled)
    ) {
      throw new ForbiddenException('Delegação expirada, revogada ou sem acesso à operação neste evento.');
    }
  }

  async assertEventPermission(
    user: AuthenticatedUser,
    eventId: string,
    capability: McpAdminCapability,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const authorization = tx ? this.authorization.forTransaction(tx) : this.authorization;
    await authorization.assertPermissions(user, [Permission.Event.Read, MCP_CAPABILITY_PERMISSION[capability]], {
      eventId,
    });
    const exists = await (tx ?? this.prisma).event.findFirst({
      where: { AND: [{ id: eventId }, await this.eventWhere(user, Permission.Event.Read, tx)] },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Evento indisponível.');
  }

  async eventWhere(
    user: AuthenticatedUser,
    permission: Permission,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.EventWhereInput> {
    const authorization = tx ? this.authorization.forTransaction(tx) : this.authorization;
    const targets = await authorization.accessibleEventTargets(user, permission);
    const scoped: Prisma.EventWhereInput =
      targets === null
        ? {}
        : {
            OR: [
              { id: { in: [...targets.eventIds] } },
              { eventGroupId: { in: [...targets.eventGroupIds] } },
              { majorEventId: { in: [...targets.majorEventIds] } },
              { eventGroup: { is: { majorEventId: { in: [...targets.majorEventIds] } } } },
            ],
          };
    return {
      AND: [
        { deletedAt: null },
        { OR: [{ majorEventId: null }, { majorEvent: { is: { deletedAt: null } } }] },
        {
          OR: [
            { eventGroupId: null },
            {
              eventGroup: {
                is: {
                  deletedAt: null,
                  OR: [{ majorEventId: null }, { majorEvent: { is: { deletedAt: null } } }],
                },
              },
            },
          ],
        },
        eventAudienceWhere(),
        scoped,
      ],
    };
  }

  private assertEnabled(): void {
    if (!this.config.enabled) throw new ForbiddenException('O MCP administrativo está desativado.');
  }

  private async mapDelegation(user: AuthenticatedUser, delegation: StoredDelegation): Promise<McpAdminDelegation> {
    const [events, proposalCount] = await Promise.all([
      this.prisma.event.findMany({
        where: { AND: [{ id: { in: delegation.eventIds } }, await this.eventWhere(user, Permission.Event.Read)] },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.mcpAdminProposal.count({ where: { delegationId: delegation.id } }),
    ]);
    return this.delegationResponse(delegation, events, proposalCount);
  }

  private delegationResponse(
    delegation: StoredDelegation,
    events: { id: string; name: string }[],
    proposalCount: number,
  ): McpAdminDelegation {
    return {
      id: delegation.id,
      clientId: delegation.clientId,
      eventIds: delegation.eventIds,
      capabilities: delegation.capabilities,
      expiresAt: delegation.expiresAt.toISOString(),
      createdAt: delegation.createdAt.toISOString(),
      revokedAt: delegation.revokedAt?.toISOString() ?? null,
      maxProposals: delegation.maxProposals,
      events,
      proposalCount,
    };
  }
}
