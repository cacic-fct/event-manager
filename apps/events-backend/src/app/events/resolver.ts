import { DeletionResult, Event, EventCreateInput, EventUpdateInput } from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';

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
  ) {}

  @Query(() => [Event], { name: 'events' })
  @RequireScopes('event#read')
  async events(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('startDateFrom', { type: () => Date, nullable: true })
    startDateFrom?: Date,
    @Args('startDateTo', { type: () => Date, nullable: true })
    startDateTo?: Date,
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
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
    };
    const normalizedQuery = query?.trim();

    if (startDateFrom || startDateTo) {
      where.startDate = {};
      if (startDateFrom) {
        where.startDate.gte = startDateFrom;
      }
      if (startDateTo) {
        where.startDate.lte = startDateTo;
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
      if (this.typesenseSearch.isEnabled()) {
        prioritizedIds = await this.typesenseSearch.searchEvents(
          normalizedQuery,
          take ?? 200,
        );
        if (prioritizedIds.length === 0) {
          return [];
        }
        where.id = { in: prioritizedIds };
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
      skip,
      take,
    });

    if (prioritizedIds.length === 0) {
      return events;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...events].sort(
      (left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  @Query(() => Event, { name: 'event' })
  @RequireScopes('event#read')
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
  @RequireScopes('event#edit')
  async createEvent(
    @Args('input', { type: () => EventCreateInput }) input: EventCreateInput,
  ) {
    const normalizedInput = await this.normalizeEventCertificateInput(input);
    const event = await this.prisma.event.create({
      data: normalizedInput,
      select: EVENT_DETAIL_SELECT,
    });
    await this.disableGroupPerEventModeForMajorEvent(event);
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
      startDate: event.startDate,
      endDate: event.endDate,
    });
    return event;
  }

  @Mutation(() => Event, { name: 'updateEvent' })
  @RequireScopes('event#edit')
  async updateEvent(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => EventUpdateInput }) input: EventUpdateInput,
  ) {
    const normalizedInput = await this.normalizeEventCertificateInput(
      input,
      id,
    );
    const { count } = await this.prisma.event.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: normalizedInput,
    });

    if (count === 0) {
      throw new NotFoundException(`Event ${id} was not found.`);
    }

    const event = await this.prisma.event.findUnique({
      where: {
        id,
      },
      select: EVENT_DETAIL_SELECT,
    });
    if (event) {
      await this.disableGroupPerEventModeForMajorEvent(event);
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
  @RequireScopes('event#delete')
  async deleteEvent(@Args('id', { type: () => String }) id: string) {
    const { count } = await this.prisma.event.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Event ${id} was not found.`);
    }

    await this.typesenseSearch.deleteEvent(id);
    return {
      deleted: true,
      id,
    };
  }

  private async normalizeEventCertificateInput<
    T extends EventCreateInput | EventUpdateInput,
  >(input: T, eventId?: string): Promise<T> {
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
      normalizedInput.eventGroupId === undefined
        ? existingEvent?.eventGroupId
        : normalizedInput.eventGroupId;

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
        shouldIssueCertificateForNonPayingAttendees:
          eventGroup.shouldIssueCertificateForNonPayingAttendees
            ? normalizedInput.shouldIssueCertificateForNonPayingAttendees
            : false,
        shouldIssueCertificateForNonSubscribedAttendees:
          eventGroup.shouldIssueCertificateForNonSubscribedAttendees
            ? normalizedInput.shouldIssueCertificateForNonSubscribedAttendees
            : false,
      };
    }

    return normalizedInput;
  }

  private async disableGroupPerEventModeForMajorEvent(event: {
    eventGroupId?: string | null;
    majorEventId?: string | null;
  }): Promise<void> {
    if (!event.eventGroupId || !event.majorEventId) {
      return;
    }

    await this.prisma.eventGroup.updateMany({
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
}
