import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeletionResult, EventDraft, EventDraftSaveInput, EventUpdateInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogEntityType, AuditLogOperation, Prisma, PublicationState as PrismaPublicationState } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

type AuditPrismaClient = PrismaService | Prisma.TransactionClient;

type DraftActorInfo = {
  id: string | null;
  name: string | null;
  email: string | null;
};

type EventDraftPayload = Prisma.InputJsonObject;

const EVENT_DATE_FIELDS = new Set([
  'startDate',
  'endDate',
  'subscriptionStartDate',
  'subscriptionEndDate',
  'onlineAttendanceStartDate',
  'onlineAttendanceEndDate',
]);

const EVENT_DRAFT_RETENTION_DAYS = 30;
const EVENT_DRAFT_CLEANUP_BATCH_SIZE = 200;

const MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  description: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  maxUncategorizedPerAttendee: true,
  rankedSubscriptionEnabled: true,
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  additionalPaymentInfo: true,
  publicationState: true,
  scheduledPublishAt: true,
  publishedAt: true,
  unpublishedAt: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.MajorEventSelect;

const EVENT_GROUP_SELECT = {
  id: true,
  name: true,
  emoji: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  shouldIssueCertificateForEachEvent: true,
  shouldIssuePartialCertificate: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventGroupSelect;

const EVENT_DETAIL_SELECT = {
  id: true,
  name: true,
  creditMinutes: true,
  startDate: true,
  endDate: true,
  type: true,
  emoji: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  majorEventId: true,
  majorEvent: {
    select: MAJOR_EVENT_SELECT,
  },
  eventGroupId: true,
  eventGroup: {
    select: EVENT_GROUP_SELECT,
  },
  allowSubscription: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  slots: true,
  autoSubscribe: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  shouldProvideSubscriberListToLecturer: true,
  onlineAttendanceCode: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  publiclyVisible: true,
  publicationState: true,
  scheduledPublishAt: true,
  publishedAt: true,
  unpublishedAt: true,
  youtubeCode: true,
  buttonText: true,
  buttonLink: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventSelect;

const EVENT_AUDIT_SELECT = {
  id: true,
  name: true,
  creditMinutes: true,
  startDate: true,
  endDate: true,
  type: true,
  emoji: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  majorEventId: true,
  eventGroupId: true,
  allowSubscription: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  slots: true,
  autoSubscribe: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  shouldProvideSubscriberListToLecturer: true,
  onlineAttendanceCode: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  publiclyVisible: true,
  publicationState: true,
  scheduledPublishAt: true,
  publishedAt: true,
  unpublishedAt: true,
  youtubeCode: true,
  buttonText: true,
  buttonLink: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventSelect;

const EVENT_DRAFT_SELECT = {
  id: true,
  sourceEventId: true,
  name: true,
  payload: true,
  createdById: true,
  createdByName: true,
  createdByEmail: true,
  updatedById: true,
  updatedByName: true,
  updatedByEmail: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
} satisfies Prisma.EventDraftSelect;

@Injectable()
export class EventDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly frozenResources: FrozenResourceService,
    private readonly auditLog: AuditLogService,
    private readonly attendanceRealtime: CurrentUserOnlineAttendanceRealtimeService,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  async listEventDrafts(
    user: AuthenticatedUser | undefined,
    options: { sourceEventId?: string; sourceEventIds?: string[] } = {},
  ): Promise<EventDraft[]> {
    const requestedIds = [...new Set([...(options.sourceEventIds ?? []), options.sourceEventId].filter(Boolean))] as string[];
    const sourceEventIds = await this.editableSourceEventIds(user, requestedIds);
    if (sourceEventIds.length === 0) {
      return [];
    }

    const drafts = await this.prisma.eventDraft.findMany({
      where: {
        sourceEventId: {
          in: sourceEventIds,
        },
      },
      select: EVENT_DRAFT_SELECT,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return drafts.map((draft) => this.mapDraft(draft));
  }

  async saveEventDraft(input: EventDraftSaveInput, user: AuthenticatedUser | undefined): Promise<EventDraft> {
    const sourceEvent = await this.readSourceEventForDraft(input.sourceEventId);
    const normalizedInput = await this.normalizeEventCertificateInput(input.input, sourceEvent.id);
    await this.assertCanWriteDraft(sourceEvent.id, normalizedInput, user);

    const actor = await this.resolveDraftActor(user);
    const payload = this.normalizeDraftPayload(normalizedInput);
    const draftName = this.draftName(payload, sourceEvent.name);

    return this.prisma.$transaction(async (tx) => {
      if (input.draftId) {
        const previous = await tx.eventDraft.findFirst({
          where: {
            id: input.draftId,
            sourceEventId: sourceEvent.id,
          },
          select: EVENT_DRAFT_SELECT,
        });
        if (!previous) {
          throw new NotFoundException(`Event draft ${input.draftId} was not found.`);
        }

        const updated = await tx.eventDraft.update({
          where: {
            id: previous.id,
          },
          data: {
            name: draftName,
            payload,
            expiresAt: this.draftExpiresAt(payload, sourceEvent.endDate, previous.createdAt),
            updatedById: actor.id,
            updatedByName: actor.name,
            updatedByEmail: actor.email,
          },
          select: EVENT_DRAFT_SELECT,
        });
        await this.auditDraftChange(tx, {
          operation: AuditLogOperation.UPDATE,
          sourceEvent,
          before: this.auditDraftSnapshot(previous),
          after: this.auditDraftSnapshot(updated),
          user,
          summary: `Rascunho "${updated.name}" atualizado.`,
          draftId: updated.id,
        });
        return this.mapDraft(updated);
      }

      const created = await tx.eventDraft.create({
        data: {
          sourceEventId: sourceEvent.id,
          name: draftName,
          payload,
          expiresAt: this.draftExpiresAt(payload, sourceEvent.endDate),
          createdById: actor.id,
          createdByName: actor.name,
          createdByEmail: actor.email,
          updatedById: actor.id,
          updatedByName: actor.name,
          updatedByEmail: actor.email,
        },
        select: EVENT_DRAFT_SELECT,
      });
      await this.auditDraftChange(tx, {
        operation: AuditLogOperation.CREATE,
        sourceEvent,
        after: this.auditDraftSnapshot(created),
        user,
        summary: `Rascunho "${created.name}" criado.`,
        draftId: created.id,
      });
      return this.mapDraft(created);
    });
  }

  async applyEventDraft(draftId: string, user: AuthenticatedUser | undefined) {
    const draft = await this.prisma.eventDraft.findUnique({
      where: { id: draftId },
      select: EVENT_DRAFT_SELECT,
    });
    if (!draft) {
      throw new NotFoundException(`Event draft ${draftId} was not found.`);
    }

    const payload = await this.normalizeEventCertificateInput(
      this.eventInputFromDraftPayload(draft.payload),
      draft.sourceEventId,
    );
    await this.assertCanWriteDraft(draft.sourceEventId, payload, user);

    const event = await this.prisma.$transaction(async (tx) => {
      const previousEvent = await tx.event.findFirst({
        where: { id: draft.sourceEventId, deletedAt: null },
        select: EVENT_AUDIT_SELECT,
      });
      if (!previousEvent) {
        throw new NotFoundException(`Event ${draft.sourceEventId} was not found.`);
      }

      await tx.event.updateMany({
        where: { id: draft.sourceEventId, deletedAt: null },
        data: {
          ...payload,
          publicationState: PrismaPublicationState.PUBLISHED,
          scheduledPublishAt: null,
          publishedAt: previousEvent.publishedAt ?? new Date(),
          unpublishedAt: null,
          publicationUpdatedBy: user?.sub ?? null,
        },
      });
      await tx.eventDraft.delete({ where: { id: draft.id } });

      const updated = await tx.event.findUniqueOrThrow({
        where: { id: draft.sourceEventId, deletedAt: null },
        select: EVENT_DETAIL_SELECT,
      });
      const updatedAudit = await tx.event.findUniqueOrThrow({
        where: { id: draft.sourceEventId, deletedAt: null },
        select: EVENT_AUDIT_SELECT,
      });
      await this.disableGroupPerEventModeForMajorEvent(updated, tx);
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: updated.id,
          entityLabel: updated.name,
          operation: AuditLogOperation.UPDATE,
          actor: user,
          before: previousEvent,
          after: updatedAudit,
          scope: {
            permission: Permission.Event.Update,
            eventId: updated.id,
            majorEventId: updated.majorEventId,
            eventGroupId: updated.eventGroupId,
          },
          summary: `Rascunho "${draft.name}" aplicado à publicação.`,
          metadata: {
            draftId: draft.id,
            draftName: draft.name,
            draftUpdatedAt: draft.updatedAt.toISOString(),
          },
          force: true,
        },
        tx,
      );
      return updated;
    });

    await this.typesenseSearch.upsertEvent({
      id: event.id,
      name: event.name,
      emoji: event.emoji,
      type: event.type,
      description: event.description,
      shortDescription: event.shortDescription,
      locationDescription: event.locationDescription,
      majorEventId: event.majorEventId,
      eventGroupId: event.eventGroupId,
      shouldIssueCertificate: event.shouldIssueCertificate,
      publiclyVisible: event.publiclyVisible,
      publicationState: event.publicationState,
      startDate: event.startDate,
      endDate: event.endDate,
    });
    if (this.didChangeOnlineAttendanceWindow(payload)) {
      await this.attendanceRealtime.notifyAllConnectedPeople();
    }
    return event;
  }

  async deleteEventDraft(draftId: string, user: AuthenticatedUser | undefined): Promise<DeletionResult> {
    const draft = await this.prisma.eventDraft.findUnique({
      where: { id: draftId },
      select: EVENT_DRAFT_SELECT,
    });
    if (!draft) {
      throw new NotFoundException(`Event draft ${draftId} was not found.`);
    }

    await this.assertCanWriteDraft(draft.sourceEventId, this.eventInputFromDraftPayload(draft.payload), user);
    await this.deleteDrafts([draft], user);

    return {
      deleted: true,
      id: draft.id,
      eventId: draft.sourceEventId,
    };
  }

  async deleteEventDraftsForEvent(sourceEventId: string, user: AuthenticatedUser | undefined): Promise<DeletionResult> {
    const sourceEvent = await this.readSourceEventForDraft(sourceEventId);
    await this.assertCanWriteDraft(sourceEvent.id, {}, user);
    const drafts = await this.prisma.eventDraft.findMany({
      where: { sourceEventId: sourceEvent.id },
      select: EVENT_DRAFT_SELECT,
    });
    await this.deleteDrafts(drafts, user);

    return {
      deleted: true,
      id: sourceEvent.id,
      eventId: sourceEvent.id,
    };
  }

  async cleanupStaleDrafts(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - EVENT_DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const drafts = await this.prisma.eventDraft.findMany({
      where: {
        expiresAt: { lte: now },
      },
      select: EVENT_DRAFT_SELECT,
      take: EVENT_DRAFT_CLEANUP_BATCH_SIZE,
      orderBy: [{ updatedAt: 'asc' }],
    });

    if (drafts.length === 0) {
      return 0;
    }

    await this.deleteDrafts(drafts, null, {
      summary: 'Rascunho removido automaticamente por expiração.',
      metadata: { cleanupReason: 'STALE_EVENT_DRAFT', cutoff: cutoff.toISOString(), now: now.toISOString() },
    });
    return drafts.length;
  }

  private async editableSourceEventIds(user: AuthenticatedUser | undefined, requestedIds: string[]): Promise<string[]> {
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(user, Permission.Event.Update);
    if (accessibleTargets && this.isEmptyAccessibleEventTargets(accessibleTargets)) {
      return [];
    }

    const where: Prisma.EventWhereInput = {
      deletedAt: null,
    };
    if (requestedIds.length > 0) {
      where.id = { in: requestedIds };
    }
    if (accessibleTargets) {
      where.AND = [this.buildAccessibleEventWhere(accessibleTargets)];
    }

    const events = await this.prisma.event.findMany({
      where,
      select: { id: true },
      take: requestedIds.length > 0 ? requestedIds.length : 200,
    });
    return events.map((event) => event.id);
  }

  private async readSourceEventForDraft(sourceEventId: string): Promise<{ id: string; name: string; endDate: Date }> {
    const sourceEvent = await this.prisma.event.findFirst({
      where: { id: sourceEventId, deletedAt: null },
      select: { id: true, name: true, endDate: true },
    });
    if (!sourceEvent) {
      throw new NotFoundException(`Event ${sourceEventId} was not found.`);
    }
    return sourceEvent;
  }

  private async assertCanWriteDraft(
    sourceEventId: string,
    input: Pick<EventUpdateInput, 'majorEventId' | 'eventGroupId'>,
    user: AuthenticatedUser | undefined,
  ): Promise<void> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.Event.Update], { eventId: sourceEventId });
    await this.assertEventUpdateRelationPermissions(sourceEventId, input, user);
    await this.frozenResources.assertEventUpdateMutable(sourceEventId, input, user);
  }

  private async assertEventUpdateRelationPermissions(
    eventId: string,
    input: Pick<EventUpdateInput, 'majorEventId' | 'eventGroupId'>,
    user: AuthenticatedUser | undefined,
  ): Promise<void> {
    if (input.majorEventId === undefined && input.eventGroupId === undefined) {
      return;
    }

    const currentEvent = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { majorEventId: true, eventGroupId: true },
    });
    if (!currentEvent) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    const majorEventId = this.changedTargetId(currentEvent.majorEventId, input.majorEventId);
    if (majorEventId) {
      await this.authorizationPolicy.assertPermissions(user, [Permission.Event.Update], { majorEventId });
    }

    const eventGroupId = this.changedTargetId(currentEvent.eventGroupId, input.eventGroupId);
    if (eventGroupId) {
      await this.authorizationPolicy.assertPermissions(user, [Permission.Event.Update], { eventGroupId });
    }
  }

  private changedTargetId(currentId: string | null, nextId: string | null | undefined): string | undefined {
    if (nextId === undefined || nextId === null || nextId === currentId) {
      return undefined;
    }

    return nextId;
  }

  private normalizeDraftPayload(input: EventUpdateInput): Prisma.InputJsonObject {
    return this.normalizeJsonRecord(input);
  }

  private normalizeJsonRecord(input: object): EventDraftPayload {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, this.normalizeJsonValue(value)]),
    );
  }

  private normalizeJsonValue(value: unknown): Prisma.InputJsonValue | null {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeJsonValue(item)) as Prisma.InputJsonArray;
    }

    if (value && typeof value === 'object') {
      return this.normalizeJsonRecord(value);
    }

    if (value === undefined) {
      return null;
    }

    return (value ?? null) as Prisma.InputJsonValue | null;
  }

  private eventInputFromDraftPayload(payload: Prisma.JsonValue): EventUpdateInput {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('Event draft payload is invalid.');
    }

    return Object.fromEntries(
      Object.entries(payload as Record<string, Prisma.JsonValue>).map(([key, value]) => [
        key,
        EVENT_DATE_FIELDS.has(key) && typeof value === 'string' ? new Date(value) : value,
      ]),
    ) as EventUpdateInput;
  }

  private draftName(payload: EventDraftPayload, fallbackName: string): string {
    const name = payload['name'];
    return typeof name === 'string' && name.trim() ? name.trim() : fallbackName;
  }

  private draftExpiresAt(payload: EventDraftPayload, sourceEventEndDate: Date | null | undefined, fallbackDate = new Date()): Date {
    const payloadEndDate = payload['endDate'];
    const payloadBaseDate = typeof payloadEndDate === 'string' ? this.validDateOrNull(payloadEndDate) : null;
    const baseDate = payloadBaseDate ?? (sourceEventEndDate instanceof Date ? sourceEventEndDate : fallbackDate);

    return new Date(baseDate.getTime() + EVENT_DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  }

  private validDateOrNull(value: string): Date | null {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  private async normalizeEventCertificateInput(input: EventUpdateInput, eventId: string): Promise<EventUpdateInput> {
    let normalizedInput = input;
    if (input.shouldIssueCertificate === false) {
      normalizedInput = {
        ...input,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      };
    }

    const existingEvent =
      normalizedInput.eventGroupId === undefined
        ? await this.prisma.event.findFirst({
            where: {
              id: eventId,
              deletedAt: null,
            },
            select: {
              eventGroupId: true,
            },
          })
        : null;
    const eventGroupId =
      normalizedInput.eventGroupId === undefined ? existingEvent?.eventGroupId : normalizedInput.eventGroupId;

    if (!eventGroupId) {
      return normalizedInput;
    }

    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: {
        id: eventGroupId,
        deletedAt: null,
      },
      select: {
        shouldIssueCertificate: true,
        shouldIssueCertificateForNonPayingAttendees: true,
        shouldIssueCertificateForNonSubscribedAttendees: true,
      },
    });

    if (!eventGroup?.shouldIssueCertificate) {
      return {
        ...normalizedInput,
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      };
    }

    if (
      !eventGroup.shouldIssueCertificateForNonPayingAttendees ||
      !eventGroup.shouldIssueCertificateForNonSubscribedAttendees
    ) {
      return {
        ...normalizedInput,
        shouldIssueCertificateForNonPayingAttendees: eventGroup.shouldIssueCertificateForNonPayingAttendees
          ? normalizedInput.shouldIssueCertificateForNonPayingAttendees
          : false,
        shouldIssueCertificateForNonSubscribedAttendees: eventGroup.shouldIssueCertificateForNonSubscribedAttendees
          ? normalizedInput.shouldIssueCertificateForNonSubscribedAttendees
          : false,
      };
    }

    return normalizedInput;
  }

  private didChangeOnlineAttendanceWindow(input: EventUpdateInput): boolean {
    return (
      input.shouldCollectAttendance !== undefined ||
      input.isOnlineAttendanceAllowed !== undefined ||
      input.onlineAttendanceCode !== undefined ||
      input.onlineAttendanceStartDate !== undefined ||
      input.onlineAttendanceEndDate !== undefined
    );
  }

  private async resolveDraftActor(user: AuthenticatedUser | undefined): Promise<DraftActorInfo> {
    if (!user) {
      return { id: null, name: null, email: null };
    }

    const persistedUser = user.sub
      ? await this.prisma.user.findUnique({
          where: { id: user.sub },
          select: { name: true, email: true },
        })
      : null;
    const claimName = this.readStringClaim(user.claims, 'name') ?? this.readStringClaim(user.claims, 'preferred_username');

    return {
      id: user.sub ?? null,
      name: persistedUser?.name ?? claimName ?? user.preferredUsername ?? user.email ?? user.sub ?? null,
      email: persistedUser?.email ?? user.email ?? null,
    };
  }

  private readStringClaim(claims: Record<string, unknown>, key: string): string | null {
    const value = claims[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private async deleteDrafts(
    drafts: Array<Prisma.EventDraftGetPayload<{ select: typeof EVENT_DRAFT_SELECT }>>,
    user: AuthenticatedUser | null | undefined,
    options: { summary?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<void> {
    if (drafts.length === 0) {
      return;
    }

    const sourceEvents = await this.prisma.event.findMany({
      where: {
        id: {
          in: [...new Set(drafts.map((draft) => draft.sourceEventId))],
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
    const sourceEventNames = new Map(sourceEvents.map((event) => [event.id, event.name]));

    await this.prisma.$transaction(async (tx) => {
      await tx.eventDraft.deleteMany({
        where: {
          id: {
            in: drafts.map((draft) => draft.id),
          },
        },
      });

      for (const draft of drafts) {
        await this.auditDraftChange(tx, {
          operation: AuditLogOperation.DELETE,
          sourceEvent: { id: draft.sourceEventId, name: sourceEventNames.get(draft.sourceEventId) ?? draft.name },
          before: this.auditDraftSnapshot(draft),
          user,
          summary: options.summary ?? `Rascunho "${draft.name}" excluído.`,
          draftId: draft.id,
          metadata: options.metadata,
        });
      }
    });
  }

  private auditDraftSnapshot(draft: Prisma.EventDraftGetPayload<{ select: typeof EVENT_DRAFT_SELECT }>) {
    return {
      draftId: draft.id,
      sourceEventId: draft.sourceEventId,
      name: draft.name,
      createdByName: draft.createdByName,
      updatedByName: draft.updatedByName,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      expiresAt: draft.expiresAt,
    };
  }

  private async auditDraftChange(
    prisma: AuditPrismaClient,
    options: {
      operation: AuditLogOperation;
      sourceEvent: { id: string; name: string };
      before?: unknown;
      after?: unknown;
      user: AuthenticatedUser | null | undefined;
      summary: string;
      draftId: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.auditLog.record(
      {
        entityType: AuditLogEntityType.EVENT,
        entityId: options.sourceEvent.id,
        entityLabel: options.sourceEvent.name,
        operation: options.operation,
        actor: options.user,
        before: options.before,
        after: options.after,
        scope: {
          permission: Permission.Event.Update,
          eventId: options.sourceEvent.id,
        },
        summary: options.summary,
        metadata: {
          draftId: options.draftId,
          ...(options.metadata ?? {}),
        },
        force: true,
      },
      prisma,
    );
  }

  private mapDraft(draft: Prisma.EventDraftGetPayload<{ select: typeof EVENT_DRAFT_SELECT }>): EventDraft {
    return {
      ...draft,
      payloadJson: JSON.stringify(draft.payload),
    };
  }

  private async disableGroupPerEventModeForMajorEvent(
    event: { eventGroupId?: string | null; majorEventId?: string | null },
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (!event.eventGroupId || !event.majorEventId) {
      return;
    }

    await prisma.eventGroup.updateMany({
      where: {
        id: event.eventGroupId,
        deletedAt: null,
        shouldIssueCertificateForEachEvent: true,
      },
      data: {
        shouldIssueCertificateForEachEvent: false,
      },
    });
  }

  private isEmptyAccessibleEventTargets(targets: {
    eventIds: Set<string>;
    majorEventIds: Set<string>;
    eventGroupIds: Set<string>;
  }): boolean {
    return targets.eventIds.size === 0 && targets.majorEventIds.size === 0 && targets.eventGroupIds.size === 0;
  }

  private buildAccessibleEventWhere(targets: {
    eventIds: Set<string>;
    majorEventIds: Set<string>;
    eventGroupIds: Set<string>;
  }): Prisma.EventWhereInput {
    const OR: Prisma.EventWhereInput[] = [];

    if (targets.eventIds.size > 0) {
      OR.push({ id: { in: [...targets.eventIds] } });
    }
    if (targets.majorEventIds.size > 0) {
      OR.push({ majorEventId: { in: [...targets.majorEventIds] } });
    }
    if (targets.eventGroupIds.size > 0) {
      OR.push({ eventGroupId: { in: [...targets.eventGroupIds] } });
    }

    return OR.length === 0 ? { id: { in: [] } } : { OR };
  }
}
