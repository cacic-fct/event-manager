import { DeletionResult, Event, EventCreateInput, EventUpdateInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
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
    await this.frozenResources.assertEventCreateTargetsMutable(input, this.getUser(context));
    const normalizedInput = await this.normalizeEventCertificateInput(input);
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
    await this.frozenResources.assertEventUpdateMutable(id, input, this.getUser(context));
    const normalizedInput = await this.normalizeEventCertificateInput(input, id);
    const event = await this.prisma.$transaction(async (tx) => {
      const previousEvent = await tx.event.findFirst({
        where: { id, deletedAt: null },
        select: EVENT_AUDIT_SELECT,
      });
      if (!previousEvent) throw new NotFoundException(`Event ${id} was not found.`);
      const updatedCount = await tx.event.updateMany({ where: { id, deletedAt: null }, data: normalizedInput });
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
        startDate: event.startDate,
        endDate: event.endDate,
      });
      if (this.didChangeOnlineAttendanceWindow(input)) {
        await this.attendanceRealtime.notifyAllConnectedPeople();
      }
    }
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
