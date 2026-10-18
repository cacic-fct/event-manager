import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { canonicalTransferJson, type ResourceOfKind, type TransferResource } from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { recordTicketAudit } from '../tickets/ticket-audit';
import { TicketIssuanceService } from '../tickets/ticket-issuance.service';
import { PersonTransferMatcherService } from './person-transfer-matcher.service';
import { resolveTransferPerson } from './transfer-person-resolution';
import { ticketTransferContext, ticketTransferEventScope } from './ticket-transfer-context';
import { TransferValidationException } from './transfer-validation.exception';
import type {
  DataTransferAdapter,
  ResolvedTransferResource,
  TransferAdapterContext,
  TransferWriteAction,
} from './data-transfer-adapter';

type PurchaseResource = ResourceOfKind<'ticket-purchase'>;
interface PurchaseSnapshot extends ResolvedTransferResource {
  resource: PurchaseResource;
  personId?: string;
}

function purchaseSnapshot(snapshot: ResolvedTransferResource): PurchaseSnapshot {
  if (snapshot.resource.kind !== 'ticket-purchase') throw new TransferValidationException('Tipo de compra inválido.');
  return snapshot as PurchaseSnapshot;
}

@Injectable()
export class TicketPurchaseTransferAdapter implements DataTransferAdapter {
  readonly kinds = ['ticket-purchase'] as const;
  // Issue purchased rights before subscriptions and attendance synchronize/consume tickets.
  readonly dependencyOrder = 85;

  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly people: PersonTransferMatcherService,
    private readonly issuance: TicketIssuanceService,
  ) {}

  async resolve(input: TransferResource, context: TransferAdapterContext): Promise<ResolvedTransferResource> {
    if (input.kind !== 'ticket-purchase' || !input.data.eventId)
      throw new TransferValidationException('Informe o evento da compra de bilhete.');
    const scope = await ticketTransferEventScope(input.data.eventId, context);
    // Check the target before reading identifiers, purchase ownership, or ticket details.
    const base: PurchaseSnapshot = {
      resource: input,
      current: null,
      revision: null,
      scope,
      dependencies: [{ kind: 'event', id: input.data.eventId }],
    };
    await this.assertRead(base, context);
    if (!input.data.person) return { ...base, skip: { message: 'Informe os dados da pessoa que comprou o bilhete.' } };
    const person = await resolveTransferPerson(input.data.person, base, context, this.authorization, this.people, this);
    if (!person.personId) return person;
    const resource: PurchaseResource = { ...input, data: { ...input.data, person: { id: person.personId } } };
    const current = await this.loadCurrent(resource, person.personId, context.tx);
    const proposedConfig = context.document.resources.find(
      (row) => row.kind === 'ticket-config' && row.data.eventId === input.data.eventId,
    );
    const state = await ticketTransferContext(input.data.eventId, context, context.document.resources);
    const held = await context.tx.eventTicket.findFirst({
      where: { eventId: input.data.eventId, holderPersonId: person.personId, status: { in: ['ACTIVE', 'CONSUMED'] } },
      select: { id: true, sourceKey: true, updatedAt: true },
    });
    return {
      ...person,
      resource,
      current: current ? { ...current, id: resource.id } : null,
      revision: current?.revision ?? null,
      resolvedId: current?.id,
      identityKey: `ticket-purchase:${input.data.eventId}:${person.personId}`,
      dependencies: [
        ...base.dependencies,
        ...(proposedConfig ? [{ kind: proposedConfig.kind, id: proposedConfig.id }] : []),
      ],
      relatedRevisions: [
        {
          kind: 'event',
          id: input.data.eventId,
          revision: canonicalTransferJson({
            state,
            held: held ? { id: held.id, sourceKey: held.sourceKey, updatedAt: held.updatedAt.toISOString() } : null,
          }),
        },
      ],
    };
  }

  async assertRead(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    await this.authorization.assertPermissions(
      context.actor,
      [Permission.DataTransfer.Import, Permission.Event.Read, Permission.Ticket.Read, Permission.Receipt.Read],
      snapshot.scope,
    );
  }

  async assertWrite(
    snapshot: ResolvedTransferResource,
    _action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<void> {
    await this.authorization.assertPermissions(
      context.actor,
      [Permission.DataTransfer.Import, Permission.Ticket.Issue, Permission.Receipt.Approve],
      snapshot.scope,
    );
  }

  async assertMutable(
    snapshot: ResolvedTransferResource,
    operation: 'edit' | 'delete',
    context: TransferAdapterContext,
  ): Promise<void> {
    const resource = purchaseSnapshot(snapshot).resource;
    const existing = await context.tx.event.findFirst({
      where: { id: resource.data.eventId, deletedAt: null },
      select: { id: true },
    });
    if (existing) await context.frozenResources.assertEventMutable(existing.id, context.actor, operation);
    else if (snapshot.scope.majorEventId)
      await context.frozenResources.assertMajorEventMutable(snapshot.scope.majorEventId, context.actor, operation);
    else if (snapshot.scope.eventGroupId)
      await context.frozenResources.assertEventGroupMutable(snapshot.scope.eventGroupId, context.actor, operation);
  }

  async validate(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    await this.validatePurchase(purchaseSnapshot(snapshot), context, context.document.resources);
  }

  async validatePlan(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
    resources: readonly TransferResource[],
  ): Promise<void> {
    await this.validatePurchase(purchaseSnapshot(snapshot), context, resources);
  }

  private async validatePurchase(
    snapshot: PurchaseSnapshot,
    context: TransferAdapterContext,
    resources: readonly TransferResource[],
  ): Promise<void> {
    if (!snapshot.personId) return;
    const { resource, current } = snapshot;
    const data = { ...current?.data, ...resource.data };
    if (data.amountCents === undefined || !data.purchasedAt)
      throw new TransferValidationException('Informe o valor em centavos e a data da compra de bilhete.');
    if (current?.kind === 'ticket-purchase' && data.purchasedAt !== current.data.purchasedAt)
      throw new TransferValidationException('A data de uma compra já importada não pode ser alterada.');
    if (!data.eventId) throw new TransferValidationException('Informe o evento da compra.');
    const state = await ticketTransferContext(data.eventId, context, resources);
    if (!state.majorEventId)
      throw new TransferValidationException('A compra deve pertencer a um evento de um grande evento.');
    if (!state.config?.enabled || !state.expiresAt)
      throw new TransferValidationException('Habilite a configuração de bilhetes do evento antes de importar compras.');
    const purchasedAt = new Date(data.purchasedAt);
    if (purchasedAt > new Date() || purchasedAt >= new Date(state.expiresAt))
      throw new TransferValidationException('A compra deve ocorrer até agora e antes da expiração do bilhete.');
    if (!current) {
      const held = await context.tx.eventTicket.findFirst({
        where: { eventId: data.eventId, holderPersonId: snapshot.personId, status: { in: ['ACTIVE', 'CONSUMED'] } },
        select: { id: true, sourceKey: true },
      });
      // The final plan validation also runs after writes, when this import's own ticket already exists.
      if (held && held.sourceKey !== resource.id)
        throw new TransferValidationException('A pessoa já possui um bilhete para este evento.');
    }
  }

  async apply(snapshot: ResolvedTransferResource, action: TransferWriteAction, context: TransferAdapterContext) {
    const value = purchaseSnapshot(snapshot);
    if (!value.personId) throw new TransferValidationException('Pessoa não resolvida.');
    const current = await this.loadCurrent(value.resource, value.personId, context.tx);
    if ((current?.revision ?? null) !== value.revision)
      throw new ConflictException('A compra mudou. Gere uma nova prévia.');
    await this.assertWrite(value, action, context);
    // Earlier adapters have persisted all event/configuration dependencies by this point.
    await this.validatePurchase(value, context, []);
    const data = { ...current?.data, ...value.resource.data };
    if (!data.eventId || !data.purchasedAt || data.amountCents === undefined)
      throw new TransferValidationException('Dados da compra incompletos.');
    const state = await ticketTransferContext(data.eventId, context, []);
    if (!state.majorEventId || !state.config)
      throw new TransferValidationException('Configuração de bilhetes indisponível.');
    const id = current?.id ?? value.resource.id;
    if (action === 'create') {
      await context.tx.ticketPurchase.create({
        data: {
          id,
          eventId: data.eventId,
          majorEventId: state.majorEventId,
          ticketConfigId: state.config.id,
          personId: value.personId,
          majorEventSubscriptionId: null,
          amountCents: data.amountCents,
          priceTierName: data.priceTierName ?? null,
          ticketName: state.config.displayName ?? state.name,
          ticketEmoji: state.config.displayEmoji ?? state.emoji ?? '🎟️',
          status: 'APPROVED',
          createdAt: new Date(data.purchasedAt),
          reviewedAt: new Date(),
          reviewedById: context.actor.sub,
          // Same representation as a receipt whose retention period has ended; no storage object is created.
          objectKey: '',
          fileName: '',
          mimeType: '',
          sizeBytes: 0,
          receiptUploadedAt: new Date(data.purchasedAt),
          receiptExpiresAt: new Date(data.purchasedAt),
        },
      });
      const ticket = await this.issuance.issueForPerson(context.tx, data.eventId, value.personId, 'PURCHASE', id, {
        actorUserId: context.actor.sub,
        reason: 'Compra externa importada por JSON após revisão.',
        issuedAt: new Date(data.purchasedAt),
      });
      if (
        ticket.sourceKey !== id ||
        ticket.eventId !== data.eventId ||
        ticket.originalHolderPersonId !== value.personId
      )
        throw new ConflictException('A pessoa já possui um bilhete de outra origem. Gere uma nova prévia.');
    } else {
      if (!value.revision) throw new ConflictException('A compra mudou. Gere uma nova prévia.');
      const result = await context.tx.ticketPurchase.updateMany({
        where: {
          id,
          updatedAt: new Date(value.revision),
          status: 'APPROVED',
          personId: value.personId,
          eventId: data.eventId,
        },
        data: { amountCents: data.amountCents, priceTierName: data.priceTierName },
      });
      if (result.count !== 1) throw new ConflictException('A compra mudou. Gere uma nova prévia.');
    }
    await recordTicketAudit(context.tx, {
      entityType: 'TICKET_PURCHASE',
      entityId: id,
      entityLabel: state.config.displayName ?? state.name,
      operation: action === 'create' ? 'APPROVE' : 'UPDATE',
      summary: 'Compra externa importada por JSON após revisão.',
      actorUserId: context.actor.sub,
      permission: Permission.Receipt.Approve,
      eventId: data.eventId,
      majorEventId: state.majorEventId,
      after: {
        status: 'APPROVED',
        personId: value.personId,
        amountCents: data.amountCents,
        priceTierName: data.priceTierName ?? null,
      },
    });
    return {};
  }

  async readAppliedResource(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
  ): Promise<TransferResource> {
    const value = purchaseSnapshot(snapshot);
    if (!value.personId) throw new TransferValidationException('Pessoa não resolvida.');
    const current = await this.loadCurrent(value.resource, value.personId, context.tx);
    if (!current) throw new ConflictException('A compra importada não está disponível.');
    return current;
  }

  async exportTarget() {
    return { resources: [], issues: [] };
  }

  private async loadCurrent(
    resource: PurchaseResource,
    personId: string,
    tx: Prisma.TransactionClient,
  ): Promise<PurchaseResource | null> {
    const byId = await tx.ticketPurchase.findUnique({ where: { id: resource.id } });
    if (byId && (byId.personId !== personId || byId.eventId !== resource.data.eventId))
      throw new ForbiddenException('A compra não está disponível neste contexto.');
    const row =
      byId ??
      (await tx.ticketPurchase.findFirst({
        where: { eventId: resource.data.eventId, personId, status: { in: ['UNDER_REVIEW', 'APPROVED'] } },
      }));
    if (!row) return null;
    if (row.status !== 'APPROVED')
      throw new TransferValidationException(
        'Esta compra deve ser revisada no fluxo de comprovantes antes da importação.',
      );
    return {
      kind: 'ticket-purchase',
      id: row.id,
      revision: row.updatedAt.toISOString(),
      data: {
        eventId: row.eventId,
        person: { id: personId },
        amountCents: row.amountCents,
        priceTierName: row.priceTierName,
        purchasedAt: row.createdAt.toISOString(),
      },
    };
  }
}
