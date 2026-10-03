import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuditLogEntityType,
  AuditLogOperation,
  EventTicketIssueSource,
  EventTicketStatus,
  Prisma,
  TicketHistoryOperation,
  TicketExpirationMode,
  TicketSubscriptionRequirement,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { audienceContext, ANONYMOUS_AUDIENCE } from '../audiences/audience-context';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { recordTicketAudit } from './ticket-audit';
import { assertTicketConfigVersionUnchanged } from './ticket-config-concurrency';
import { TicketEligibilityService } from './ticket-eligibility.service';
import {
  mapAdminEligibilityWarnings,
  mapAdminEventTicket,
  mapAdminTicketConfig,
  mapAdminTicketHistory,
  mapTicketTransfer,
  mapWalletTicket,
} from './ticket.mapper';
import {
  AdminEventTicketListModel,
  AdminEventTicketModel,
  AdminTicketIssueInputModel,
  AdminTicketRevokeInputModel,
  AdminTicketTransferInputModel,
  AdminTicketConfigModel,
  AdminTicketEligibilityModel,
  AdminTicketHistoryEntryModel,
  TicketConfigInputModel,
  TicketTransferListsModel,
  TicketTransferModel,
  WalletTicketModel,
} from './ticket.models';
import { TicketIssuanceService } from './ticket-issuance.service';
import { TicketTransferService } from './ticket-transfer.service';
import { TicketRealtimeService } from './ticket-realtime.service';

const MAJOR_EVENT_TIER_INCLUDE = {
  majorEventPrices: {
    include: { tiers: { select: { id: true, name: true } } },
  },
} satisfies Prisma.MajorEventInclude;

const WALLET_TICKET_INCLUDE = {
  ticketConfig: true,
  event: {
    include: {
      eventGroup: { include: { majorEvent: { include: MAJOR_EVENT_TIER_INCLUDE } } },
      majorEvent: { include: MAJOR_EVENT_TIER_INCLUDE },
    },
  },
  holder: true,
} satisfies Prisma.EventTicketInclude;

const ADMIN_TICKET_INCLUDE = {
  ...WALLET_TICKET_INCLUDE,
  originalHolder: true,
  history: {
    take: 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { previousHolder: true, newHolder: true },
  },
} satisfies Prisma.EventTicketInclude;

const ADMIN_CONFIG_INCLUDE = {
  priceOptions: true,
  event: { include: { eventGroup: true, majorEvent: true } },
} satisfies Prisma.TicketConfigInclude;

@Resolver()
export class TicketsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly audit: AuditLogService,
    private readonly issuance: TicketIssuanceService,
    private readonly eligibility: TicketEligibilityService,
    private readonly transfers: TicketTransferService,
    private readonly realtime: TicketRealtimeService,
  ) {}

  @Query(() => [WalletTicketModel], { name: 'myWalletTickets' })
  async myWalletTickets(@Context() context: GraphqlContext): Promise<WalletTicketModel[]> {
    const user = this.requireUser(context);
    const userId = user.sub;
    if (!userId) throw new UnauthorizedException('Usuário não autenticado.');
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, userId, bypass: true, personIds: [] }, async () => {
      const personIds = await this.personIdsForUser(this.prisma, userId);
      if (personIds.length === 0) return [];
      const tickets = await this.prisma.eventTicket.findMany({
        where: { holderPersonId: { in: personIds } },
        include: WALLET_TICKET_INCLUDE,
        orderBy: [{ event: { startDate: 'desc' } }, { issuedAt: 'desc' }, { id: 'desc' }],
      });
      return tickets.map((ticket) => mapWalletTicket(ticket, true));
    });
  }

  @Query(() => WalletTicketModel, { name: 'myWalletTicket', nullable: true })
  async myWalletTicket(
    @Args('ticketId', { type: () => String }) ticketId: string,
    @Context() context: GraphqlContext,
  ): Promise<WalletTicketModel | null> {
    const user = this.requireUser(context);
    const userId = user.sub;
    if (!userId) throw new UnauthorizedException('Usuário não autenticado.');
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, userId, bypass: true, personIds: [] }, async () => {
      const personIds = await this.personIdsForUser(this.prisma, userId);
      if (personIds.length === 0) return null;
      const ticket = await this.prisma.eventTicket.findFirst({
        where: { id: ticketId, holderPersonId: { in: personIds } },
        include: WALLET_TICKET_INCLUDE,
      });
      return ticket ? mapWalletTicket(ticket, true) : null;
    });
  }

  @Query(() => TicketTransferListsModel, { name: 'myTicketTransfers' })
  async myTicketTransfers(@Context() context: GraphqlContext): Promise<TicketTransferListsModel> {
    const user = this.requireUser(context);
    const lists = await this.transfers.listsForUser(user);
    return {
      incomingPending: lists.incomingPending.map((item) => mapTicketTransfer(item, 'RECIPIENT', this.transfers)),
      incomingIgnored: lists.incomingIgnored.map((item) => mapTicketTransfer(item, 'RECIPIENT', this.transfers)),
      outgoing: lists.outgoing.map((item) => mapTicketTransfer(item, 'AUTHOR', this.transfers)),
    };
  }

  @Query(() => TicketTransferModel, { name: 'ticketTransfer', nullable: true })
  async ticketTransfer(
    @Args('transferId', { type: () => String }) transferId: string,
    @Context() context: GraphqlContext,
  ): Promise<TicketTransferModel | null> {
    const user = this.requireUser(context);
    try {
      const { transfer, view } = await this.transfers.findForUser(transferId, user);
      return mapTicketTransfer(transfer, view, this.transfers);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  @Mutation(() => TicketTransferModel, { name: 'startTicketTransfer' })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.standaloneEventSubscription)
  async startTicketTransfer(
    @Args('ticketId', { type: () => String }) ticketId: string,
    @Args('destinationIdentityDocument', { type: () => String }) destinationIdentityDocument: string,
    @Context() context: GraphqlContext,
  ): Promise<TicketTransferModel> {
    const transfer = await this.transfers.startForUser(ticketId, destinationIdentityDocument, this.requireUser(context));
    return mapTicketTransfer(transfer, 'AUTHOR', this.transfers);
  }

  @Mutation(() => TicketTransferModel, { name: 'cancelTicketTransfer' })
  async cancelTicketTransfer(
    @Args('transferId', { type: () => String }) transferId: string,
    @Context() context: GraphqlContext,
  ): Promise<TicketTransferModel> {
    const transfer = await this.transfers.cancelForUser(transferId, this.requireUser(context));
    return mapTicketTransfer(transfer, 'AUTHOR', this.transfers);
  }

  @Mutation(() => TicketTransferModel, { name: 'acceptTicketTransfer' })
  async acceptTicketTransfer(
    @Args('transferId', { type: () => String }) transferId: string,
    @Context() context: GraphqlContext,
  ): Promise<TicketTransferModel> {
    const transfer = await this.transfers.acceptForUser(transferId, this.requireUser(context));
    return mapTicketTransfer(transfer, 'RECIPIENT', this.transfers);
  }

  @Mutation(() => TicketTransferModel, { name: 'ignoreTicketTransfer' })
  async ignoreTicketTransfer(
    @Args('transferId', { type: () => String }) transferId: string,
    @Context() context: GraphqlContext,
  ): Promise<TicketTransferModel> {
    const transfer = await this.transfers.ignoreForUser(transferId, this.requireUser(context));
    return mapTicketTransfer(transfer, 'RECIPIENT', this.transfers);
  }

  @Query(() => [AdminTicketConfigModel], { name: 'adminTicketConfigs' })
  async adminTicketConfigs(
    @Args('eventId', { type: () => String, nullable: true }) eventId: string | undefined,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId: string | undefined,
    @Context() context: GraphqlContext,
  ): Promise<AdminTicketConfigModel[]> {
    if (Boolean(eventId) === Boolean(majorEventId)) {
      throw new BadRequestException('Informe um evento ou um grande evento.');
    }
    const user = this.requireUser(context);
    if (eventId) {
      const event = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
        this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } }),
      );
      if (!event) throw new NotFoundException('Evento não encontrado.');
      await this.authorization.assertPermissions(user, [Permission.TicketConfig.Read], { eventId });
      return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
        const config = await this.prisma.ticketConfig.findUnique({ where: { eventId }, include: ADMIN_CONFIG_INCLUDE });
        return config ? [mapAdminTicketConfig(config)] : [];
      });
    }

    if (!majorEventId) throw new BadRequestException('Informe um grande evento válido.');
    const majorEvent = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.majorEvent.findUnique({ where: { id: majorEventId }, select: { id: true } }),
    );
    if (!majorEvent) throw new NotFoundException('Grande evento não encontrado.');
    await this.authorization.assertPermissions(user, [Permission.TicketConfig.Read], { majorEventId: majorEvent.id });
    const configs = await this.prisma.ticketConfig.findMany({
      where: {
        event: {
          OR: [
            { majorEventId: majorEvent.id },
            { majorEventId: null, eventGroup: { is: { majorEventId: majorEvent.id } } },
          ],
        },
      },
      include: ADMIN_CONFIG_INCLUDE,
      orderBy: [{ event: { startDate: 'asc' } }, { eventId: 'asc' }],
    });
    return configs.map((config) => mapAdminTicketConfig(config));
  }

  @Mutation(() => AdminTicketConfigModel, { name: 'saveTicketConfig' })
  async saveTicketConfig(
    @Args('input', { type: () => TicketConfigInputModel }) input: TicketConfigInputModel,
    @Context() context: GraphqlContext,
  ): Promise<AdminTicketConfigModel> {
    const user = this.requireUser(context);
    const event = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.event.findUnique({
        where: { id: input.eventId },
        select: {
          id: true,
          name: true,
          majorEventId: true,
          eventGroup: { select: { majorEventId: true } },
        },
      }),
    );
    if (!event) throw new NotFoundException('Evento não encontrado.');
    const existing = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.ticketConfig.findUnique({ where: { eventId: input.eventId } }),
    );
    const expectedConfigVersion = existing ? { id: existing.id, updatedAt: existing.updatedAt } : null;
    await this.authorization.assertPermissions(
      user,
      [existing ? Permission.TicketConfig.Update : Permission.TicketConfig.Create],
      { eventId: input.eventId },
    );
    const saved = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {

      const normalized = await this.normalizeTicketConfigInput(input, event.majorEventId ?? event.eventGroup?.majorEventId ?? null);
      const savedConfig = await runSerializablePrismaTransaction(this.prisma, async (tx) => {
        await this.issuance.lockEventExpirationAlignment(tx, input.eventId, 'UPDATE');
        const before = await tx.ticketConfig.findUnique({
          where: { eventId: input.eventId },
          include: { priceOptions: true },
        });
        assertTicketConfigVersionUnchanged(
          expectedConfigVersion,
          before ? { id: before.id, updatedAt: before.updatedAt } : null,
        );
        const data = {
          enabled: normalized.enabled,
          displayName: normalized.displayName,
          displayEmoji: normalized.displayEmoji,
          description: normalized.description,
          transferEligibilityDescription: normalized.transferEligibilityDescription,
          transferable: normalized.transferable,
          issueOnEventSubscription: normalized.issueOnEventSubscription,
          issueOnMajorEventSubscription: normalized.issueOnMajorEventSubscription,
          includedPriceTierIds: normalized.includedPriceTierIds,
          recipientSubscriptionRequirement: normalized.recipientSubscriptionRequirement,
          recipientRequiresUnesp: normalized.recipientRequiresUnesp,
          recipientAcademicIdPrefixes: normalized.recipientAcademicIdPrefixes,
          recipientCourseCodes: normalized.recipientCourseCodes,
          recipientRequiresAccountManagerVerification: normalized.recipientRequiresAccountManagerVerification,
          recipientAllowedPriceTierIds: normalized.recipientAllowedPriceTierIds,
          purchaseEnabled: normalized.purchaseEnabled,
          purchaseRequiresUnesp: normalized.purchaseRequiresUnesp,
          purchaseAcademicIdPrefixes: normalized.purchaseAcademicIdPrefixes,
          purchaseCourseCodes: normalized.purchaseCourseCodes,
          purchaseRequiresAccountManagerVerification: normalized.purchaseRequiresAccountManagerVerification,
          purchaseVisiblePriceTierIds: normalized.purchaseVisiblePriceTierIds,
          expirationMode: normalized.expirationMode,
          customExpiresAt: normalized.customExpiresAt,
        };
        const config = await tx.ticketConfig.upsert({
          where: { eventId: input.eventId },
          create: { eventId: input.eventId, ...data },
          update: data,
        });
        await tx.ticketPriceOption.deleteMany({ where: { ticketConfigId: config.id } });
        if (normalized.priceOptions.length > 0) {
          await tx.ticketPriceOption.createMany({
            data: normalized.priceOptions.map((option) => ({
              ticketConfigId: config.id,
              priceTierId: option.priceTierId,
              label: option.label,
              amountCents: option.amountCents,
            })),
          });
        }
        const after = await tx.ticketConfig.findUniqueOrThrow({
          where: { id: config.id },
          include: ADMIN_CONFIG_INCLUDE,
        });
        await this.issuance.alignActiveTicketExpirations(tx, input.eventId, {
          scope: 'ALL_ACTIVE',
          actorUserId: user.sub,
          permission: before ? Permission.TicketConfig.Update : Permission.TicketConfig.Create,
          enqueueInvalidations: false,
        });
        await this.audit.record({
          entityType: AuditLogEntityType.TICKET_CONFIG,
          entityId: config.id,
          entityLabel: normalized.displayName ?? event.name,
          operation: before ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
          actor: user,
          summary: before ? 'Configuração de bilhetes atualizada.' : 'Configuração de bilhetes criada.',
          before: before ? this.ticketConfigSnapshot(before) : undefined,
          after: this.ticketConfigSnapshot(after),
          scope: {
            permission: before ? Permission.TicketConfig.Update : Permission.TicketConfig.Create,
            eventId: event.id,
            majorEventId: event.majorEventId ?? event.eventGroup?.majorEventId,
          },
          squashWindowMs: 0,
        }, tx);
        const [holders, pendingTransfers] = await Promise.all([
          tx.eventTicket.findMany({
            where: { eventId: input.eventId },
            select: { holder: { select: { userId: true } } },
          }),
          tx.ticketTransfer.findMany({
            where: { eventId: input.eventId, senderStatus: 'PENDING' },
            select: { authorUserId: true, recipientUserId: true, senderUserId: true },
          }),
        ]);
        await this.realtime.enqueueForUsers(tx, holders.map(({ holder }) => holder?.userId), {
          type: 'TICKETS_CHANGED',
          eventId: input.eventId,
        });
        await this.realtime.enqueueForUsers(tx, pendingTransfers.flatMap((transfer) => [
          transfer.authorUserId,
          transfer.recipientUserId,
          transfer.senderUserId,
        ]), {
          type: 'TRANSFERS_CHANGED',
          eventId: input.eventId,
        });
        await this.issuance.enqueueExistingSubscriptionReconciliation(tx, input.eventId, after.updatedAt);
        return after;
      });
      return savedConfig;
    });
    return mapAdminTicketConfig(saved);
  }

  @Query(() => AdminTicketEligibilityModel, { name: 'adminTicketEligibilityWarnings' })
  async adminTicketEligibilityWarnings(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Context() context: GraphqlContext,
  ): Promise<AdminTicketEligibilityModel> {
    const user = this.requireUser(context);
    await this.authorization.assertPermissions(
      user,
      [Permission.RelatedPerson.Read],
      { eventId },
    );
    await this.assertAnyPermission(user, [Permission.Ticket.Issue, Permission.TicketTransfer.Manage], { eventId });
    const result = await this.eligibility.evaluateManualIssueEligibility(this.prisma, eventId, personId);
    return mapAdminEligibilityWarnings(result);
  }

  @Query(() => AdminEventTicketListModel, { name: 'adminEventTickets' })
  async adminEventTickets(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('status', { type: () => String, nullable: true }) status: string | undefined,
    @Args('search', { type: () => String, nullable: true }) search: string | undefined,
    @Args('take', { type: () => Int, nullable: true }) take: number | undefined,
    @Args('cursor', { type: () => String, nullable: true }) cursor: string | undefined,
    @Context() context: GraphqlContext,
  ): Promise<AdminEventTicketListModel> {
    const user = this.requireUser(context);
    const event = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } }),
    );
    if (!event) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.assertPermissions(user, [Permission.Ticket.Read], { eventId });

    const now = new Date();
    const normalizedStatus = status?.trim().toUpperCase();
    let stateWhere: Prisma.EventTicketWhereInput = {};
    if (normalizedStatus === 'EXPIRED') {
      stateWhere = { status: EventTicketStatus.ACTIVE, expiresAt: { lte: now } };
    } else if (normalizedStatus === 'ACTIVE') {
      stateWhere = { status: EventTicketStatus.ACTIVE, expiresAt: { gt: now } };
    } else if (normalizedStatus) {
      if (!Object.values(EventTicketStatus).includes(normalizedStatus as EventTicketStatus)) {
        throw new BadRequestException('Estado do bilhete inválido.');
      }
      stateWhere = { status: normalizedStatus as EventTicketStatus };
    }
    const normalizedSearch = search?.trim();
    const where: Prisma.EventTicketWhereInput = {
      eventId,
      ...stateWhere,
      ...(cursor ? { id: { lt: cursor } } : {}),
      ...(normalizedSearch
        ? { holder: { is: { name: { contains: normalizedSearch, mode: 'insensitive' } } } }
        : {}),
    };
    const pageSize = Math.max(1, Math.min(100, Math.trunc(take ?? 50)));
    const [rows, totalCount] = await Promise.all([
      this.prisma.eventTicket.findMany({
        where,
        include: ADMIN_TICKET_INCLUDE,
        orderBy: { id: 'desc' },
        take: pageSize + 1,
      }),
      this.prisma.eventTicket.count({ where: { eventId, ...stateWhere, ...(normalizedSearch
        ? { holder: { is: { name: { contains: normalizedSearch, mode: 'insensitive' } } } }
        : {}) } }),
    ]);
    const tickets = rows.slice(0, pageSize);
    return {
      tickets: tickets.map((ticket) => mapAdminEventTicket(ticket)),
      totalCount,
      nextCursor: rows.length > pageSize ? tickets[tickets.length - 1]?.id ?? null : null,
    };
  }

  @Mutation(() => AdminEventTicketModel, { name: 'adminIssueTicket' })
  async adminIssueTicket(
    @Args('input', { type: () => AdminTicketIssueInputModel }) input: AdminTicketIssueInputModel,
    @Context() context: GraphqlContext,
  ): Promise<AdminEventTicketModel> {
    const user = this.requireUser(context);
    const reason = this.requireReason(input.reason);
    await this.authorization.assertPermissions(
      user,
      [Permission.Ticket.Issue, Permission.RelatedPerson.Read],
      { eventId: input.eventId },
    );
    const ticket = await runSerializablePrismaTransaction(this.prisma, async (tx) =>
      this.issuance.issueForPerson(
        tx,
        input.eventId,
        input.personId,
        EventTicketIssueSource.ADMIN,
        null,
        { actorUserId: user.sub, reason },
      ),
    );
    const fullTicket = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: ADMIN_TICKET_INCLUDE }),
    );
    return mapAdminEventTicket(fullTicket);
  }

  @Mutation(() => AdminEventTicketModel, { name: 'adminRevokeTicket' })
  async adminRevokeTicket(
    @Args('input', { type: () => AdminTicketRevokeInputModel }) input: AdminTicketRevokeInputModel,
    @Context() context: GraphqlContext,
  ): Promise<AdminEventTicketModel> {
    const user = this.requireUser(context);
    const reason = this.requireReason(input.reason);
    const existing = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.eventTicket.findUnique({
        where: { id: input.ticketId },
        include: { event: { include: { eventGroup: true } } },
      }),
    );
    if (!existing) throw new NotFoundException('Bilhete não encontrado.');
    await this.authorization.assertPermissions(user, [Permission.Ticket.Revoke], { eventId: existing.eventId });

    await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      const ticket = await tx.eventTicket.findUnique({ where: { id: input.ticketId } });
      if (!ticket || ticket.status !== EventTicketStatus.ACTIVE) {
        throw new ConflictException('Somente bilhetes ainda não utilizados podem ser revogados.');
      }
      const changed = await tx.eventTicket.updateMany({
        where: { id: input.ticketId, status: EventTicketStatus.ACTIVE },
        data: { status: EventTicketStatus.REVOKED, revokedAt: new Date(), revokedReason: reason },
      });
      if (changed.count !== 1) throw new ConflictException('O bilhete foi alterado por outra operação.');

      await tx.eventTicketHistory.create({
        data: {
          ticketId: ticket.id,
          operation: TicketHistoryOperation.REVOKED,
          previousHolderPersonId: ticket.holderPersonId,
          actorUserId: user.sub,
          reason,
        },
      });
      await recordTicketAudit(tx, {
        entityType: AuditLogEntityType.TICKET,
        entityId: ticket.id,
        entityLabel: existing.event.name,
        operation: AuditLogOperation.DELETE,
        summary: 'Bilhete revogado pela administração.',
        actorUserId: user.sub,
        permission: Permission.Ticket.Revoke,
        eventId: ticket.eventId,
        majorEventId: existing.event.majorEventId ?? existing.event.eventGroup?.majorEventId,
        before: { status: ticket.status, holderPersonId: ticket.holderPersonId },
        after: { status: EventTicketStatus.REVOKED, holderPersonId: ticket.holderPersonId },
        metadata: { reason },
      });

      const pendingTransfers = await tx.ticketTransfer.findMany({
        where: { ticketId: ticket.id, senderStatus: 'PENDING' },
        select: { id: true, authorUserId: true, senderUserId: true, recipientUserId: true },
      });
      for (const transfer of pendingTransfers) {
        await tx.ticketTransfer.updateMany({
          where: { id: transfer.id, senderStatus: 'PENDING' },
          data: { senderStatus: 'EXPIRED', submittedDestinationIdentityDocumentEncrypted: null },
        });
        await recordTicketAudit(tx, {
          entityType: AuditLogEntityType.TICKET_TRANSFER,
          entityId: transfer.id,
          entityLabel: existing.event.name,
          operation: AuditLogOperation.UPDATE,
          summary: 'Solicitação encerrada após a revogação do bilhete.',
          actorUserId: user.sub,
          permission: Permission.Ticket.Revoke,
          eventId: ticket.eventId,
          majorEventId: existing.event.majorEventId ?? existing.event.eventGroup?.majorEventId,
          before: { senderStatus: 'PENDING' },
          after: { senderStatus: 'EXPIRED' },
        });
        await this.realtime.enqueueForUsers(tx, [transfer.authorUserId, transfer.senderUserId, transfer.recipientUserId], {
          type: 'TRANSFERS_CHANGED',
          eventId: ticket.eventId,
          ticketId: ticket.id,
          transferId: transfer.id,
        });
      }
      await this.realtime.enqueueForUsers(tx, [existing.holderPersonId ? (await tx.people.findUnique({ where: { id: existing.holderPersonId }, select: { userId: true } }))?.userId : null], {
        type: 'TICKETS_CHANGED',
        eventId: ticket.eventId,
        ticketId: ticket.id,
      });
    });

    const revoked = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.eventTicket.findUniqueOrThrow({ where: { id: input.ticketId }, include: ADMIN_TICKET_INCLUDE }),
    );
    return mapAdminEventTicket(revoked);
  }

  @Mutation(() => TicketTransferModel, { name: 'adminStartTicketTransfer' })
  async adminStartTicketTransfer(
    @Args('input', { type: () => AdminTicketTransferInputModel }) input: AdminTicketTransferInputModel,
    @Context() context: GraphqlContext,
  ): Promise<TicketTransferModel> {
    const user = this.requireUser(context);
    const reason = this.requireReason(input.reason);
    const ticket = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.eventTicket.findUnique({ where: { id: input.ticketId }, select: { eventId: true } }),
    );
    if (!ticket) throw new NotFoundException('Bilhete não encontrado.');
    await this.authorization.assertPermissions(
      user,
      [Permission.TicketTransfer.Manage, Permission.RelatedPerson.Read],
      { eventId: ticket.eventId },
    );
    const transfer = await this.transfers.startForAdmin(input.ticketId, input.recipientPersonId, reason, user);
    return mapTicketTransfer(transfer, 'RECIPIENT', this.transfers);
  }

  @Query(() => [AdminTicketHistoryEntryModel], { name: 'adminTicketHistory' })
  async adminTicketHistory(
    @Args('ticketId', { type: () => String }) ticketId: string,
    @Context() context: GraphqlContext,
  ): Promise<AdminTicketHistoryEntryModel[]> {
    const user = this.requireUser(context);
    const ticket = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.eventTicket.findUnique({
        where: { id: ticketId },
        select: { id: true, eventId: true },
      }),
    );
    if (!ticket) throw new NotFoundException('Bilhete não encontrado.');
    await this.authorization.assertPermissions(user, [Permission.TicketTransfer.Read], { eventId: ticket.eventId });
    const history = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.eventTicketHistory.findMany({
        where: { ticketId },
        include: { previousHolder: true, newHolder: true, transfer: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
    const actorIds = [...new Set(history.map(({ actorUserId }) => actorUserId).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const actorNameById = new Map(actors.map((actor) => [actor.id, actor.name]));
    return history.map((entry) => mapAdminTicketHistory({
      id: entry.id,
      ticketId: entry.ticketId,
      operation: entry.operation,
      previousHolder: entry.previousHolder,
      newHolder: entry.newHolder,
      actorName: entry.actorName ?? (entry.actorUserId ? actorNameById.get(entry.actorUserId) ?? null : null),
      reason: entry.reason,
      createdAt: entry.createdAt,
    }));
  }

  private requireUser(context: GraphqlContext): AuthenticatedUser {
    const user = context.req?.user ?? context.request?.user;
    if (!user?.sub) throw new UnauthorizedException('Usuário não autenticado.');
    return user;
  }

  private async personIdsForUser(
    executor: PrismaService | Prisma.TransactionClient,
    userId: string,
  ): Promise<string[]> {
    const people = await executor.people.findMany({
      where: { userId, deletedAt: null, mergedIntoId: null },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return people.map(({ id }) => id);
  }

  private requireReason(reason: string): string {
    const normalized = reason.trim();
    if (!normalized || normalized.length > 1_000) {
      throw new BadRequestException('Informe um motivo de até 1.000 caracteres.');
    }
    return normalized;
  }

  private async assertAnyPermission(
    user: AuthenticatedUser,
    permissions: readonly Permission[],
    scope: { eventId: string },
  ): Promise<void> {
    const grants = new Set(await this.authorization.evaluatePermissions(user, permissions));
    for (const permission of permissions) {
      if (grants.has(permission)) {
        await this.authorization.assertPermissions(user, [permission], scope);
        return;
      }
    }
    throw new ForbiddenException('Falta uma permissão válida para a operação de bilhetes.');
  }

  private async normalizeTicketConfigInput(input: TicketConfigInputModel, majorEventId: string | null) {
    if (input.purchaseVisibility.subscriptionRequirement !== 'REQUIRED' || !input.purchaseVisibility.requiresValidatedSubscription) {
      throw new BadRequestException('Compras de bilhete exigem inscrição com comprovante validado.');
    }
    if (!Object.values(TicketSubscriptionRequirement).includes(input.recipientPolicy.subscriptionRequirement)) {
      throw new BadRequestException('Selecione um critério de inscrição válido.');
    }
    if (!Object.values(TicketExpirationMode).includes(input.expirationMode)) {
      throw new BadRequestException('Selecione um critério de validade válido.');
    }
    const recipientAllowedPriceTierIds = normalizeIds(input.recipientPolicy.allowedPriceTierIds);
    const purchaseVisiblePriceTierIds = normalizeIds(input.purchaseVisibility.allowedPriceTierIds);
    if (
      recipientAllowedPriceTierIds.length > 0 &&
      input.recipientPolicy.subscriptionRequirement !== TicketSubscriptionRequirement.REQUIRED
    ) {
      throw new BadRequestException('A restrição por faixa de preço exige inscrição no grande evento.');
    }
    if (input.purchaseEnabled && (!majorEventId || input.priceOptions.length === 0)) {
      throw new BadRequestException('Bilhetes compráveis exigem um grande evento e ao menos uma opção de preço.');
    }
    if (input.expirationMode === TicketExpirationMode.CUSTOM && !input.customExpiresAt) {
      throw new BadRequestException('Informe a data de validade personalizada.');
    }
    if (input.customExpiresAt && !Number.isFinite(input.customExpiresAt.getTime())) {
      throw new BadRequestException('A data de validade personalizada é inválida.');
    }

    const includedPriceTierIds = normalizeIds(input.includedPriceTierIds);
    const recipientCourseCodes = normalizeCourseCodes(input.recipientPolicy.requiredCourseCodes);
    const purchaseCourseCodes = normalizeCourseCodes(input.purchaseVisibility.requiredCourseCodes);
    const recipientAcademicIdPrefixes = normalizePrefixes(input.recipientPolicy.requiredAcademicIdPrefixes);
    const purchaseAcademicIdPrefixes = normalizePrefixes(input.purchaseVisibility.requiredAcademicIdPrefixes);
    const priceOptions = input.priceOptions.map((option) => {
      const label = option.label.trim();
      const amountCents = Math.trunc(option.amountCents);
      if (!label || label.length > 100 || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
        throw new BadRequestException('Confira o nome e o valor de cada opção de preço.');
      }
      return { priceTierId: option.priceTierId?.trim() || null, label, amountCents };
    });
    const optionTiers = priceOptions.map(({ priceTierId }) => priceTierId).filter((id): id is string => Boolean(id));
    if (new Set(optionTiers).size !== optionTiers.length) {
      throw new BadRequestException('Cada faixa pode ter apenas uma opção de preço.');
    }
    if (priceOptions.filter(({ priceTierId }) => priceTierId === null).length > 1) {
      throw new BadRequestException('Use apenas uma opção de preço fixo.');
    }

    const configuredTierIds = new Set([
      ...includedPriceTierIds,
      ...recipientAllowedPriceTierIds,
      ...purchaseVisiblePriceTierIds,
      ...optionTiers,
    ]);
    if (configuredTierIds.size > 0 && !majorEventId) {
      throw new BadRequestException('Faixas de preço só podem ser usadas em eventos associados a um grande evento.');
    }
    if (configuredTierIds.size > 0) {
      if (!majorEventId) throw new BadRequestException('Faixas de preço só podem ser usadas em eventos associados a um grande evento.');
      const tiers = await this.prisma.priceTier.findMany({
        where: { id: { in: [...configuredTierIds] }, price: { majorEventId } },
        select: { id: true },
      });
      if (tiers.length !== configuredTierIds.size) {
        throw new BadRequestException('Uma ou mais faixas não pertencem ao grande evento deste evento.');
      }
    }

    return {
      enabled: input.enabled,
      displayName: normalizeOptionalText(input.displayName, 200),
      displayEmoji: normalizeOptionalText(input.displayEmoji, 32),
      description: normalizeOptionalText(input.description, 2_000),
      transferEligibilityDescription: normalizeOptionalText(input.transferEligibilityDescription, 2_000),
      transferable: input.transferable,
      issueOnEventSubscription: input.issueOnEventSubscription,
      issueOnMajorEventSubscription: input.issueOnMajorEventSubscription,
      includedPriceTierIds,
      recipientSubscriptionRequirement: input.recipientPolicy.subscriptionRequirement as TicketSubscriptionRequirement,
      recipientRequiresUnesp: input.recipientPolicy.requiresUnesp,
      recipientAcademicIdPrefixes,
      recipientCourseCodes,
      recipientRequiresAccountManagerVerification: input.recipientPolicy.requiresAccountManagerVerification,
      recipientAllowedPriceTierIds,
      purchaseEnabled: input.purchaseEnabled,
      purchaseRequiresUnesp: input.purchaseVisibility.requiresUnesp,
      purchaseAcademicIdPrefixes,
      purchaseCourseCodes,
      purchaseRequiresAccountManagerVerification: input.purchaseVisibility.requiresAccountManagerVerification,
      purchaseVisiblePriceTierIds,
      expirationMode: input.expirationMode as TicketExpirationMode,
      customExpiresAt: input.expirationMode === TicketExpirationMode.CUSTOM ? input.customExpiresAt ?? null : null,
      priceOptions,
    };
  }

  private ticketConfigSnapshot(config: {
    id: string;
    eventId: string;
    enabled: boolean;
    displayName: string | null;
    displayEmoji: string | null;
    description: string | null;
    transferEligibilityDescription: string | null;
    transferable: boolean;
    issueOnEventSubscription: boolean;
    issueOnMajorEventSubscription: boolean;
    includedPriceTierIds: string[];
    recipientSubscriptionRequirement: TicketSubscriptionRequirement;
    recipientRequiresUnesp: boolean;
    recipientAcademicIdPrefixes: string[];
    recipientCourseCodes: string[];
    recipientRequiresAccountManagerVerification: boolean;
    recipientAllowedPriceTierIds: string[];
    purchaseEnabled: boolean;
    purchaseRequiresUnesp: boolean;
    purchaseAcademicIdPrefixes: string[];
    purchaseCourseCodes: string[];
    purchaseRequiresAccountManagerVerification: boolean;
    purchaseVisiblePriceTierIds: string[];
    expirationMode: TicketExpirationMode;
    customExpiresAt: Date | null;
    priceOptions: Array<{ priceTierId: string | null; label: string; amountCents: number }>;
  }): Prisma.InputJsonObject {
    return {
      id: config.id,
      eventId: config.eventId,
      enabled: config.enabled,
      displayName: config.displayName,
      displayEmoji: config.displayEmoji,
      description: config.description,
      transferEligibilityDescription: config.transferEligibilityDescription,
      transferable: config.transferable,
      issueOnEventSubscription: config.issueOnEventSubscription,
      issueOnMajorEventSubscription: config.issueOnMajorEventSubscription,
      includedPriceTierIds: config.includedPriceTierIds,
      recipientSubscriptionRequirement: config.recipientSubscriptionRequirement,
      recipientRequiresUnesp: config.recipientRequiresUnesp,
      recipientAcademicIdPrefixes: config.recipientAcademicIdPrefixes,
      recipientCourseCodes: config.recipientCourseCodes,
      recipientRequiresAccountManagerVerification: config.recipientRequiresAccountManagerVerification,
      recipientAllowedPriceTierIds: config.recipientAllowedPriceTierIds,
      purchaseEnabled: config.purchaseEnabled,
      purchaseRequiresUnesp: config.purchaseRequiresUnesp,
      purchaseAcademicIdPrefixes: config.purchaseAcademicIdPrefixes,
      purchaseCourseCodes: config.purchaseCourseCodes,
      purchaseRequiresAccountManagerVerification: config.purchaseRequiresAccountManagerVerification,
      purchaseVisiblePriceTierIds: config.purchaseVisiblePriceTierIds,
      expirationMode: config.expirationMode,
      customExpiresAt: config.customExpiresAt?.toISOString() ?? null,
      priceOptions: config.priceOptions.map((option) => ({ ...option })),
    };
  }
}

function normalizeIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizePrefixes(values: readonly string[]): string[] {
  const prefixes = values.map((value) => value.trim().normalize('NFKC')).filter(Boolean);
  if (prefixes.some((prefix) => prefix.length > 24)) throw new BadRequestException('O prefixo da matrícula é muito longo.');
  return [...new Set(prefixes)];
}

function normalizeCourseCodes(values: readonly string[]): string[] {
  const codes = values.map((value) => value.trim()).filter(Boolean);
  if (codes.some((code) => !/^\d{1,8}$/.test(code))) throw new BadRequestException('Informe códigos de curso válidos.');
  return [...new Set(codes)];
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new BadRequestException('Um dos textos ultrapassa o tamanho permitido.');
  return normalized;
}
