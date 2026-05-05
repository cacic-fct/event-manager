import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { NotFoundException } from '@nestjs/common';
import { subMonths } from 'date-fns';
import { Prisma } from '@prisma/client';
import { EventType } from '@cacic-eventos/shared-data-types';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import {
  PUBLIC_EVENT_SELECT,
  PublicEvent,
  PublicEventSubscriptionSummary,
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
    @Args('startDateTo', { type: () => Date, nullable: true })
    startDateTo?: Date,
    @Args('majorEventId', { type: () => String, nullable: true })
    majorEventId?: string,
    @Args('eventGroupId', { type: () => String, nullable: true })
    eventGroupId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      publiclyVisible: true,
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
      select: PUBLIC_EVENT_SELECT,
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

  @Query(() => [PublicEvent], {
    name: 'publicCalendarEvents',
    description:
      'Public event list for the calendar. Results are limited to events starting no earlier than one month ago.',
  })
  async publicCalendarEvents(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('eventType', { type: () => EventType, nullable: true })
    eventType?: EventType,
    @Args('startDateFrom', { type: () => Date, nullable: true })
    startDateFrom?: Date,
    @Args('startDateTo', { type: () => Date, nullable: true })
    startDateTo?: Date,
  ) {
    const minimumStartDate = subMonths(
      new Date(),
      PublicEventsResolver.calendarPastLimitMonths,
    );
    const normalizedQuery = query?.trim();
    const effectiveStartDate =
      startDateFrom && startDateFrom > minimumStartDate
        ? startDateFrom
        : minimumStartDate;

    const startDateFilter: Prisma.DateTimeFilter = {
      gte: effectiveStartDate,
    };
    if (startDateTo) {
      startDateFilter.lte = startDateTo;
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
        prioritizedIds = await this.typesenseSearch.searchEvents(
          normalizedQuery,
          500,
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

      return (
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      );
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

    if (event.slots == null) {
      return {
        eventId,
        slots: null,
        availableSlots: null,
        hasAvailableSlots: true,
      };
    }

    const subscriptions = await this.prisma.eventSubscription.count({
      where: {
        eventId,
        deletedAt: null,
      },
    });
    const availableSlots = Math.max(event.slots - subscriptions, 0);

    return {
      eventId,
      slots: event.slots,
      availableSlots,
      hasAvailableSlots: availableSlots > 0,
    };
  }
}
