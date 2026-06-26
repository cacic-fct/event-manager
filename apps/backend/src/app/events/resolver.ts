import { DeletionResult, Event, EventCloneInput, EventCreateInput, EventUpdateInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuditLogEntityType,
  AuditLogOperation,
  CertificateScope,
  Prisma,
  PublicationState as PrismaPublicationState,
} from '@prisma/client';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  AccessibleEventGrantTargets,
  AuthorizationPolicyService,
} from '../authorization/authorization-policy.service';
import { resolvePagination } from '../common/pagination';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { resolvePublicationActorId } from '../publishing/publishing-auth';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

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
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  additionalPaymentInfo: true,
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

const EVENT_BASE_SELECT = {
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

const EVENT_DETAIL_SELECT = {
  ...EVENT_BASE_SELECT,
  attendances: true,
  lecturers: true,
} satisfies Prisma.EventSelect;

const EVENT_CLONE_SOURCE_SELECT = {
  ...EVENT_AUDIT_SELECT,
  lecturers: {
    select: {
      personId: true,
    },
  },
  certificateConfigs: {
    where: {
      deletedAt: null,
    },
    select: {
      name: true,
      certificateTemplateId: true,
      certificateText: true,
      shouldAutofillSecondPage: true,
      secondPageText: true,
      isActive: true,
      issuedTo: true,
      certificateFields: true,
    },
  },
} satisfies Prisma.EventSelect;

const DEFAULT_DRAFT_EVENT_NAME = 'Evento sem título';
const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

@Resolver(() => Event)
export class EventsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
    private readonly attendanceRealtime: CurrentUserOnlineAttendanceRealtimeService,
    private readonly frozenResources: FrozenResourceService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
    } as unknown as AuditLogService,
  ) {}

  @Query(() => [Event], { name: 'events' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.Event.Read)
  async events(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('startDateFrom', { type: () => Date, nullable: true })
    startDateFrom?: Date,
    @Args('startDateUntil', { type: () => Date, nullable: true })
    startDateUntil?: Date,
    @Args('majorEventId', { type: () => String, nullable: true })
    majorEventId?: string,
    @Args('eventGroupId', { type: () => String, nullable: true })
    eventGroupId?: string,
    @Args('isInGroup', { type: () => Boolean, nullable: true })
    isInGroup?: boolean,
    @Args('isInMajorEvent', { type: () => Boolean, nullable: true })
    isInMajorEvent?: boolean,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
    };
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(
      this.getUser(context),
      Permission.Event.Read,
    );
    if (accessibleTargets && this.isEmptyAccessibleEventTargets(accessibleTargets)) {
      return [];
    }
    if (accessibleTargets) {
      where.AND = [this.buildAccessibleEventWhere(accessibleTargets)];
    }
    const normalizedQuery = query?.trim();

    if (startDateFrom || startDateUntil) {
      where.startDate = {};
      if (startDateFrom) {
        where.startDate.gte = startDateFrom;
      }
      if (startDateUntil) {
        where.startDate.lte = startDateUntil;
      }
    }

    if (eventGroupId) {
      where.eventGroupId = eventGroupId;
    }

    if (majorEventId) {
      where.majorEventId = majorEventId;
    }

    if (typeof isInGroup === 'boolean') {
      where.eventGroupId = isInGroup ? { not: null } : null;
    }

    if (typeof isInMajorEvent === 'boolean') {
      where.majorEventId = isInMajorEvent ? { not: null } : null;
    }

    let prioritizedIds: string[] = [];
    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled() && !accessibleTargets) {
        const searchResult = await this.typesenseSearch.searchEvents(
          normalizedQuery,
          pagination.skip + pagination.take,
        );
        if (searchResult.available) {
          prioritizedIds = searchResult.ids;
          if (prioritizedIds.length === 0) {
            return [];
          }
          where.id = { in: prioritizedIds };
        } else {
          where.name = { contains: normalizedQuery, mode: 'insensitive' };
        }
      } else {
        where.name = { contains: normalizedQuery, mode: 'insensitive' };
      }
    }

    const events = await this.prisma.event.findMany({
      where,
      select: EVENT_BASE_SELECT,
      orderBy: {
        startDate: 'desc',
      },
      skip: prioritizedIds.length > 0 ? 0 : pagination.skip,
      take: prioritizedIds.length > 0 ? prioritizedIds.length : pagination.take,
    });

    if (prioritizedIds.length === 0) {
      return events;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...events]
      .sort(
        (left, right) =>
          (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(pagination.skip, pagination.skip + pagination.take);
  }

  @Query(() => Event, { name: 'event' })
  @RequirePermissions(Permission.Event.Read)
  async event(@Args('id', { type: () => String }) id: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: EVENT_DETAIL_SELECT,
    });

    if (!event) {
      throw new NotFoundException(`Event ${id} was not found.`);
    }

    return event;
  }

  @Mutation(() => Event, { name: 'createEvent' })
  @RequirePermissions(Permission.Event.Create)
  async createEvent(
    @Args('input', { type: () => EventCreateInput }) input: EventCreateInput,
    @Context() context: GraphqlContext,
  ) {
    const user = this.getUser(context);
    await this.assertEventCreateRelationPermissions(input, user);
    await this.frozenResources.assertEventCreateTargetsMutable(input, user);
    const normalizedInput = this.applyEventCreateDefaults(await this.normalizeEventCertificateInput(input));
    const eventInput = { ...normalizedInput };
    const lecturerPersonIds = eventInput.lecturerPersonIds;
    const attendanceCollectorPersonIds = eventInput.attendanceCollectorPersonIds;
    delete eventInput.lecturerPersonIds;
    delete eventInput.attendanceCollectorPersonIds;
    const actorId = context.req?.user?.sub ?? context.request?.user?.sub;
    const uniqueLecturerPersonIds = [...new Set(lecturerPersonIds ?? [])];
    const uniqueAttendanceCollectorPersonIds = [...new Set(attendanceCollectorPersonIds ?? [])];
    const event = await this.prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          ...eventInput,
          lecturers:
            uniqueLecturerPersonIds.length > 0
              ? {
                  create: uniqueLecturerPersonIds.map((personId) => ({
                    person: {
                      connect: {
                        id: personId,
                      },
                    },
                    createdById: actorId,
                  })),
                }
              : undefined,
          attendanceCollectors:
            uniqueAttendanceCollectorPersonIds.length > 0
              ? {
                  create: uniqueAttendanceCollectorPersonIds.map((personId) => ({
                    person: {
                      connect: {
                        id: personId,
                      },
                    },
                    createdById: actorId,
                  })),
                }
              : undefined,
        },
        select: EVENT_DETAIL_SELECT,
      });
      await this.disableGroupPerEventModeForMajorEvent(createdEvent, tx);
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: createdEvent.id,
          entityLabel: createdEvent.name,
          operation: AuditLogOperation.CREATE,
          actor: this.getUser(context),
          after: createdEvent,
          scope: {
            permission: Permission.Event.Create,
            eventId: createdEvent.id,
            majorEventId: createdEvent.majorEventId,
            eventGroupId: createdEvent.eventGroupId,
          },
          summary: 'Evento criado.',
        },
        tx,
      );
      return createdEvent;
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
    return event;
  }

  @Mutation(() => Event, { name: 'updateEvent' })
  @RequirePermissions(Permission.Event.Update)
  async updateEvent(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => EventUpdateInput }) input: EventUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    const user = this.getUser(context);
    await this.assertEventUpdateRelationPermissions(id, input, user);
    await this.frozenResources.assertEventUpdateMutable(id, input, user);
    const normalizedInput = await this.normalizeEventCertificateInput(input, id);
    const event = await this.prisma.$transaction(async (tx) => {
      const previousEvent = await tx.event.findFirst({
        where: { id, deletedAt: null },
        select: EVENT_AUDIT_SELECT,
      });
      if (!previousEvent) throw new NotFoundException(`Event ${id} was not found.`);
      const updatedCount = await tx.event.updateMany({
        where: { id, deletedAt: null },
        data: {
          ...normalizedInput,
          ...this.buildPublicationInvalidation(previousEvent, this.getUser(context)),
        },
      });
      if (updatedCount.count !== 1) {
        throw new NotFoundException(`Event ${id} was not found.`);
      }
      const updated = await tx.event.findUniqueOrThrow({ where: { id, deletedAt: null }, select: EVENT_DETAIL_SELECT });
      const updatedAudit = await tx.event.findUniqueOrThrow({ where: { id, deletedAt: null }, select: EVENT_AUDIT_SELECT });
      await this.disableGroupPerEventModeForMajorEvent(updated, tx);
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: updated.id,
          entityLabel: updated.name,
          operation: AuditLogOperation.UPDATE,
          actor: this.getUser(context),
          before: previousEvent,
          after: updatedAudit,
          scope: {
            permission: Permission.Event.Update,
            eventId: updatedAudit.id,
            majorEventId: updatedAudit.majorEventId,
            eventGroupId: updatedAudit.eventGroupId,
          },
          summary: 'Evento atualizado.',
        },
        tx,
      );
      return updated;
    });
    if (event) {
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
      if (this.didChangeOnlineAttendanceWindow(input)) {
        await this.attendanceRealtime.notifyAllConnectedPeople();
      }
    }
    return event;
  }

  @Mutation(() => Event, { name: 'cloneEvent' })
  @RequirePermissions(Permission.Event.Read)
  async cloneEvent(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => EventCloneInput, nullable: true }) input: EventCloneInput | null,
    @Context() context: GraphqlContext,
  ) {
    const source = await this.prisma.event.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: EVENT_CLONE_SOURCE_SELECT,
    });

    if (!source) {
      throw new NotFoundException(`Event ${id} was not found.`);
    }

    const parts = input?.parts;
    const shouldCopyLecturers = Boolean(parts?.lecturers);
    const shouldCopyCertificateConfig = Boolean(parts?.certificateConfig);
    if (shouldCopyLecturers) {
      await this.authorizationPolicy.assertPermissions(this.getUser(context), [Permission.EventLecturer.Read], {
        eventId: source.id,
      });
    }
    if (shouldCopyCertificateConfig) {
      await this.authorizationPolicy.assertPermissions(this.getUser(context), [Permission.CertificateConfig.Read], {
        eventId: source.id,
      });
    }

    const cloneInput: EventCreateInput = {
      name: this.buildCloneName(input?.name, source.name),
      creditMinutes: source.creditMinutes ?? undefined,
      startDate: source.startDate,
      endDate: source.endDate,
      type: source.type,
      emoji: source.emoji,
      description: source.description ?? undefined,
      shortDescription: source.shortDescription ?? undefined,
      majorEventId: source.majorEventId ?? undefined,
      eventGroupId: source.eventGroupId ?? undefined,
      youtubeCode: source.youtubeCode ?? undefined,
      buttonText: source.buttonText ?? undefined,
      buttonLink: source.buttonLink ?? undefined,
      ...(parts?.place
        ? {
            latitude: source.latitude ?? undefined,
            longitude: source.longitude ?? undefined,
            locationDescription: source.locationDescription ?? undefined,
          }
        : {}),
      ...(parts?.subscriptionSettings
        ? {
            allowSubscription: source.allowSubscription,
            subscriptionStartDate: source.subscriptionStartDate ?? undefined,
            subscriptionEndDate: source.subscriptionEndDate ?? undefined,
            slots: source.slots ?? undefined,
            autoSubscribe: source.autoSubscribe,
          }
        : {}),
      ...(shouldCopyCertificateConfig
        ? {
            shouldIssueCertificate: source.shouldIssueCertificate,
            shouldIssueCertificateForNonPayingAttendees: source.shouldIssueCertificateForNonPayingAttendees,
            shouldIssueCertificateForNonSubscribedAttendees: source.shouldIssueCertificateForNonSubscribedAttendees,
          }
        : {}),
      ...(parts?.attendanceSettings
        ? {
            shouldCollectAttendance: source.shouldCollectAttendance,
            isOnlineAttendanceAllowed: source.isOnlineAttendanceAllowed,
            shouldProvideSubscriberListToLecturer: source.shouldProvideSubscriberListToLecturer,
            onlineAttendanceStartDate: source.onlineAttendanceStartDate ?? undefined,
            onlineAttendanceEndDate: source.onlineAttendanceEndDate ?? undefined,
          }
        : {}),
      ...(parts?.visibility ? { publiclyVisible: source.publiclyVisible } : {}),
      lecturerPersonIds: shouldCopyLecturers ? source.lecturers.map((lecturer) => lecturer.personId) : undefined,
    };

    const cloneTargetContext = {
      majorEventId: cloneInput.majorEventId,
      eventGroupId: cloneInput.eventGroupId,
    };
    await this.assertEventCreateRelationPermissions(cloneInput, this.getUser(context));
    if (shouldCopyLecturers) {
      await this.authorizationPolicy.assertPermissions(
        this.getUser(context),
        [Permission.EventLecturer.Create],
        cloneTargetContext,
      );
    }
    if (shouldCopyCertificateConfig) {
      await this.authorizationPolicy.assertPermissions(
        this.getUser(context),
        [Permission.CertificateConfig.Create],
        cloneTargetContext,
      );
    }
    await this.frozenResources.assertEventCreateTargetsMutable(cloneInput, this.getUser(context));
    const normalizedInput = this.applyEventCreateDefaults(await this.normalizeEventCertificateInput(cloneInput));
    const eventInput = { ...normalizedInput };
    const lecturerPersonIds = eventInput.lecturerPersonIds;
    delete eventInput.lecturerPersonIds;
    delete eventInput.attendanceCollectorPersonIds;
    const actorId = context.req?.user?.sub ?? context.request?.user?.sub;
    const uniqueLecturerPersonIds = [...new Set(lecturerPersonIds ?? [])];
    const event = await this.prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          ...eventInput,
          onlineAttendanceCode: null,
          lecturers:
            uniqueLecturerPersonIds.length > 0
              ? {
                  create: uniqueLecturerPersonIds.map((personId) => ({
                    person: {
                      connect: {
                        id: personId,
                      },
                    },
                    createdById: actorId,
                  })),
                }
              : undefined,
        },
        select: EVENT_DETAIL_SELECT,
      });

      if (shouldCopyCertificateConfig) {
        await this.cloneCertificateConfigsForEvent(tx, source.certificateConfigs, createdEvent.id);
      }

      await this.disableGroupPerEventModeForMajorEvent(createdEvent, tx);
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: createdEvent.id,
          entityLabel: createdEvent.name,
          operation: AuditLogOperation.CREATE,
          actor: this.getUser(context),
          after: createdEvent,
          scope: {
            permission: Permission.Event.Create,
            eventId: createdEvent.id,
            majorEventId: createdEvent.majorEventId,
            eventGroupId: createdEvent.eventGroupId,
          },
          summary: `Evento criado como cópia de ${source.name}.`,
        },
        tx,
      );
      return createdEvent;
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
    return event;
  }

  @Mutation(() => DeletionResult, { name: 'deleteEvent' })
  @RequirePermissions(Permission.Event.Delete)
  async deleteEvent(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    await this.frozenResources.assertEventMutable(id, this.getUser(context), 'delete');
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findFirst({ where: { id, deletedAt: null }, select: EVENT_DETAIL_SELECT });
      if (!event) throw new NotFoundException(`Event ${id} was not found.`);
      const deleted = await tx.event.updateMany({ where: { id, deletedAt: null }, data: { deletedAt } });
      if (deleted.count !== 1) {
        throw new NotFoundException(`Event ${id} was not found.`);
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: id,
          entityLabel: event.name,
          operation: AuditLogOperation.DELETE,
          actor: this.getUser(context),
          before: event,
          after: { ...event, deletedAt },
          scope: {
            permission: Permission.Event.Delete,
            eventId: id,
            majorEventId: event.majorEventId,
            eventGroupId: event.eventGroupId,
          },
          summary: 'Evento excluído.',
          force: true,
        },
        tx,
      );
    });
    await this.typesenseSearch.deleteEvent(id);
    return {
      deleted: true,
      id,
    };
  }

  private async assertEventCreateRelationPermissions(
    input: Pick<EventCreateInput, 'majorEventId' | 'eventGroupId'>,
    user: AuthenticatedUser | undefined,
  ): Promise<void> {
    await this.assertEventRelationPermissions(Permission.Event.Create, user, {
      majorEventId: input.majorEventId,
      eventGroupId: input.eventGroupId,
    });
  }

  private async assertEventUpdateRelationPermissions(
    id: string,
    input: Pick<EventUpdateInput, 'majorEventId' | 'eventGroupId'>,
    user: AuthenticatedUser | undefined,
  ): Promise<void> {
    if (input.majorEventId === undefined && input.eventGroupId === undefined) {
      return;
    }

    const currentEvent = await this.prisma.event.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        majorEventId: true,
        eventGroupId: true,
      },
    });

    if (!currentEvent) {
      throw new NotFoundException(`Event ${id} was not found.`);
    }

    await this.assertEventRelationPermissions(Permission.Event.Update, user, {
      majorEventId: this.changedTargetId(currentEvent.majorEventId, input.majorEventId),
      eventGroupId: this.changedTargetId(currentEvent.eventGroupId, input.eventGroupId),
    });
  }

  private async assertEventRelationPermissions(
    permission: Permission,
    user: AuthenticatedUser | undefined,
    target: Pick<EventCreateInput, 'majorEventId' | 'eventGroupId'>,
  ): Promise<void> {
    if (target.majorEventId) {
      await this.authorizationPolicy.assertPermissions(user, [permission], {
        majorEventId: target.majorEventId,
      });
    }

    if (target.eventGroupId) {
      await this.authorizationPolicy.assertPermissions(user, [permission], {
        eventGroupId: target.eventGroupId,
      });
    }
  }

  private changedTargetId(currentId: string | null, nextId: string | null | undefined): string | undefined {
    if (nextId === undefined || nextId === null || nextId === currentId) {
      return undefined;
    }

    return nextId;
  }

  private async normalizeEventCertificateInput<T extends EventCreateInput | EventUpdateInput>(
    input: T,
    eventId?: string,
  ): Promise<T> {
    let normalizedInput = input;
    if (input.shouldIssueCertificate === false) {
      normalizedInput = {
        ...input,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      };
    }

    const existingEvent =
      eventId && normalizedInput.eventGroupId === undefined
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

  private buildPublicationInvalidation(
    event: { publicationState: PrismaPublicationState },
    user: AuthenticatedUser | undefined,
  ): Prisma.EventUpdateManyMutationInput {
    if (
      event.publicationState !== PrismaPublicationState.PUBLISHED &&
      event.publicationState !== PrismaPublicationState.SCHEDULED
    ) {
      return {};
    }

    return {
      publicationState: PrismaPublicationState.DRAFT,
      scheduledPublishAt: null,
      publicationUpdatedBy: resolvePublicationActorId(user),
    };
  }

  private applyEventCreateDefaults(
    input: EventCreateInput,
  ): EventCreateInput & { name: string; startDate: Date; endDate: Date; emoji: string } {
    const startDate = input.startDate ?? this.defaultEventStartDate(input.endDate);
    const endDate = input.endDate ?? new Date(startDate.getTime() + DEFAULT_EVENT_DURATION_MS);

    return {
      ...input,
      name: input.name?.trim() || DEFAULT_DRAFT_EVENT_NAME,
      startDate,
      endDate,
      emoji: input.emoji?.trim() || '❔',
      type: input.type ?? 'OTHER',
    };
  }

  private defaultEventStartDate(endDate: Date | undefined): Date {
    if (endDate) {
      return new Date(endDate.getTime() - DEFAULT_EVENT_DURATION_MS);
    }

    return new Date();
  }

  private async disableGroupPerEventModeForMajorEvent(
    event: {
      eventGroupId?: string | null;
      majorEventId?: string | null;
    },
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

  private didChangeOnlineAttendanceWindow(input: EventUpdateInput): boolean {
    return (
      input.shouldCollectAttendance !== undefined ||
      input.isOnlineAttendanceAllowed !== undefined ||
      input.onlineAttendanceCode !== undefined ||
      input.onlineAttendanceStartDate !== undefined ||
      input.onlineAttendanceEndDate !== undefined
    );
  }

  private async cloneCertificateConfigsForEvent(
    tx: Prisma.TransactionClient,
    configs: Array<{
      name: string;
      certificateTemplateId: string;
      certificateText: string | null;
      shouldAutofillSecondPage: boolean;
      secondPageText: string | null;
      isActive: boolean;
      issuedTo: Prisma.CertificateConfigCreateInput['issuedTo'];
      certificateFields: Prisma.JsonValue;
    }>,
    eventId: string,
  ): Promise<void> {
    for (const config of configs) {
      await tx.certificateConfig.create({
        data: {
          name: config.name,
          scope: CertificateScope.EVENT,
          eventId,
          certificateTemplateId: config.certificateTemplateId,
          certificateText: config.certificateText,
          shouldAutofillSecondPage: config.shouldAutofillSecondPage,
          secondPageText: config.secondPageText,
          isActive: config.isActive,
          issuedTo: config.issuedTo,
          certificateFields:
            config.certificateFields === null
              ? Prisma.DbNull
              : (config.certificateFields as Prisma.InputJsonValue),
        },
      });
    }
  }

  private buildCloneName(inputName: string | null | undefined, sourceName: string): string {
    const name = inputName?.trim();
    return name || `${sourceName} (cópia)`;
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }

  private buildAccessibleEventWhere(targets: AccessibleEventGrantTargets): Prisma.EventWhereInput {
    const OR: Prisma.EventWhereInput[] = [];

    if (targets.eventIds.size > 0) {
      OR.push({
        id: {
          in: [...targets.eventIds],
        },
      });
    }

    if (targets.majorEventIds.size > 0) {
      OR.push({
        majorEventId: {
          in: [...targets.majorEventIds],
        },
      });
    }

    if (targets.eventGroupIds.size > 0) {
      OR.push({
        eventGroupId: {
          in: [...targets.eventGroupIds],
        },
      });
    }

    return { OR };
  }

  private isEmptyAccessibleEventTargets(targets: AccessibleEventGrantTargets): boolean {
    return targets.eventIds.size === 0 && targets.majorEventIds.size === 0 && targets.eventGroupIds.size === 0;
  }
}
