import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { NotFoundException } from '@nestjs/common';
import { subMonths } from 'date-fns';
import { Prisma } from '@prisma/client';
import { EventType } from '@cacic-fct/shared-data-types';
import { Public } from '../auth/decorators/public.decorator';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import {
  PUBLIC_MAJOR_EVENT_SELECT,
  PUBLIC_EVENT_SELECT,
  PublicEvent,
  PublicMajorEventSubscriptionPage,
  PublicEventSubscriptionSummary,
  mapPublicMajorEvent,
} from './models';

@Public()
@Resolver(() => PublicEvent)
export class PublicEventsResolver {
  private static readonly calendarPastLimitMonths = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  @Query(() => [PublicEvent], { name: 'publicEvents' })
  async publicEvents(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('startDateFrom', { type: () => Date, nullable: true })
    startDateFrom?: Date,
    @Args('startDateUntil', { type: () => Date, nullable: true })
    startDateUntil?: Date,
    @Args('majorEventId', { type: () => String, nullable: true })
    majorEventId?: string,
    @Args('eventGroupId', { type: () => String, nullable: true })
    eventGroupId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      publiclyVisible: true,
    };
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

    let prioritizedIds: string[] = [];
    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        prioritizedIds = await this.typesenseSearch.searchEvents(normalizedQuery, pagination.take);
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
      select: PUBLIC_EVENT_SELECT,
      orderBy: {
        startDate: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });

    if (prioritizedIds.length === 0) {
      return events;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...events].sort(
      (left, right) => (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  @Query(() => [PublicEvent], {
    name: 'publicCalendarEvents',
    description:
      'Public event list for the calendar. Results are limited to events starting no earlier than one month ago.',
  })
  async publicCalendarEvents(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('eventType', { type: () => EventType, nullable: true })
    eventType?: EventType,
    @Args('startDateFrom', { type: () => Date, nullable: true, description: 'Minimum: Today - 1 month' })
    startDateFrom?: Date,
    @Args('startDateUntil', { type: () => Date, nullable: true })
    startDateUntil?: Date,
  ) {
    const minimumStartDate = subMonths(new Date(), PublicEventsResolver.calendarPastLimitMonths);
    const normalizedQuery = query?.trim();
    const effectiveStartDate = startDateFrom && startDateFrom > minimumStartDate ? startDateFrom : minimumStartDate;

    const startDateFilter: Prisma.DateTimeFilter = {
      gte: effectiveStartDate,
    };
    if (startDateUntil) {
      startDateFilter.lte = startDateUntil;
    }

    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      publiclyVisible: true,
      startDate: startDateFilter,
    };

    if (eventType) {
      where.type = eventType;
    }

    let prioritizedIds: string[] = [];
    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        prioritizedIds = await this.typesenseSearch.searchEvents(normalizedQuery, 500);
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
      select: PUBLIC_EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });

    if (prioritizedIds.length === 0) {
      return events;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...events].sort((left, right) => {
      const leftDate = left.startDate.getTime();
      const rightDate = right.startDate.getTime();

      if (leftDate !== rightDate) {
        return leftDate - rightDate;
      }

      return (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    });
  }

  @Query(() => PublicEvent, { name: 'publicEvent' })
  async publicEvent(@Args('id', { type: () => String }) id: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        deletedAt: null,
        publiclyVisible: true,
      },
      select: PUBLIC_EVENT_SELECT,
    });

    if (!event) {
      throw new NotFoundException(`Event ${id} was not found.`);
    }

    return event;
  }

  @Query(() => PublicEventSubscriptionSummary, {
    name: 'publicEventSubscriptionSummary',
  })
  async publicEventSubscriptionSummary(
    @Args('eventId', { type: () => String }) eventId: string,
  ): Promise<PublicEventSubscriptionSummary> {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
        publiclyVisible: true,
      },
      select: {
        id: true,
        slots: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    const subscribedPeopleCount = await this.countSubscribedPeopleByEventId([event.id]);

    return this.mapPublicEventSubscriptionSummary(event, subscribedPeopleCount.get(event.id) ?? 0);
  }

  @Query(() => PublicMajorEventSubscriptionPage, {
    name: 'publicMajorEventSubscriptionPage',
  })
  async publicMajorEventSubscriptionPage(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
  ): Promise<PublicMajorEventSubscriptionPage> {
    const now = new Date();
    const [majorEvent, events] = await Promise.all([
      this.prisma.majorEvent.findFirst({
        where: {
          id: majorEventId,
          deletedAt: null,
        },
        select: PUBLIC_MAJOR_EVENT_SELECT,
      }),
      this.prisma.event.findMany({
        where: {
          ...this.publicSlotSummaryEventWhere(now),
          majorEventId,
        },
        select: PUBLIC_EVENT_SELECT,
        orderBy: {
          startDate: 'asc',
        },
      }),
    ]);

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${majorEventId} was not found.`);
    }

    const subscribedPeopleCount = await this.countSubscribedPeopleByEventId(events.map((event) => event.id));

    return {
      majorEvent: mapPublicMajorEvent(majorEvent),
      events,
      subscriptionSummaries: events.map((event) =>
        this.mapPublicEventSubscriptionSummary(event, subscribedPeopleCount.get(event.id) ?? 0),
      ),
    };
  }

  async getPublicEventSubscriptionPagePayload(majorEventId: string): Promise<PublicMajorEventSubscriptionPage> {
    return this.publicMajorEventSubscriptionPage(majorEventId);
  }

  private publicSlotSummaryEventWhere(now: Date): Prisma.EventWhereInput {
    return {
      deletedAt: null,
      publiclyVisible: true,
      allowSubscription: true,
      majorEventId: {
        not: null,
      },
      OR: [{ subscriptionEndDate: null }, { subscriptionEndDate: { gte: now } }],
    };
  }

  private mapPublicEventSubscriptionSummary(
    event: {
      id: string;
      slots: number | null;
    },
    subscribedPeopleCount: number,
  ): PublicEventSubscriptionSummary {
    const availableSlots = event.slots == null ? null : Math.max(event.slots - subscribedPeopleCount, 0);
    return {
      eventId: event.id,
      hasAvailableSlots: availableSlots == null || availableSlots > 0,
    };
  }

  private async countSubscribedPeopleByEventId(eventIds: string[]): Promise<Map<string, number>> {
    const uniqueEventIds = [...new Set(eventIds)];
    if (uniqueEventIds.length === 0) {
      return new Map();
    }

    const counts = await this.prisma.eventSubscription.groupBy({
      by: ['eventId'],
      where: {
        eventId: {
          in: uniqueEventIds,
        },
        deletedAt: null,
      },
      _count: {
        personId: true,
      },
    });

    return new Map(counts.map((count) => [count.eventId, count._count.personId]));
  }
}
