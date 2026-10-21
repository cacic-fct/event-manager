import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { EventTicket, People, Prisma } from '@prisma/client';
import {
  canonicalTransferJson,
  TRANSFER_MAX_RESOURCES,
  type ResourceOfKind,
  type TransferResource,
} from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { recordTicketAudit } from '../tickets/ticket-audit';
import { TicketRealtimeService } from '../tickets/ticket-realtime.service';
import { lockEventTicketExpiration } from '../tickets/ticket-expiration-lock';
import { PersonTransferMatcherService } from './person-transfer-matcher.service';
import { resolveTransferPerson } from './transfer-person-resolution';
import { transferPersonKey } from './transfer-person-creation';
import { ticketTransferContext, ticketTransferEventScope } from './ticket-transfer-context';
import { TransferValidationException } from './transfer-validation.exception';
import type {
  DataTransferAdapter,
  ResolvedTransferResource,
  TransferAdapterContext,
  TransferWriteAction,
} from './data-transfer-adapter';

type TicketResource = ResourceOfKind<'event-ticket'>;
interface TicketSnapshot extends ResolvedTransferResource {
  resource: TicketResource;
  personId?: string;
}
function ticketSnapshot(snapshot: ResolvedTransferResource): TicketSnapshot {
  if (snapshot.resource.kind !== 'event-ticket') throw new TransferValidationException('Tipo de bilhete inválido.');
  return snapshot as TicketSnapshot;
}

function ticketResource(
  row: EventTicket,
  person: TicketResource['data']['person'] = row.holderPersonId ? { id: row.holderPersonId } : null,
): TicketResource {
  return {
    kind: 'event-ticket',
    id: row.id,
    revision: row.updatedAt.toISOString(),
    data: {
      eventId: row.eventId,
      person,
      originalHolderPersonId: row.originalHolderPersonId,
      source: row.source,
      sourceKey: row.sourceKey,
      status: row.status,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      consumedAt: row.consumedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revokedReason: row.revokedReason,
    },
  };
}

/** Only expiry alignment by an earlier reviewed parent write can advance this ticket's revision. */
function hasRecordedExpiryAlignment(
  snapshot: TicketSnapshot,
  current: TicketResource,
  context: TransferAdapterContext,
): boolean {
  const mutations = context.priorMutations?.filter(
    (mutation) => mutation.model === 'eventTicket' && mutation.key['id'] === snapshot.resource.id,
  );
  if (!mutations?.length) return false;
  let revision = snapshot.revision;
  for (const mutation of mutations) {
    const { before, after, source } = mutation;
    if (
      !before ||
      !after ||
      before['updatedAt'] !== revision ||
      before['status'] !== 'ACTIVE' ||
      before['eventId'] !== snapshot.resource.data.eventId ||
      source.action !== 'update' ||
      !(
        (source.kind === 'event' && source.id === before['eventId']) ||
        (source.kind === 'ticket-config' && source.id === before['ticketConfigId'])
      ) ||
      typeof after['updatedAt'] !== 'string'
    )
      return false;
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const field of fields) {
      if (field === 'expiresAt' || field === 'updatedAt') continue;
      if (canonicalTransferJson(before[field] ?? null) !== canonicalTransferJson(after[field] ?? null)) return false;
    }
    revision = after['updatedAt'];
  }
  return revision === current.revision;
}

@Injectable()
export class EventTicketTransferAdapter implements DataTransferAdapter {
  readonly kinds = ['event-ticket'] as const;
  readonly dependencyOrder = 86;

  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly people: PersonTransferMatcherService,
    private readonly realtime: TicketRealtimeService,
  ) {}

  async resolve(input: TransferResource, context: TransferAdapterContext): Promise<ResolvedTransferResource> {
    if (input.kind !== 'event-ticket' || !input.data.eventId)
      throw new TransferValidationException('Informe o evento do bilhete.');
    const scope = await ticketTransferEventScope(input.data.eventId, context);
    const base: TicketSnapshot = {
      resource: input,
      current: null,
      revision: null,
      scope,
      dependencies: [{ kind: 'event', id: input.data.eventId }],
    };
    await this.assertRead(base, context);
    const current = await this.loadCurrent(input, context.tx);
    base.current = current;
    base.revision = current?.revision ?? null;
    const reference = input.data.person === undefined && current?.data.person ? current.data.person : input.data.person;
    const resolved = reference
      ? await resolveTransferPerson(reference, base, context, this.authorization, this.people, this)
      : base;
    if (resolved.skip) return resolved;
    const { originalHolder, ...data } = input.data;
    if (originalHolder !== undefined && data.originalHolderPersonId !== undefined)
      throw new TransferValidationException('Informe o titular original por referência ou por ID, nunca ambos.');
    if (originalHolder === null) data.originalHolderPersonId = null;
    else if (originalHolder) {
      if (reference && transferPersonKey(originalHolder) === transferPersonKey(reference)) {
        data.originalHolderPersonId = resolved.personId;
      } else {
        const original = await this.people.match(originalHolder, context.tx);
        if ('message' in original)
          throw new TransferValidationException(
            `Identifique uma pessoa existente para o titular original. ${original.message}`,
          );
        data.originalHolderPersonId = original.id;
      }
      const source = data.source ?? current?.data.source;
      if (data.sourceKey === undefined && (source === 'EVENT_SUBSCRIPTION' || source === 'MAJOR_EVENT_SUBSCRIPTION')) {
        const prefix = source === 'EVENT_SUBSCRIPTION' ? 'event-subscription' : 'major-event-subscription';
        data.sourceKey = `${prefix}:${data.eventId}:${data.originalHolderPersonId}`;
      }
    }
    const resource: TicketResource = {
      ...input,
      data: {
        ...data,
        ...(!current && data.originalHolderPersonId === undefined && resolved.personId
          ? { originalHolderPersonId: resolved.personId }
          : {}),
        ...(reference ? { person: { id: resolved.personId } } : {}),
      },
    };
    const config = context.document.resources.find(
      (row) => row.kind === 'ticket-config' && row.data.eventId === input.data.eventId,
    );
    const state = await ticketTransferContext(input.data.eventId, context, context.document.resources);
    return {
      ...resolved,
      resource,
      current,
      revision: current?.revision ?? null,
      identityKey: `event-ticket:${input.id}`,
      dependencies: [...base.dependencies, ...(config ? [{ kind: config.kind, id: config.id }] : [])],
      relatedRevisions: [{ kind: 'event', id: input.data.eventId, revision: JSON.stringify(state) }],
    };
  }

  async assertRead(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    await this.authorization.assertPermissions(
      context.actor,
      [Permission.DataTransfer.Import, Permission.Event.Read, Permission.Ticket.Read],
      snapshot.scope,
    );
  }
  async assertWrite(
    snapshot: ResolvedTransferResource,
    _action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<void> {
    const value = ticketSnapshot(snapshot);
    const data = { ...value.current?.data, ...value.resource.data };
    const changesHolder =
      value.current?.kind === 'event-ticket'
        ? data.person?.id !== value.current.data.person?.id
        : !!data.originalHolderPersonId && data.originalHolderPersonId !== data.person?.id;
    const revokes =
      data.status === 'REVOKED' && (value.current?.kind !== 'event-ticket' || value.current.data.status !== 'REVOKED');
    await this.authorization.assertPermissions(
      context.actor,
      [
        Permission.DataTransfer.Import,
        Permission.Ticket.Issue,
        ...(revokes ? [Permission.Ticket.Revoke] : []),
        ...(changesHolder ? [Permission.TicketTransfer.Manage] : []),
      ],
      snapshot.scope,
    );
  }
  async assertMutable(
    snapshot: ResolvedTransferResource,
    operation: 'edit' | 'delete',
    context: TransferAdapterContext,
  ): Promise<void> {
    if (snapshot.scope.eventId)
      await context.frozenResources.assertEventMutable(snapshot.scope.eventId, context.actor, operation);
    else if (snapshot.scope.majorEventId)
      await context.frozenResources.assertMajorEventMutable(snapshot.scope.majorEventId, context.actor, operation);
    else if (snapshot.scope.eventGroupId)
      await context.frozenResources.assertEventGroupMutable(snapshot.scope.eventGroupId, context.actor, operation);
  }
  async validate(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    await this.validateTicket(ticketSnapshot(snapshot), context, context.document.resources);
  }
  async validatePlan(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
    resources: readonly TransferResource[],
  ): Promise<void> {
    await this.validateTicket(ticketSnapshot(snapshot), context, resources);
  }
  private async validateTicket(
    snapshot: TicketSnapshot,
    context: TransferAdapterContext,
    resources: readonly TransferResource[],
  ): Promise<void> {
    const data = { ...snapshot.current?.data, ...snapshot.resource.data };
    if (!data.eventId || !data.issuedAt || !data.expiresAt || !data.source || !data.status || data.person === undefined)
      throw new TransferValidationException('Informe evento, titular, origem, estado, emissão e expiração do bilhete.');
    const state = await ticketTransferContext(data.eventId, context, resources);
    if (!state.config?.enabled)
      throw new TransferValidationException('Habilite a configuração de bilhetes do evento antes da importação.');
    if (new Date(data.issuedAt) > new Date() || new Date(data.expiresAt) <= new Date(data.issuedAt))
      throw new TransferValidationException('A emissão deve ocorrer até agora e antes da expiração do bilhete.');
    if (
      data.status === 'CONSUMED' &&
      (!data.consumedAt ||
        new Date(data.consumedAt) < new Date(data.issuedAt) ||
        new Date(data.consumedAt) > new Date())
    )
      throw new TransferValidationException('Informe uma data de consumo válida para o bilhete consumido.');
    if (data.status !== 'CONSUMED' && data.consumedAt)
      throw new TransferValidationException('Somente bilhetes consumidos podem ter data de consumo.');
    if (
      data.status === 'REVOKED' &&
      (!data.revokedAt || new Date(data.revokedAt) < new Date(data.issuedAt) || new Date(data.revokedAt) > new Date())
    )
      throw new TransferValidationException('Informe uma data de revogação válida para o bilhete revogado.');
    if (data.status !== 'REVOKED' && (data.revokedAt || data.revokedReason))
      throw new TransferValidationException('Somente bilhetes revogados podem ter dados de revogação.');
    if (data.originalHolderPersonId) {
      const original = await context.tx.people.findFirst({
        where: { id: data.originalHolderPersonId, deletedAt: null, mergedIntoId: null },
        select: { id: true },
      });
      if (!original && data.originalHolderPersonId !== snapshot.personCreation?.id)
        throw new TransferValidationException(
          'O titular original deve estar cadastrado antes da importação do bilhete.',
        );
    }
    if (data.source === 'EVENT_SUBSCRIPTION' || data.source === 'MAJOR_EVENT_SUBSCRIPTION') {
      const prefix = data.source === 'EVENT_SUBSCRIPTION' ? 'event-subscription' : 'major-event-subscription';
      if (!data.originalHolderPersonId || data.sourceKey !== `${prefix}:${data.eventId}:${data.originalHolderPersonId}`)
        throw new TransferValidationException('A origem automática deve corresponder ao evento e ao titular original.');
    }
    if (data.sourceKey) {
      if (
        resources.some(
          (row) =>
            (row.kind === 'event-ticket' && row.id !== snapshot.resource.id && row.data.sourceKey === data.sourceKey) ||
            (row.kind === 'ticket-purchase' && row.id === data.sourceKey),
        )
      )
        throw new TransferValidationException('A mesma origem aparece em mais de um bilhete.');
      const other = await context.tx.eventTicket.findUnique({
        where: { sourceKey: data.sourceKey },
        select: { id: true },
      });
      if (other && other.id !== snapshot.resource.id)
        throw new TransferValidationException('A origem já pertence a outro bilhete.');
    }
    if (data.person?.id && data.status !== 'REVOKED') {
      const duplicate = await context.tx.eventTicket.findFirst({
        where: {
          eventId: data.eventId,
          holderPersonId: data.person.id,
          status: { in: ['ACTIVE', 'CONSUMED'] },
          id: { not: snapshot.resource.id },
        },
        select: { id: true },
      });
      const plannedDuplicate = resources.some(
        (row) =>
          row.id !== snapshot.resource.id &&
          (row.kind === 'ticket-purchase' || (row.kind === 'event-ticket' && row.data.status !== 'REVOKED')) &&
          row.data.eventId === data.eventId &&
          row.data.person?.id === data.person?.id,
      );
      if (duplicate || plannedDuplicate)
        throw new TransferValidationException('A pessoa já possui outro bilhete para este evento.');
    }
    if (snapshot.current?.kind === 'event-ticket') {
      for (const field of ['source', 'sourceKey', 'issuedAt', 'originalHolderPersonId'] as const) {
        if (data[field] !== snapshot.current.data[field])
          throw new TransferValidationException(
            'A origem, a emissão e o titular original de um bilhete existente são imutáveis.',
          );
      }
      if (snapshot.current.data.person?.id && data.person?.id !== snapshot.current.data.person.id) {
        const pending = await context.tx.ticketTransfer.findFirst({
          where: { ticketId: snapshot.resource.id, senderStatus: 'PENDING' },
          select: { id: true },
        });
        if (pending)
          throw new TransferValidationException('Resolva a transferência pendente antes de alterar o titular.');
      }
    }
  }

  async apply(snapshot: ResolvedTransferResource, action: TransferWriteAction, context: TransferAdapterContext) {
    const value = ticketSnapshot(snapshot);
    const current = await this.loadCurrent(value.resource, context.tx);
    if (
      (current?.revision ?? null) !== value.revision &&
      (!current || !hasRecordedExpiryAlignment(value, current, context))
    )
      throw new ConflictException('O bilhete mudou. Gere uma nova prévia.');
    await this.assertWrite(value, action, context);
    await lockEventTicketExpiration(context.tx, value.resource.data.eventId ?? '', 'SHARE');
    await this.validateTicket(value, context, []);
    const data = { ...current?.data, ...value.resource.data };
    if (!data.eventId || !data.issuedAt || !data.expiresAt || !data.source || !data.status)
      throw new TransferValidationException('Dados de bilhete incompletos.');
    const state = await ticketTransferContext(data.eventId, context, []);
    if (!state.config) throw new TransferValidationException('Configuração de bilhetes indisponível.');
    const fields = {
      holderPersonId: data.person?.id ?? null,
      originalHolderPersonId: data.originalHolderPersonId ?? null,
      source: data.source,
      sourceKey: data.sourceKey ?? null,
      status: data.status,
      issuedAt: new Date(data.issuedAt),
      expiresAt: new Date(data.expiresAt),
      consumedAt: data.consumedAt ? new Date(data.consumedAt) : null,
      revokedAt: data.revokedAt ? new Date(data.revokedAt) : null,
      revokedReason: data.revokedReason ?? null,
    };
    if (action === 'create') {
      await context.tx.eventTicket.create({
        data: { id: value.resource.id, eventId: data.eventId, ticketConfigId: state.config.id, ...fields },
      });
    } else {
      if (!current?.revision) throw new ConflictException('O bilhete mudou. Gere uma nova prévia.');
      const updated = await context.tx.eventTicket.updateMany({
        where: { id: value.resource.id, updatedAt: new Date(current.revision) },
        data: fields,
      });
      if (updated.count !== 1) throw new ConflictException('O bilhete mudou. Gere uma nova prévia.');
    }
    const transferred =
      action === 'create'
        ? data.originalHolderPersonId && data.originalHolderPersonId !== data.person?.id
        : current?.data.person?.id !== data.person?.id;
    const operation = transferred
      ? 'TRANSFERRED'
      : data.status === 'CONSUMED'
        ? 'CONSUMED'
        : data.status === 'REVOKED'
          ? 'REVOKED'
          : 'ISSUED';
    await context.tx.eventTicketHistory.create({
      data: {
        ticketId: value.resource.id,
        operation,
        previousHolderPersonId: transferred ? (current?.data.person?.id ?? data.originalHolderPersonId) : null,
        newHolderPersonId: data.person?.id ?? null,
        actorUserId: context.actor.sub,
        reason: 'Estado do bilhete importado por JSON após revisão.',
      },
    });
    await recordTicketAudit(context.tx, {
      entityType: 'TICKET',
      entityId: value.resource.id,
      entityLabel: state.config.displayName ?? state.name,
      operation: action === 'create' ? 'ISSUE' : 'UPDATE',
      summary: 'Bilhete importado por JSON após revisão.',
      actorUserId: context.actor.sub,
      permission: Permission.Ticket.Issue,
      eventId: data.eventId,
      majorEventId: state.majorEventId,
      after: { status: data.status, holderPersonId: data.person?.id ?? null },
    });
    const holder = data.person?.id
      ? await context.tx.people.findUnique({ where: { id: data.person.id }, select: { userId: true } })
      : null;
    const previous = current?.data.person?.id
      ? await context.tx.people.findUnique({ where: { id: current.data.person.id }, select: { userId: true } })
      : null;
    await this.realtime.enqueueForUsers(context.tx, [holder?.userId, previous?.userId], {
      type: 'TICKETS_CHANGED',
      eventId: data.eventId,
      ticketId: value.resource.id,
    });
    return {};
  }

  async readAppliedResource(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
  ): Promise<TransferResource> {
    const current = await this.loadCurrent(ticketSnapshot(snapshot).resource, context.tx);
    if (!current) throw new ConflictException('O bilhete importado não está disponível.');
    return current;
  }
  private async loadCurrent(resource: TicketResource, tx: Prisma.TransactionClient): Promise<TicketResource | null> {
    const row = await tx.eventTicket.findUnique({ where: { id: resource.id } });
    if (row && row.eventId !== resource.data.eventId)
      throw new ForbiddenException('Bilhete indisponível neste contexto.');
    return row ? ticketResource(row) : null;
  }

  async exportTarget(
    target: Parameters<DataTransferAdapter['exportTarget']>[0],
    options: Parameters<DataTransferAdapter['exportTarget']>[1],
    context: TransferAdapterContext,
  ) {
    const result: Awaited<ReturnType<DataTransferAdapter['exportTarget']>> = { resources: [], issues: [] };
    if (!options.includeTickets) return result;
    const events =
      target.kind === 'event'
        ? [{ id: target.id }]
        : await context.tx.event.findMany({
            where: {
              deletedAt: null,
              ...(target.kind === 'group'
                ? { eventGroupId: target.id }
                : {
                    OR: [{ majorEventId: target.id }, { eventGroup: { majorEventId: target.id, deletedAt: null } }],
                  }),
            },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: TRANSFER_MAX_RESOURCES + 1,
          });
    if (events.length > TRANSFER_MAX_RESOURCES)
      throw new TransferValidationException('O contexto excede o limite de eventos por arquivo.');
    for (const event of events) {
      try {
        await this.authorization.assertPermissions(
          context.actor,
          [Permission.DataTransfer.Export, Permission.Event.Read, Permission.Ticket.Read],
          { eventId: event.id },
        );
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
        result.issues.push({ kind: 'event-ticket', message: 'Bilhetes omitidos por falta de permissão no contexto.' });
        continue;
      }
      let includePersonData = false;
      try {
        await this.authorization.assertPermissions(context.actor, [Permission.Person.Read]);
        includePersonData = true;
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
      const rows = await context.tx.eventTicket.findMany({
        where: { eventId: event.id },
        include: { holder: true, originalHolder: true },
        orderBy: { id: 'asc' },
        take: TRANSFER_MAX_RESOURCES + 1,
      });
      if (rows.length + result.resources.length > TRANSFER_MAX_RESOURCES)
        throw new TransferValidationException('Os bilhetes excedem o limite de registros por arquivo.');
      for (const row of rows) {
        const resource = ticketResource(row, this.exportPerson(row.holder, includePersonData));
        const { originalHolderPersonId, sourceKey, ...data } = resource.data;
        const automatic = row.source === 'EVENT_SUBSCRIPTION' || row.source === 'MAJOR_EVENT_SUBSCRIPTION';
        const originalHolder = this.exportPerson(row.originalHolder, includePersonData);
        if (originalHolderPersonId && !originalHolder) {
          result.issues.push({
            kind: 'event-ticket',
            id: row.id,
            message: 'Bilhete omitido porque o titular original não está disponível.',
          });
          continue;
        }
        result.resources.push({
          ...resource,
          data: { ...data, originalHolder, ...(!automatic ? { sourceKey } : {}) },
        });
      }
    }
    return result;
  }

  private exportPerson(person: People | null, includePersonData: boolean): TicketResource['data']['person'] {
    if (!person || person.deletedAt || person.mergedIntoId) return null;
    if (!includePersonData) return { name: person.name };
    return {
      name: person.name,
      ...(person.email ? { email: person.email } : {}),
      ...(person.phone ? { phone: person.phone } : {}),
      ...(person.academicId ? { academicId: person.academicId } : {}),
      ...(person.identityDocument ? { identityDocument: person.identityDocument } : {}),
    };
  }
}
