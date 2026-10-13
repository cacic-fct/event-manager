import { TransferValidationException } from './transfer-validation.exception';
import { createHash } from 'node:crypto';
import {
  canonicalTransferJson,
  TRANSFER_MAX_RESOURCES,
  type TransferResource,
  type TransferTarget,
} from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AttendanceCreationMethod,
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SubscriptionCreationMethod,
} from '@prisma/client';
import { normalizeAttendancePriceTier } from '../events/attendance-price-tier-policy';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { AttendanceCategoryService } from '../events/attendance-category.service';
import { EventSubscriptionSyncService } from '../events/event-subscription-sync.service';
import { EventSubscriptionCountersService } from '../events/subscription-counters.service';
import { TicketSubscriptionSyncService } from '../events/ticket-subscription-sync.service';
import { ensureWorkspaceTierSubscriptionPolicy } from '../events/tier-subscription-policy';
import { refreshSportsParticipantForSubscription } from '../sports/sports-payment.service';
import {
  notifySportsMatchAttendanceMutation,
  startSportsMatchCheckInFromAthleteAttendance,
  type SportsMatchAttendanceCheckInPreview,
} from '../sports/operations/sports-match-attendance';
import { SportsMutationEventsService } from '../sports/realtime/sports-mutation-events.service';
import { PersonTransferMatcherService } from './person-transfer-matcher.service';
import type {
  DataTransferAdapter,
  ResolvedTransferResource,
  TransferAdapterApplyResult,
  TransferAdapterContext,
  TransferAdapterExportResult,
  TransferAuthorizationScope,
  TransferWriteAction,
} from './data-transfer-adapter';

type ParticipationKind = 'event-subscription' | 'group-subscription' | 'major-event-subscription' | 'event-attendance';
type ParticipationResource = Extract<TransferResource, { kind: ParticipationKind }>;

interface ParticipationSnapshot extends ResolvedTransferResource {
  resource: ParticipationResource;
  personId?: string;
  storedId?: string;
  target: TransferTarget;
  identityKey?: string;
  attendanceRevision?: string | null;
  sportsAttendance?: SportsAttendanceSnapshot;
  consumesTicket?: boolean;
}

interface SportsAttendanceSnapshot extends SportsMatchAttendanceCheckInPreview {
  eventGroupId: string | null;
  majorEventId: string | null;
}

const subscriptionSelect = {
  id: true,
  personId: true,
  imageLicenseAgreementAccepted: true,
  createdAt: true,
  deletedAt: true,
} as const;

export function participationRevision(resource: TransferResource): string {
  return `sha256:${createHash('sha256')
    .update(canonicalTransferJson({ kind: resource.kind, id: resource.id, data: resource.data }))
    .digest('hex')}`;
}

function asParticipation(resource: TransferResource): ParticipationResource {
  if (
    resource.kind === 'event-subscription' ||
    resource.kind === 'group-subscription' ||
    resource.kind === 'major-event-subscription' ||
    resource.kind === 'event-attendance'
  )
    return resource;
  throw new TransferValidationException('Tipo de participação inválido.');
}

function snapshotOf(snapshot: ResolvedTransferResource): ParticipationSnapshot {
  if (!('target' in snapshot)) throw new TransferValidationException('Participação não resolvida.');
  return snapshot as ParticipationSnapshot;
}

function targetOf(resource: ParticipationResource): TransferTarget {
  if (resource.kind === 'group-subscription' && resource.data.eventGroupId)
    return { kind: 'group', id: resource.data.eventGroupId };
  if (resource.kind === 'major-event-subscription' && resource.data.majorEventId)
    return { kind: 'major-event', id: resource.data.majorEventId };
  if ((resource.kind === 'event-subscription' || resource.kind === 'event-attendance') && resource.data.eventId)
    return { kind: 'event', id: resource.data.eventId };
  throw new TransferValidationException('Informe o ID do evento, grupo ou grande evento.');
}

function scopeOf(target: TransferTarget): TransferAuthorizationScope {
  return target.kind === 'event'
    ? { eventId: target.id }
    : target.kind === 'group'
      ? { eventGroupId: target.id }
      : { majorEventId: target.id };
}

function participationPlanRevision(
  attendanceRevision: string | null,
  sportsAttendance: SportsAttendanceSnapshot,
): string {
  return `sha256:${createHash('sha256')
    .update(
      canonicalTransferJson({
        attendanceRevision,
        sportsAttendance: {
          matchId: sportsAttendance.matchId,
          state: sportsAttendance.state,
          canonicalState: sportsAttendance.canonicalState,
          revision: sportsAttendance.revision,
        },
      }),
    )
    .digest('hex')}`;
}

function targetRead(target: TransferTarget): Permission {
  return target.kind === 'event'
    ? Permission.Event.Read
    : target.kind === 'group'
      ? Permission.EventGroup.Read
      : Permission.MajorEvent.Read;
}

function recordsPresence(resource: ParticipationResource, current: TransferResource | null): boolean {
  if (resource.kind !== 'event-attendance') return false;
  const previousStatus = current?.kind === 'event-attendance' ? current.data.status : undefined;
  // New attendances default to PRESENT; partial updates preserve the stored status.
  return (resource.data.status ?? previousStatus ?? 'PRESENT') === 'PRESENT';
}

@Injectable()
export class ParticipationTransferAdapter implements DataTransferAdapter {
  readonly kinds = [
    'event-subscription',
    'group-subscription',
    'major-event-subscription',
    'event-attendance',
  ] as const;
  readonly dependencyOrder = 90;
  private readonly plannedSportsCheckIns = new WeakMap<TransferAdapterContext, Set<string>>();

  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly people: PersonTransferMatcherService,
    private readonly audit: AuditLogService,
    private readonly categories: AttendanceCategoryService,
    private readonly subscriptions: EventSubscriptionSyncService,
    private readonly counters: EventSubscriptionCountersService,
    private readonly tickets: TicketSubscriptionSyncService,
    private readonly sportsEvents: SportsMutationEventsService,
  ) {}

  async resolve(input: TransferResource, context: TransferAdapterContext): Promise<ResolvedTransferResource> {
    const resource = asParticipation(input);
    const target = targetOf(resource);
    const scope = await this.targetScope(target, context);
    // Authorize the submitted target before looking up any person. Current ownership is checked below too.
    await this.assertTarget(target, context, Permission.DataTransfer.Import);
    const sportsMatch =
      resource.kind === 'event-attendance' ? await this.findSportsMatchForAttendance(target.id, context.tx) : null;
    if (sportsMatch) {
      await this.authorization.assertPermissions(context.actor, [Permission.SportsMatch.Read], {
        sportsMatchId: sportsMatch.matchId,
      });
    } else if (
      resource.kind === 'event-attendance' &&
      context.document.resources.some((row) => row.kind === 'sports-match' && row.data.eventId === target.id)
    ) {
      const base: ParticipationSnapshot = {
        resource,
        current: null,
        revision: null,
        scope,
        target,
        dependencies: [target],
      };
      return {
        ...base,
        skip: {
          message:
            'Importe as presenças esportivas após criar a partida para habilitar as verificações de operação e elenco.',
        },
      };
    }
    const read = resource.kind === 'event-attendance' ? Permission.EventAttendance.Read : Permission.Subscription.Read;
    await this.authorization.assertPermissions(context.actor, [read], scope);
    const reference = resource.data.person;
    const base: ParticipationSnapshot = {
      resource,
      current: null,
      revision: null,
      scope,
      target,
      dependencies: [target],
      ...(sportsMatch
        ? {
            sportsAttendance: this.sportsAttendanceSnapshot(
              sportsMatch,
              false,
              sportsMatch.eventGroupId,
              sportsMatch.majorEventId,
            ),
          }
        : {}),
    };
    if (!reference) return { ...base, skip: { message: 'Informe os dados para identificar uma pessoa existente.' } };
    const match = await this.people.match(reference, context.tx);
    if ('message' in match) return { ...base, skip: { message: match.message } };
    const personId = match.id;
    const normalized: ParticipationResource = { ...resource, data: { ...resource.data, person: { id: personId } } };
    const current = await this.loadCurrent(normalized, target, personId, context.tx);
    const presenceRecorded = recordsPresence(resource, current);
    const consumesTicket = presenceRecorded && (await this.eventHasEnabledTickets(target.id, context.tx));
    if (consumesTicket) {
      await this.authorization.assertPermissions(context.actor, [Permission.Ticket.Read], scope);
    }
    const snapshot: ParticipationSnapshot = {
      ...base,
      resource: normalized,
      personId,
      storedId: current?.id,
      current: current ? { ...current, id: resource.id } : null,
      attendanceRevision: current ? participationRevision(current) : null,
      revision: current ? participationRevision(current) : null,
      identityKey: `${resource.kind}:${target.id}:${personId}`,
      resolvedId: resource.kind === 'event-attendance' ? `${target.id}:${personId}` : current?.id,
      dependencies: [
        target,
        ...(resource.kind === 'major-event-subscription'
          ? (resource.data.selectedEventIds ?? []).map((id) => ({ kind: 'event' as const, id }))
          : []),
      ],
      ...(consumesTicket ? { consumesTicket: true } : {}),
    };
    if (sportsMatch && resource.kind === 'event-attendance') {
      const checkIn = presenceRecorded
        ? await startSportsMatchCheckInFromAthleteAttendance({
            tx: context.tx,
            eventId: target.id,
            personId,
            dryRun: true,
          })
        : null;
      if (presenceRecorded && !checkIn) {
        throw new ConflictException('A partida mudou durante a prévia. Gere uma nova prévia.');
      }
      const planned = this.plannedSportsCheckIns.get(context) ?? new Set<string>();
      const willTransition = Boolean(checkIn?.willTransition && !planned.has(sportsMatch.matchId));
      snapshot.sportsAttendance = this.sportsAttendanceSnapshot(
        checkIn ?? sportsMatch,
        willTransition,
        sportsMatch.eventGroupId,
        sportsMatch.majorEventId,
      );
      snapshot.revision = participationPlanRevision(snapshot.attendanceRevision ?? null, snapshot.sportsAttendance);
      snapshot.additionalChanges = willTransition
        ? [
            {
              field: 'Estado da partida após presença de atleta',
              before: { state: sportsMatch.state, revision: sportsMatch.revision },
              after: { state: 'CHECK_IN', revision: sportsMatch.revision + 1 },
            },
          ]
        : [];
    }
    if (consumesTicket) {
      snapshot.additionalChanges = [
        ...(snapshot.additionalChanges ?? []),
        {
          field: 'Bilhetes do evento',
          before: 'Direitos existentes',
          after: 'Elegibilidade de emissão e consumo reavaliada para a presença.',
        },
      ];
    }
    if (resource.kind === 'event-attendance') {
      snapshot.additionalChanges = [
        ...(snapshot.additionalChanges ?? []),
        {
          field: 'Avaliação derivada da presença',
          before: current ? 'Valores atuais' : 'Ainda não calculada',
          after: 'Recalculada conforme as regras atuais do evento.',
        },
      ];
    }
    if (resource.kind === 'major-event-subscription' && current?.kind === 'major-event-subscription') {
      const proposedSelections = resource.data.selectedEventIds ?? current.data.selectedEventIds ?? [];
      const previousSelections = current.data.selectedEventIds ?? [];
      if (canonicalTransferJson(proposedSelections) !== canonicalTransferJson(previousSelections)) {
        snapshot.additionalChanges = [
          { field: 'Inscrições nos eventos selecionados', before: previousSelections, after: proposedSelections },
        ];
      }
    }
    if (resource.kind === 'major-event-subscription') {
      snapshot.dependencies = [
        ...snapshot.dependencies,
        ...(await this.paymentTierDependencies(resource, target.id, context)),
      ];
    }
    return snapshot;
  }

  async assertRead(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const value = snapshotOf(snapshot);
    await this.assertTarget(value.target, context, Permission.DataTransfer.Import);
    await this.authorization.assertPermissions(
      context.actor,
      [value.resource.kind === 'event-attendance' ? Permission.EventAttendance.Read : Permission.Subscription.Read],
      value.scope,
    );
    if (value.sportsAttendance) {
      await this.authorization.assertPermissions(context.actor, [Permission.SportsMatch.Read], {
        sportsMatchId: value.sportsAttendance.matchId,
      });
    }
    if (value.consumesTicket) {
      await this.authorization.assertPermissions(context.actor, [Permission.Ticket.Read], value.scope);
    }
  }

  async assertWrite(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<void> {
    const value = snapshotOf(snapshot);
    const permissions =
      value.resource.kind === 'event-attendance'
        ? [
            Permission.DataTransfer.Import,
            Permission.EventAttendance.Import,
            action === 'create' ? Permission.EventAttendance.Collect : Permission.EventAttendance.Update,
          ]
        : [
            Permission.DataTransfer.Import,
            Permission.Subscription.Import,
            action === 'create' ? Permission.Subscription.Create : Permission.Subscription.Update,
          ];
    await this.authorization.assertPermissions(
      context.actor,
      permissions,
      await this.targetScope(value.target, context),
    );
    if (value.sportsAttendance?.willTransition) {
      await this.authorization.assertPermissions(context.actor, [Permission.SportsMatch.Operate], {
        sportsMatchId: value.sportsAttendance.matchId,
      });
    }
    if (value.consumesTicket) {
      await this.authorization.assertPermissions(context.actor, [Permission.Ticket.Issue], value.scope);
    }
  }

  async assertMutable(
    snapshot: ResolvedTransferResource,
    operation: 'edit' | 'delete',
    context: TransferAdapterContext,
  ): Promise<void> {
    const value = snapshotOf(snapshot);
    if (
      !(await this.targetExists(value.target, context.tx)) &&
      context.document.resources.some((row) => row.kind === value.target.kind && row.id === value.target.id)
    )
      return;
    if (value.target.kind === 'event') {
      await context.frozenResources.assertEventMutable(value.target.id, context.actor, operation);
      if (value.sportsAttendance?.eventGroupId) {
        await context.frozenResources.assertEventGroupMutable(
          value.sportsAttendance.eventGroupId,
          context.actor,
          operation,
        );
      }
      if (value.sportsAttendance?.majorEventId) {
        await context.frozenResources.assertMajorEventMutable(
          value.sportsAttendance.majorEventId,
          context.actor,
          operation,
        );
      }
    } else if (value.target.kind === 'group')
      await context.frozenResources.assertEventGroupMutable(value.target.id, context.actor, operation);
    else await context.frozenResources.assertMajorEventMutable(value.target.id, context.actor, operation);
  }

  async validate(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const value = snapshotOf(snapshot);
    if (!value.personId) return;
    const resource = value.resource;
    if (resource.kind === 'event-attendance') {
      if (!value.current && !resource.data.attendedAt)
        throw new TransferValidationException('Informe a data e hora da presença.');
      if (value.sportsAttendance?.willTransition) {
        const planned = this.plannedSportsCheckIns.get(context) ?? new Set<string>();
        planned.add(value.sportsAttendance.matchId);
        this.plannedSportsCheckIns.set(context, planned);
      }
      return;
    }
    if (resource.kind === 'major-event-subscription') {
      const current = value.current?.kind === 'major-event-subscription' ? value.current.data : undefined;
      const selected = resource.data.selectedEventIds ?? current?.selectedEventIds ?? [];
      await this.assertEnrollmentTargets(selected, value.personId, context);
      await this.ensureSelectionsBelong(value.target.id, selected, context);
      if (await this.targetExists(value.target, context.tx))
        await ensureWorkspaceTierSubscriptionPolicy(
          context.tx,
          value.target.id,
          resource.data.paymentTier ?? current?.paymentTier,
          selected,
        );
      // Status synchronization can archive active event subscriptions: every affected scope must be authorized.
      const active = await context.tx.eventSubscription.findMany({
        where: {
          personId: value.personId,
          deletedAt: null,
          event: {
            OR: [{ majorEventId: value.target.id }, { eventGroup: { majorEventId: value.target.id, deletedAt: null } }],
          },
        },
        select: { eventId: true },
        take: TRANSFER_MAX_RESOURCES + 1,
      });
      this.assertBound(active);
      await this.assertEnrollmentTargets(
        active.map((row) => row.eventId),
        value.personId,
        context,
      );
      const nextStatus = resource.data.subscriptionStatus ?? current?.subscriptionStatus ?? 'WAITING_RECEIPT_UPLOAD';
      const after = nextStatus === 'CONFIRMED' ? selected : [];
      const before = active.map((row) => row.eventId).sort();
      if (canonicalTransferJson(before) !== canonicalTransferJson([...after].sort())) {
        value.additionalChanges = [{ field: 'Inscrições ativas relacionadas', before, after: [...after].sort() }];
      }
      return;
    }
    const events =
      resource.kind === 'group-subscription'
        ? await this.groupEventIds(value.target.id, context.tx)
        : [value.target.id];
    await this.assertEnrollmentTargets(events, value.personId, context);
    for (const eventId of events) {
      const event = await context.tx.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: {
          majorEventId: true,
          eventGroup: { select: { majorEventId: true } },
          sportsMatch: { select: { id: true } },
        },
      });
      if (event?.sportsMatch)
        throw new TransferValidationException('Inscrições esportivas devem usar o fluxo de inscrição da modalidade.');
      const majorId = event?.majorEventId ?? event?.eventGroup?.majorEventId;
      if (majorId && (await this.targetExists({ kind: 'major-event', id: majorId }, context.tx))) {
        const majorSubscription = await context.tx.majorEventSubscription.findFirst({
          where: { majorEventId: majorId, personId: value.personId, deletedAt: null },
          select: { paymentTier: true },
        });
        const active = await context.tx.eventSubscription.findMany({
          where: {
            personId: value.personId,
            deletedAt: null,
            event: { OR: [{ majorEventId: majorId }, { eventGroup: { majorEventId: majorId, deletedAt: null } }] },
          },
          select: { eventId: true },
          take: TRANSFER_MAX_RESOURCES + 1,
        });
        this.assertBound(active);
        await ensureWorkspaceTierSubscriptionPolicy(context.tx, majorId, majorSubscription?.paymentTier, [
          ...new Set([...active.map((row) => row.eventId), ...events]),
        ]);
      }
    }
    if (resource.kind === 'group-subscription' && !value.current)
      value.additionalChanges = [{ field: 'Inscrições nos eventos do grupo', before: [], after: events }];
    const missing = [];
    for (const eventId of events) {
      const active = await context.tx.eventSubscription.findFirst({
        where: { eventId, personId: value.personId, deletedAt: null },
        select: { id: true },
      });
      if (!active) missing.push(eventId);
    }
    const existingTargets = [];
    for (const eventId of missing)
      if (await this.targetExists({ kind: 'event', id: eventId }, context.tx)) existingTargets.push(eventId);
    await this.subscriptions.ensureEventIdsHaveAvailableSlots(context.tx, existingTargets);
  }

  async apply(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const value = snapshotOf(snapshot);
    if (!value.personId) throw new TransferValidationException('Pessoa não resolvida.');
    const current = await this.loadCurrent(value.resource, value.target, value.personId, context.tx);
    const expectedRevision = value.attendanceRevision !== undefined ? value.attendanceRevision : value.revision;
    if ((current ? participationRevision(current) : null) !== expectedRevision)
      throw new ConflictException('Os dados de participação mudaram. Revise o arquivo novamente.');
    await this.assertWrite(snapshot, action, context);
    await this.validate(snapshot, context);
    const personId = value.personId;
    const resource = value.resource;
    let entityType: AuditLogEntityType;
    let entityId = value.storedId ?? resource.id;
    if (resource.kind === 'event-attendance') {
      const presenceRecorded = recordsPresence(resource, current);
      const data: Pick<Prisma.EventAttendanceUncheckedCreateInput, 'attendedAt' | 'status'> = {
        ...(resource.data.attendedAt ? { attendedAt: new Date(resource.data.attendedAt) } : {}),
        ...(resource.data.status ? { status: resource.data.status } : {}),
      };
      if (value.sportsAttendance && presenceRecorded) {
        const checkInPreview = await startSportsMatchCheckInFromAthleteAttendance({
          tx: context.tx,
          eventId: value.target.id,
          personId,
          dryRun: true,
        });
        if (!checkInPreview || checkInPreview.willTransition !== value.sportsAttendance.willTransition) {
          throw new ConflictException(
            'A elegibilidade ou o estado da partida mudou desde a prévia. Gere uma nova prévia.',
          );
        }
      }
      if (action === 'create') {
        await context.tx.eventAttendance.create({
          data: {
            personId,
            eventId: value.target.id,
            ...data,
            createdById: context.actor.sub,
            committedById: context.actor.sub,
            createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
          },
        });
      } else {
        await context.tx.eventAttendance.update({
          where: { personId_eventId: { personId, eventId: value.target.id } },
          data: { ...data, committedById: context.actor.sub },
        });
      }
      await this.categories.refreshForAttendance(personId, value.target.id, context.tx, presenceRecorded);
      if (presenceRecorded) {
        const checkInStarted = await startSportsMatchCheckInFromAthleteAttendance({
          tx: context.tx,
          eventId: value.target.id,
          personId,
          updatedById: context.actor.sub,
        });
        if (value.sportsAttendance?.willTransition && !checkInStarted) {
          throw new ConflictException('A partida mudou durante a importação. Gere uma nova prévia.');
        }
      }
      entityType = AuditLogEntityType.EVENT_ATTENDANCE;
      entityId = `${value.target.id}:${personId}`;
    } else if (resource.kind === 'event-subscription') {
      const data =
        resource.data.imageLicenseAgreementAccepted === undefined
          ? {}
          : { imageLicenseAgreementAccepted: resource.data.imageLicenseAgreementAccepted };
      if (action === 'create')
        await context.tx.eventSubscription.create({
          data: {
            id: resource.id,
            personId,
            eventId: value.target.id,
            ...data,
            createdById: context.actor.sub,
            createdByMethod: SubscriptionCreationMethod.ADMIN_DASHBOARD,
          },
        });
      else await context.tx.eventSubscription.update({ where: { id: entityId }, data });
      await this.tickets.forEvent(context.tx, value.target.id, personId);
      await this.categories.refreshForAttendance(personId, value.target.id, context.tx);
      await this.counters.refresh(context.tx, [value.target.id]);
      entityType = AuditLogEntityType.EVENT_SUBSCRIPTION;
    } else if (resource.kind === 'group-subscription') {
      const data =
        resource.data.imageLicenseAgreementAccepted === undefined
          ? {}
          : { imageLicenseAgreementAccepted: resource.data.imageLicenseAgreementAccepted };
      if (action === 'create') {
        await context.tx.eventGroupSubscription.create({
          data: {
            id: resource.id,
            personId,
            eventGroupId: value.target.id,
            ...data,
            createdById: context.actor.sub,
            createdByMethod: SubscriptionCreationMethod.ADMIN_DASHBOARD,
          },
        });
        const events = await this.groupEventIds(value.target.id, context.tx);
        for (const eventId of events) {
          const existing = await context.tx.eventSubscription.findFirst({
            where: { eventId, personId, deletedAt: null },
            select: { id: true },
          });
          if (!existing)
            await context.tx.eventSubscription.create({
              data: {
                personId,
                eventId,
                eventGroupSubscriptionId: resource.id,
                ...data,
                createdById: context.actor.sub,
                createdByMethod: SubscriptionCreationMethod.ADMIN_DASHBOARD,
              },
            });
          else
            await context.tx.eventSubscription.update({
              where: { id: existing.id },
              data: { eventGroupSubscriptionId: resource.id },
            });
          await this.tickets.forEvent(context.tx, eventId, personId);
          await this.categories.refreshForAttendance(personId, eventId, context.tx);
        }
        await this.counters.refresh(context.tx, events);
      } else await context.tx.eventGroupSubscription.update({ where: { id: entityId }, data });
      entityType = AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION;
    } else {
      const data: Pick<
        Prisma.MajorEventSubscriptionUncheckedCreateInput,
        'subscriptionStatus' | 'amountPaid' | 'paymentDate' | 'paymentTier' | 'imageLicenseAgreementAccepted'
      > = {
        ...(resource.data.subscriptionStatus !== undefined
          ? { subscriptionStatus: resource.data.subscriptionStatus }
          : {}),
        ...(resource.data.amountPaid !== undefined ? { amountPaid: resource.data.amountPaid } : {}),
        ...(resource.data.paymentDate !== undefined
          ? { paymentDate: resource.data.paymentDate === null ? null : new Date(resource.data.paymentDate) }
          : {}),
        ...(resource.data.paymentTier !== undefined ? { paymentTier: resource.data.paymentTier } : {}),
        ...(resource.data.imageLicenseAgreementAccepted !== undefined
          ? { imageLicenseAgreementAccepted: resource.data.imageLicenseAgreementAccepted }
          : {}),
      };
      const updated =
        action === 'create'
          ? await context.tx.majorEventSubscription.create({
              data: {
                id: resource.id,
                personId,
                majorEventId: value.target.id,
                ...data,
                createdById: context.actor.sub,
                createdByMethod: SubscriptionCreationMethod.ADMIN_DASHBOARD,
              },
            })
          : await context.tx.majorEventSubscription.update({ where: { id: entityId }, data });
      const selected =
        resource.data.selectedEventIds ??
        (value.current?.kind === 'major-event-subscription' ? value.current.data.selectedEventIds : []) ??
        [];
      if (resource.data.selectedEventIds !== undefined) {
        await context.tx.majorEventSubscriptionEventSelection.updateMany({
          where: { subscriptionId: entityId, deletedAt: null, eventId: { notIn: selected } },
          data: { deletedAt: new Date() },
        });
        const existing = await context.tx.majorEventSubscriptionEventSelection.findMany({
          where: { subscriptionId: entityId, deletedAt: null },
          select: { eventId: true },
        });
        const active = new Set(existing.map((entry) => entry.eventId));
        await context.tx.majorEventSubscriptionEventSelection.createMany({
          data: selected
            .filter((eventId) => !active.has(eventId))
            .map((eventId) => ({ subscriptionId: entityId, eventId, createdById: context.actor.sub })),
        });
      }
      const result = await this.subscriptions.syncMajorEventConfirmedSubscriptions(
        context.tx,
        value.target.id,
        personId,
        selected,
        updated.subscriptionStatus,
        context.actor.sub,
      );
      await refreshSportsParticipantForSubscription(context.tx, entityId);
      await this.tickets.forMajorEvent(context.tx, value.target.id, personId);
      await this.categories.refreshForMajorEventPerson(value.target.id, personId, context.tx);
      await this.counters.refresh(context.tx, [
        ...selected,
        ...result.activeEventIds,
        ...result.archivedEventIds,
        ...result.createdEventIds,
      ]);
      entityType = AuditLogEntityType.MAJOR_EVENT_SUBSCRIPTION;
    }
    await this.audit.record(
      {
        entityType,
        entityId,
        operation: AuditLogOperation.IMPORT,
        actor: context.actor,
        before: value.current?.data,
        after: resource.data,
        scope: {
          permission:
            resource.kind === 'event-attendance' ? Permission.EventAttendance.Import : Permission.Subscription.Import,
          ...value.scope,
        },
        summary: 'Participação importada por JSON após revisão.',
      },
      context.tx,
    );
    return {
      postCommitEffects:
        resource.kind === 'event-attendance'
          ? [() => notifySportsMatchAttendanceMutation(this.sportsEvents, { eventId: value.target.id })]
          : [],
    };
  }

  async exportTarget(
    target: TransferTarget,
    options: Parameters<DataTransferAdapter['exportTarget']>[1],
    context: TransferAdapterContext,
  ): Promise<TransferAdapterExportResult> {
    const result: TransferAdapterExportResult = { resources: [], issues: [] };
    if (
      !options.includeSubscriptions &&
      !options.includeAttendances &&
      !options.includeChildSubscriptions &&
      !options.includeChildAttendances
    )
      return result;
    const events =
      target.kind === 'event'
        ? [target.id]
        : options.includeChildSubscriptions || options.includeChildAttendances
          ? (
              await context.tx.event.findMany({
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
              })
            ).map((row) => row.id)
          : [];
    this.assertBound(events);
    for (const eventId of events) {
      if (target.kind === 'event' ? options.includeSubscriptions : options.includeChildSubscriptions)
        await this.exportRows('event-subscription', { kind: 'event', id: eventId }, context, result);
      if (target.kind === 'event' ? options.includeAttendances : options.includeChildAttendances)
        await this.exportRows('event-attendance', { kind: 'event', id: eventId }, context, result);
    }
    if (target.kind === 'major-event') {
      if (options.includeSubscriptions) await this.exportRows('major-event-subscription', target, context, result);
      if (options.includeChildSubscriptions) {
        const groups = await context.tx.eventGroup.findMany({
          where: { majorEventId: target.id, deletedAt: null },
          select: { id: true },
          take: TRANSFER_MAX_RESOURCES + 1,
        });
        this.assertBound(groups);
        for (const group of groups)
          await this.exportRows('group-subscription', { kind: 'group', id: group.id }, context, result);
      }
    } else if (options.includeSubscriptions && target.kind === 'group')
      await this.exportRows('group-subscription', target, context, result);
    return result;
  }

  private async exportRows(
    kind: ParticipationKind,
    target: TransferTarget,
    context: TransferAdapterContext,
    result: TransferAdapterExportResult,
  ): Promise<void> {
    try {
      await this.assertTarget(target, context, Permission.DataTransfer.Export);
      await this.authorization.assertPermissions(
        context.actor,
        [kind === 'event-attendance' ? Permission.EventAttendance.Read : Permission.Subscription.Read],
        scopeOf(target),
      );
    } catch (error) {
      if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error;
      result.issues.push({ message: 'Parte dos dados de participação foi omitida por falta de acesso.' });
      return;
    }
    const resources = await this.listCurrent(kind, target, context.tx);
    this.assertBound(resources);
    result.resources.push(...resources.map((resource) => ({ ...resource, revision: participationRevision(resource) })));
  }

  private async listCurrent(
    kind: ParticipationKind,
    target: TransferTarget,
    tx: Prisma.TransactionClient,
  ): Promise<ParticipationResource[]> {
    const limit = TRANSFER_MAX_RESOURCES + 1;
    if (kind === 'event-attendance') {
      const rows = await tx.eventAttendance.findMany({
        where: { eventId: target.id },
        take: limit,
        orderBy: { personId: 'asc' },
      });
      return rows.map((row) => ({
        kind,
        id: `${row.eventId}:${row.personId}`,
        data: {
          eventId: row.eventId,
          person: { id: row.personId },
          attendedAt: row.attendedAt.toISOString(),
          status: row.status,
        },
      }));
    }
    if (kind === 'event-subscription') {
      const rows = await tx.eventSubscription.findMany({
        where: { eventId: target.id, deletedAt: null },
        take: limit,
        orderBy: { id: 'asc' },
        select: { ...subscriptionSelect, eventId: true },
      });
      return rows.map((row) => ({
        kind,
        id: row.id,
        data: {
          eventId: row.eventId,
          person: { id: row.personId },
          imageLicenseAgreementAccepted: row.imageLicenseAgreementAccepted,
        },
      }));
    }
    if (kind === 'group-subscription') {
      const rows = await tx.eventGroupSubscription.findMany({
        where: { eventGroupId: target.id, deletedAt: null },
        take: limit,
        orderBy: { id: 'asc' },
        select: { ...subscriptionSelect, eventGroupId: true },
      });
      return rows.map((row) => ({
        kind,
        id: row.id,
        data: {
          eventGroupId: row.eventGroupId,
          person: { id: row.personId },
          imageLicenseAgreementAccepted: row.imageLicenseAgreementAccepted,
        },
      }));
    }
    const rows = await tx.majorEventSubscription.findMany({
      where: { majorEventId: target.id, deletedAt: null },
      take: limit,
      orderBy: { id: 'asc' },
      include: {
        selectedEvents: { where: { deletedAt: null }, select: { eventId: true }, orderBy: { eventId: 'asc' } },
      },
    });
    return rows.map((row) => ({
      kind,
      id: row.id,
      data: {
        majorEventId: row.majorEventId,
        person: { id: row.personId },
        imageLicenseAgreementAccepted: row.imageLicenseAgreementAccepted,
        subscriptionStatus: row.subscriptionStatus,
        amountPaid: row.amountPaid,
        paymentDate: row.paymentDate?.toISOString() ?? null,
        paymentTier: row.paymentTier,
        selectedEventIds: row.selectedEvents.map((selection) => selection.eventId),
      },
    }));
  }

  private async loadCurrent(
    resource: ParticipationResource,
    target: TransferTarget,
    personId: string,
    tx: Prisma.TransactionClient,
  ): Promise<ParticipationResource | null> {
    // The artifact ID is a selector for existing subscriptions; an ID collision never reassigns ownership.
    if (resource.kind !== 'event-attendance') {
      const row =
        resource.kind === 'event-subscription'
          ? await tx.eventSubscription.findUnique({
              where: { id: resource.id },
              select: { eventId: true, personId: true, deletedAt: true },
            })
          : resource.kind === 'group-subscription'
            ? await tx.eventGroupSubscription.findUnique({
                where: { id: resource.id },
                select: { eventGroupId: true, personId: true, deletedAt: true },
              })
            : await tx.majorEventSubscription.findUnique({
                where: { id: resource.id },
                select: { majorEventId: true, personId: true, deletedAt: true },
              });
      if (row) {
        const rowTargetId =
          'eventId' in row ? row.eventId : 'eventGroupId' in row ? row.eventGroupId : row.majorEventId;
        if (row.deletedAt || row.personId !== personId || rowTargetId !== target.id)
          throw new ForbiddenException('O registro não está disponível neste contexto.');
      }
    }
    if (resource.kind === 'event-attendance') {
      const row = await tx.eventAttendance.findUnique({
        where: { personId_eventId: { personId, eventId: target.id } },
      });
      return row
        ? {
            kind: resource.kind,
            id: `${row.eventId}:${row.personId}`,
            data: {
              eventId: row.eventId,
              person: { id: row.personId },
              attendedAt: row.attendedAt.toISOString(),
              status: row.status,
            },
          }
        : null;
    }
    if (resource.kind === 'event-subscription') {
      const row = await tx.eventSubscription.findFirst({
        where: { eventId: target.id, personId, deletedAt: null },
        select: { ...subscriptionSelect, eventId: true },
      });
      return row
        ? {
            kind: resource.kind,
            id: row.id,
            data: {
              eventId: row.eventId,
              person: { id: row.personId },
              imageLicenseAgreementAccepted: row.imageLicenseAgreementAccepted,
            },
          }
        : null;
    }
    if (resource.kind === 'group-subscription') {
      const row = await tx.eventGroupSubscription.findFirst({
        where: { eventGroupId: target.id, personId, deletedAt: null },
        select: { ...subscriptionSelect, eventGroupId: true },
      });
      return row
        ? {
            kind: resource.kind,
            id: row.id,
            data: {
              eventGroupId: row.eventGroupId,
              person: { id: row.personId },
              imageLicenseAgreementAccepted: row.imageLicenseAgreementAccepted,
            },
          }
        : null;
    }
    const row = await tx.majorEventSubscription.findFirst({
      where: { majorEventId: target.id, personId, deletedAt: null },
      include: {
        selectedEvents: { where: { deletedAt: null }, select: { eventId: true }, orderBy: { eventId: 'asc' } },
      },
    });
    return row
      ? {
          kind: resource.kind,
          id: row.id,
          data: {
            majorEventId: row.majorEventId,
            person: { id: row.personId },
            imageLicenseAgreementAccepted: row.imageLicenseAgreementAccepted,
            subscriptionStatus: row.subscriptionStatus,
            amountPaid: row.amountPaid,
            paymentDate: row.paymentDate?.toISOString() ?? null,
            paymentTier: row.paymentTier,
            selectedEventIds: row.selectedEvents.map((selection) => selection.eventId),
          },
        }
      : null;
  }

  private async assertTarget(
    target: TransferTarget,
    context: TransferAdapterContext,
    transfer: Permission,
  ): Promise<void> {
    await this.authorization.assertPermissions(
      context.actor,
      [transfer, targetRead(target)],
      await this.targetScope(target, context),
    );
  }

  private async targetExists(target: TransferTarget, tx: Prisma.TransactionClient): Promise<boolean> {
    const row =
      target.kind === 'event'
        ? await tx.event.findFirst({ where: { id: target.id, deletedAt: null }, select: { id: true } })
        : target.kind === 'group'
          ? await tx.eventGroup.findFirst({ where: { id: target.id, deletedAt: null }, select: { id: true } })
          : await tx.majorEvent.findFirst({ where: { id: target.id, deletedAt: null }, select: { id: true } });
    return row !== null;
  }

  private async targetScope(
    target: TransferTarget,
    context: TransferAdapterContext,
    visited = new Set<string>(),
  ): Promise<TransferAuthorizationScope> {
    const key = `${target.kind}:${target.id}`;
    if (visited.has(key)) throw new TransferValidationException('A hierarquia de participação contém um ciclo.');
    visited.add(key);
    if (await this.targetExists(target, context.tx)) return scopeOf(target);
    const proposed = context.document.resources.find((row) => row.kind === target.kind && row.id === target.id);
    if (!proposed) throw new NotFoundException('Contexto de participação não encontrado.');
    if (proposed.kind === 'event' && proposed.data.eventGroupId)
      return this.targetScope({ kind: 'group', id: proposed.data.eventGroupId }, context, visited);
    if ((proposed.kind === 'event' || proposed.kind === 'group') && proposed.data.majorEventId)
      return this.targetScope({ kind: 'major-event', id: proposed.data.majorEventId }, context, visited);
    return {};
  }

  private async findSportsMatchForAttendance(eventId: string, tx: Prisma.TransactionClient) {
    const match = await tx.sportsMatch?.findFirst({
      where: { eventId, deletedAt: null },
      select: {
        id: true,
        state: true,
        canonicalState: true,
        revision: true,
        event: {
          select: {
            eventGroupId: true,
            majorEventId: true,
            eventGroup: { select: { majorEventId: true } },
          },
        },
        category: {
          select: {
            eventGroupId: true,
            tournament: { select: { majorEventId: true } },
          },
        },
      },
    });
    if (!match) return null;
    return {
      matchId: match.id,
      state: match.state,
      canonicalState: match.canonicalState,
      revision: match.revision,
      willTransition: false,
      eventGroupId: match.event.eventGroupId ?? match.category.eventGroupId,
      majorEventId:
        match.event.majorEventId ?? match.event.eventGroup?.majorEventId ?? match.category.tournament.majorEventId,
    };
  }

  private async eventHasEnabledTickets(eventId: string, tx: Prisma.TransactionClient): Promise<boolean> {
    if (!tx.ticketConfig) return false;
    const config = await tx.ticketConfig.findUnique({ where: { eventId }, select: { enabled: true } });
    return config?.enabled === true;
  }

  private sportsAttendanceSnapshot(
    preview: SportsMatchAttendanceCheckInPreview,
    willTransition: boolean,
    eventGroupId: string | null = null,
    majorEventId: string | null = null,
  ): SportsAttendanceSnapshot {
    return { ...preview, willTransition, eventGroupId, majorEventId };
  }

  private async paymentTierDependencies(
    resource: Extract<ParticipationResource, { kind: 'major-event-subscription' }>,
    majorEventId: string,
    context: TransferAdapterContext,
  ): Promise<Array<{ kind: 'price-tier'; id: string }>> {
    const paymentTier = resource.data.paymentTier;
    if (typeof paymentTier !== 'string' || paymentTier.trim().length === 0) return [];
    const targetName = normalizeAttendancePriceTier(paymentTier);
    const candidates = context.document.resources.filter(
      (row) =>
        row.kind === 'price-tier' &&
        typeof row.data.name === 'string' &&
        normalizeAttendancePriceTier(row.data.name) === targetName,
    );
    const references: Array<{ kind: 'price-tier'; id: string }> = [];
    for (const candidate of candidates) {
      if (candidate.kind !== 'price-tier') continue;
      const priceId = candidate.data.priceId;
      if (!priceId) continue;
      const proposedPrice = context.document.resources.find(
        (row) => row.kind === 'major-event-price' && row.id === priceId,
      );
      const existingPrice = proposedPrice
        ? null
        : await context.tx.majorEventPrice.findFirst({ where: { id: priceId }, select: { majorEventId: true } });
      const candidateMajorEventId =
        proposedPrice?.kind === 'major-event-price' ? proposedPrice.data.majorEventId : existingPrice?.majorEventId;
      if (candidateMajorEventId === majorEventId) references.push({ kind: 'price-tier', id: candidate.id });
    }
    if (references.length > 1) {
      throw new TransferValidationException(
        'A faixa de pagamento informada corresponde a mais de uma faixa deste arquivo.',
      );
    }
    return references;
  }

  private async assertEnrollmentTargets(
    eventIds: string[],
    personId: string,
    context: TransferAdapterContext,
  ): Promise<void> {
    for (const eventId of [...new Set(eventIds)]) {
      await this.authorization.assertPermissions(
        context.actor,
        [
          Permission.DataTransfer.Import,
          Permission.Event.Read,
          Permission.Subscription.Read,
          Permission.Subscription.Import,
          Permission.Subscription.Create,
          Permission.Subscription.Update,
        ],
        await this.targetScope({ kind: 'event', id: eventId }, context),
      );
      if (await this.targetExists({ kind: 'event', id: eventId }, context.tx))
        await context.frozenResources.assertEventMutable(eventId, context.actor, 'edit');
      const lecturer = await context.tx.eventLecturer.findUnique({
        where: { eventId_personId: { eventId, personId } },
        select: { personId: true },
      });
      if (lecturer)
        throw new TransferValidationException(
          'Palestrantes não podem ser inscritos como participantes nos seus próprios eventos.',
        );
    }
  }

  private async ensureSelectionsBelong(
    majorEventId: string,
    eventIds: string[],
    context: TransferAdapterContext,
  ): Promise<void> {
    for (const id of eventIds) {
      const existing = await context.tx.event.findFirst({
        where: {
          id,
          deletedAt: null,
          sportsMatch: { is: null },
          OR: [{ majorEventId }, { eventGroup: { majorEventId, deletedAt: null } }],
        },
        select: { id: true },
      });
      if (existing) continue;
      const proposed = context.document.resources.find((row) => row.kind === 'event' && row.id === id);
      if (proposed?.kind !== 'event' || proposed.data.majorEventId !== majorEventId)
        throw new TransferValidationException(
          'Os eventos selecionados devem pertencer ao grande evento e não podem ser partidas esportivas.',
        );
      const anyExisting = await context.tx.event.findUnique({ where: { id }, select: { id: true } });
      if (anyExisting) throw new TransferValidationException('Não é possível mover uma inscrição de outro contexto.');
    }
  }

  private async groupEventIds(eventGroupId: string, tx: Prisma.TransactionClient): Promise<string[]> {
    const events = await tx.event.findMany({
      where: { eventGroupId, deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: TRANSFER_MAX_RESOURCES + 1,
    });
    this.assertBound(events);
    return events.map((event) => event.id);
  }

  private assertBound(rows: readonly unknown[]): void {
    if (rows.length > TRANSFER_MAX_RESOURCES)
      throw new TransferValidationException('Este conjunto excede 500 registros. Use um contexto menor.');
  }
}
