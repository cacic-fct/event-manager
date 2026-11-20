import type {
  McpAdminProposal,
  McpAdminProposalPage,
  McpProposalDecisionInput,
  McpProposalStatus,
} from '@cacic-fct/event-manager-mcp-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, type Prisma } from '@prisma/client';
import { type z } from 'zod';
import { AuditLogService } from '../audit-log/audit-log.service';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { SportsBackingResourceLifecycleService } from '../sports/sports-backing-resource-lifecycle.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminConfig } from './mcp-admin.config';
import { MCP_EVENT_SELECT } from './mcp-admin-read.service';
import { mcpDescriptionProposalSchema } from './mcp-admin.schemas';
import { McpAdminInvalidationService } from './mcp-admin-invalidation.service';
import { mcpUserId } from './mcp-admin-principal';

const PROPOSAL_INCLUDE = {
  delegation: true,
  event: { select: { ...MCP_EVENT_SELECT, createdAt: true } },
} satisfies Prisma.McpAdminProposalInclude;
type StoredProposal = Prisma.McpAdminProposalGetPayload<{ include: typeof PROPOSAL_INCLUDE }>;

export function mcpProposalEffects(publicationState: string): string {
  return publicationState === 'PUBLISHED'
    ? 'Ao aprovar, a descrição publicada será atualizada. A aprovação não altera a publicação nem envia notificações.'
    : 'Ao aprovar, somente a descrição será atualizada. O evento manterá sua situação de publicação, sem envio de notificações.';
}

@Injectable()
export class McpAdminProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: McpAdminAccessService,
    private readonly frozen: FrozenResourceService,
    private readonly sports: SportsBackingResourceLifecycleService,
    private readonly audit: AuditLogService,
    private readonly config: McpAdminConfig,
    @Optional() private readonly invalidations?: McpAdminInvalidationService,
  ) {}

  async propose(user: AuthenticatedUser, input: z.infer<typeof mcpDescriptionProposalSchema>) {
    const proposal = await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      const delegation = await this.access.assertToolAccess(
        user,
        input.delegationId,
        'DESCRIPTION_PROPOSE',
        input.eventId,
        tx,
      );
      const existing = await tx.mcpAdminProposal.findUnique({
        where: { delegationId_idempotencyKey: { delegationId: delegation.id, idempotencyKey: input.idempotencyKey } },
        include: PROPOSAL_INCLUDE,
      });
      if (existing) {
        if (
          existing.eventId !== input.eventId ||
          existing.descriptionAfter !== input.description ||
          existing.baseUpdatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()
        ) {
          throw new ConflictException('A chave de idempotência já corresponde a outra proposta.');
        }
        return this.toolProposal(existing.id, this.proposalStatus(existing), existing.expiresAt);
      }
      const proposalCount = await tx.mcpAdminProposal.count({ where: { delegationId: delegation.id } });
      if (proposalCount >= delegation.maxProposals)
        throw new ForbiddenException('Limite de propostas desta delegação atingido.');
      const event = await tx.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
        select: MCP_EVENT_SELECT,
      });
      if (!event) throw new NotFoundException('Evento indisponível.');
      if ((event.description?.length ?? 0) > 20000)
        throw new BadRequestException('Esta descrição excede o limite MCP. Edite-a pela aplicação.');
      if (event.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
        throw new ConflictException('O evento mudou. Consulte a revisão atual e prepare uma nova proposta.');
      }
      if (event.description === input.description)
        throw new BadRequestException('A proposta não altera a descrição atual.');
      await this.frozen.forTransaction(tx).assertEventUpdateMutable(event.id, {}, user);
      await this.sports.assertEventUpdateAllowed(tx, event.id, { description: input.description });
      const created = await tx.mcpAdminProposal.create({
        data: {
          delegationId: delegation.id,
          eventId: event.id,
          idempotencyKey: input.idempotencyKey,
          descriptionBefore: event.description,
          descriptionAfter: input.description,
          baseUpdatedAt: event.updatedAt,
          expiresAt: new Date(Math.min(delegation.expiresAt.getTime(), Date.now() + 60 * 60_000)),
        },
      });
      await this.audit.record(
        {
          entityType: AuditLogEntityType.SYSTEM,
          entityId: created.id,
          entityLabel: 'Proposta MCP',
          operation: AuditLogOperation.SUBMIT,
          actor: user,
          after: { state: 'PENDING', eventId: event.id, field: 'description', expiresAt: created.expiresAt },
          scope: {
            permission: Permission.Event.Update,
            eventId: event.id,
            eventGroupId: event.eventGroupId,
            majorEventId: event.majorEventId,
          },
          summary: 'Alteração MCP enviada para revisão, sem modificar o evento.',
          metadata: {
            source: 'mcp',
            proposalId: created.id,
            delegationId: delegation.id,
            clientId: delegation.clientId,
            proposedById: user.sub,
          },
          squashWindowMs: 0,
        },
        tx,
      );
      return this.toolProposal(created.id, created.state, created.expiresAt);
    });
    await this.invalidations?.publish(mcpUserId(user));
    return proposal;
  }

  async list(user: AuthenticatedUser, page: number, id?: string): Promise<McpAdminProposalPage> {
    const proposals = await this.prisma.mcpAdminProposal.findMany({
      where: {
        ...(id ? { id } : {}),
        delegation: { is: { userId: mcpUserId(user) } },
        event: {
          is: {
            AND: [
              await this.access.eventWhere(user, Permission.Event.Read),
              await this.access.eventWhere(user, Permission.Event.Update),
            ],
          },
        },
      },
      include: PROPOSAL_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page * 20,
      take: 21,
    });
    return {
      items: await Promise.all(proposals.slice(0, 20).map((proposal) => this.mapProposal(proposal, user))),
      hasMore: proposals.length > 20,
    };
  }

  async status(user: AuthenticatedUser, delegationId: string, id: string) {
    const proposal = await this.prisma.mcpAdminProposal.findFirst({
      where: {
        id,
        delegationId,
        delegation: { is: { userId: mcpUserId(user), clientId: String(user.claims['azp']) } },
      },
      include: PROPOSAL_INCLUDE,
    });
    if (!proposal) throw new NotFoundException('Proposta indisponível.');
    await this.access.assertToolAccess(user, delegationId, 'DESCRIPTION_PROPOSE', proposal.eventId);
    return this.toolProposal(proposal.id, this.proposalStatus(proposal), proposal.expiresAt);
  }

  async decide(user: AuthenticatedUser, id: string, input: McpProposalDecisionInput): Promise<string | null> {
    const eventId = await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      await this.access.assertEligible(user, tx);
      await tx.$executeRaw`
        SELECT d."id" FROM "mcp_admin_delegations" d
        JOIN "mcp_admin_proposals" p ON p."delegationId" = d."id"
        WHERE p."id" = ${id} AND d."userId" = ${mcpUserId(user)}
        FOR SHARE OF d
      `;
      await tx.$executeRaw`
        SELECT p."id" FROM "mcp_admin_proposals" p
        JOIN "mcp_admin_delegations" d ON d."id" = p."delegationId"
        WHERE p."id" = ${id} AND d."userId" = ${mcpUserId(user)}
        FOR UPDATE OF p
      `;
      const proposal = await tx.mcpAdminProposal.findFirst({
        where: { id, delegation: { is: { userId: mcpUserId(user) } } },
        include: PROPOSAL_INCLUDE,
      });
      if (!proposal) throw new NotFoundException('Proposta indisponível.');
      await this.access.assertEventPermission(user, proposal.eventId, 'DESCRIPTION_PROPOSE', tx);
      if (proposal.baseUpdatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
        throw new ConflictException('A revisão exibida não corresponde à proposta. Reabra a fila.');
      }
      if (proposal.state !== 'PENDING') throw new ConflictException('Esta proposta já foi decidida.');
      if (input.decision === 'REJECT') {
        await tx.mcpAdminProposal.update({ where: { id }, data: { state: 'REJECTED', decidedAt: new Date() } });
        await this.auditDecision(tx, proposal, user, 'REJECT');
        return null;
      }
      this.access.assertActive(proposal.delegation, 'DESCRIPTION_PROPOSE', proposal.eventId);
      if (this.proposalStatus(proposal) !== 'PENDING') {
        throw new ConflictException('A proposta expirou ou o evento mudou. Prepare uma nova proposta.');
      }
      await this.frozen.forTransaction(tx).assertEventUpdateMutable(proposal.eventId, {}, user);
      await this.sports.assertEventUpdateAllowed(tx, proposal.eventId, { description: proposal.descriptionAfter });
      const userRecord = await tx.user.findUnique({ where: { id: mcpUserId(user) }, select: { name: true } });
      const approvedByName = userRecord?.name ?? user.preferredUsername ?? mcpUserId(user);
      const decidedAt = new Date();
      const claimed = await tx.mcpAdminProposal.updateMany({
        where: { id, state: 'PENDING', expiresAt: { gt: decidedAt } },
        data: { state: 'APPLIED', decidedAt, approvedById: user.sub, approvedByName },
      });
      if (claimed.count !== 1) throw new ConflictException('Esta proposta já foi decidida ou expirou.');
      const updated = await tx.event.updateMany({
        where: {
          id: proposal.eventId,
          deletedAt: null,
          updatedAt: proposal.baseUpdatedAt,
          description: proposal.descriptionBefore,
        },
        data: { description: proposal.descriptionAfter, updatedById: user.sub },
      });
      if (updated.count !== 1) throw new ConflictException('O evento mudou. A proposta não foi aplicada.');
      await tx.mcpEventContentSync.upsert({
        where: { eventId: proposal.eventId },
        create: { eventId: proposal.eventId },
        update: { revision: { increment: 1 } },
      });
      await this.audit.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: proposal.eventId,
          entityLabel: proposal.event.name,
          operation: AuditLogOperation.UPDATE,
          actor: user,
          before: { description: proposal.descriptionBefore },
          after: { description: proposal.descriptionAfter },
          scope: {
            permission: Permission.Event.Update,
            eventId: proposal.eventId,
            eventGroupId: proposal.event.eventGroupId,
            majorEventId: proposal.event.majorEventId,
          },
          summary: `Alteração MCP aprovada por ${approvedByName}.`,
          metadata: {
            source: 'mcp',
            proposalId: proposal.id,
            delegationId: proposal.delegationId,
            clientId: proposal.delegation.clientId,
            proposedById: proposal.delegation.userId,
            approvedById: user.sub,
            approvedByName,
            effects: 'event-description-only',
          },
          squashWindowMs: 0,
        },
        tx,
      );
      return proposal.eventId;
    });
    await this.invalidations?.publish(mcpUserId(user));
    return eventId;
  }

  private proposalStatus(proposal: StoredProposal): McpProposalStatus {
    if (proposal.state !== 'PENDING') return proposal.state;
    if (proposal.delegation.revokedAt) return 'REVOKED';
    if (proposal.expiresAt <= new Date() || proposal.delegation.expiresAt <= new Date()) return 'EXPIRED';
    if (
      proposal.baseUpdatedAt.getTime() !== proposal.event.updatedAt.getTime() ||
      proposal.descriptionBefore !== proposal.event.description
    )
      return 'STALE';
    return 'PENDING';
  }

  private async mapProposal(proposal: StoredProposal, user: AuthenticatedUser): Promise<McpAdminProposal> {
    const status = this.proposalStatus(proposal);
    let unavailableReason: string | null =
      status === 'PENDING' ? null : 'Esta proposta não está disponível para aprovação.';
    if (!unavailableReason) {
      try {
        this.access.assertActive(proposal.delegation, 'DESCRIPTION_PROPOSE', proposal.eventId);
        // The collection query already intersects current read/update scopes and
        // audience before pagination. Execution rechecks them in its transaction.
        await this.frozen.assertLoadedEventMutable(proposal.event, user, 'edit');
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        unavailableReason = 'Sem autorização atual, delegação ativa ou permissão para editar este recurso congelado.';
      }
    }
    return {
      id: proposal.id,
      delegationId: proposal.delegationId,
      eventId: proposal.eventId,
      eventName: proposal.event.name,
      clientId: proposal.delegation.clientId,
      createdAt: proposal.createdAt.toISOString(),
      expiresAt: proposal.expiresAt.toISOString(),
      status,
      descriptionBefore: proposal.descriptionBefore,
      descriptionAfter: proposal.descriptionAfter,
      baseUpdatedAt: proposal.baseUpdatedAt.toISOString(),
      currentUpdatedAt: proposal.event.updatedAt.toISOString(),
      currentDescription: proposal.event.description,
      publicationState: {
        DRAFT: 'Rascunho',
        SCHEDULED: 'Agendado',
        PUBLISHED: 'Publicado',
        UNPUBLISHED: 'Despublicado',
      }[proposal.event.publicationState],
      approvalEffects: mcpProposalEffects(proposal.event.publicationState),
      canApprove: unavailableReason === null && this.config.proposalsEnabled,
      unavailableReason,
      approvedByName: proposal.approvedByName,
      decidedAt: proposal.decidedAt?.toISOString() ?? null,
    };
  }

  private toolProposal(id: string, state: string, expiresAt: Date) {
    return {
      proposalId: id,
      state,
      expiresAt,
      reviewUrl: new URL(`/admin/mcp?id=${encodeURIComponent(id)}`, this.config.applicationOrigin).href,
      appliesAutomatically: false,
    };
  }

  private async auditDecision(
    tx: Prisma.TransactionClient,
    proposal: StoredProposal,
    user: AuthenticatedUser,
    decision: 'REJECT',
  ): Promise<void> {
    await this.audit.record(
      {
        entityType: AuditLogEntityType.SYSTEM,
        entityId: proposal.id,
        entityLabel: 'Proposta MCP',
        operation: AuditLogOperation.REJECT,
        actor: user,
        before: { state: proposal.state },
        after: { state: 'REJECTED' },
        scope: {
          permission: Permission.Event.Update,
          eventId: proposal.eventId,
          eventGroupId: proposal.event.eventGroupId,
          majorEventId: proposal.event.majorEventId,
        },
        summary: 'Proposta MCP recusada, sem modificar o evento.',
        metadata: {
          source: 'mcp',
          decision,
          proposalId: proposal.id,
          delegationId: proposal.delegationId,
          clientId: proposal.delegation.clientId,
          proposedById: proposal.delegation.userId,
        },
        squashWindowMs: 0,
      },
      tx,
    );
  }
}
