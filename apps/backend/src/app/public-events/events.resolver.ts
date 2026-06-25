import { Args, Context, Int, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { NotFoundException, UseGuards } from '@nestjs/common';
import { startOfDay, subMonths } from 'date-fns';
import { Prisma } from '@prisma/client';
import { EventType } from '@cacic-fct/shared-data-types';
import { Public } from '../auth/decorators/public.decorator';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import {
  PUBLIC_MAJOR_EVENT_SELECT,
  PUBLIC_EVENT_SELECT,
  PublicEvent,
  PublicLecturerProfile,
  PublicMajorEventSubscriptionPage,
  PublicEventSubscriptionSummary,
  mapPublicMajorEvent,
} from './models';

const PUBLIC_EVENTS_MAX_TAKE = 100;

const PUBLIC_EVENT_LECTURER_PROFILE_SELECT = {
  eventId: true,
  person: {
    select: {
      lecturerProfile: {
        select: {
          id: true,
          displayName: true,
          biography: true,
          publishGoogleUserPicture: true,
          googleUserPicture: true,
          email: true,
          whatsapp: true,
        },
      },
    },
  },
} satisfies Prisma.EventLecturerSelect;

type PublicEventLecturerProfileRecord = Prisma.EventLecturerGetPayload<{
  select: typeof PUBLIC_EVENT_LECTURER_PROFILE_SELECT;
}>;

type PendingPublicEventLecturerProfileLoad = {
  resolve: (profiles: PublicLecturerProfile[]) => void;
  reject: (error: unknown) => void;
};

type PublicEventsGraphqlContext = {
  publicEventLecturerProfileLoader?: PublicEventLecturerProfileLoader;
};

class PublicEventLecturerProfileLoader {
  private readonly cache = new Map<string, Promise<PublicLecturerProfile[]>>();
  private readonly pendingLoads = new Map<string, PendingPublicEventLecturerProfileLoad>();
  private scheduled = false;

  constructor(private readonly prisma: PrismaService) {}

  load(eventId: string): Promise<PublicLecturerProfile[]> {
    const cached = this.cache.get(eventId);
    if (cached) {
      return cached;
    }

    const pending = new Promise<PublicLecturerProfile[]>((resolve, reject) => {
      this.pendingLoads.set(eventId, { resolve, reject });
    });
    this.cache.set(eventId, pending);
    this.schedule();

    return pending;
  }

  private schedule(): void {
    if (this.scheduled) {
      return;
    }

    this.scheduled = true;
    void Promise.resolve().then(() => this.flush());
  }

  private async flush(): Promise<void> {
    const eventIds = [...this.pendingLoads.keys()];
    const pendingLoads = new Map(this.pendingLoads);
    this.pendingLoads.clear();
    this.scheduled = false;

    if (eventIds.length === 0) {
      return;
    }

    try {
      const profilesByEventId = await this.loadMany(eventIds);
      for (const eventId of eventIds) {
        pendingLoads.get(eventId)?.resolve(profilesByEventId.get(eventId) ?? []);
      }
    } catch (error) {
      for (const eventId of eventIds) {
        this.cache.delete(eventId);
        pendingLoads.get(eventId)?.reject(error);
      }
    }
  }

  private async loadMany(eventIds: string[]): Promise<Map<string, PublicLecturerProfile[]>> {
    const lecturers = await this.prisma.eventLecturer.findMany({
      where: {
        eventId: {
          in: eventIds,
        },
        person: {
          deletedAt: null,
          lecturerProfile: {
            isNot: null,
          },
        },
      },
      select: PUBLIC_EVENT_LECTURER_PROFILE_SELECT,
      orderBy: [
        {
          eventId: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
    const profilesByEventId = new Map<string, PublicEventLecturerProfileRecord[]>();

    for (const lecturer of lecturers) {
      const profiles = profilesByEventId.get(lecturer.eventId) ?? [];
      profiles.push(lecturer);
      profilesByEventId.set(lecturer.eventId, profiles);
    }

    return new Map(
      eventIds.map((eventId) => [eventId, mapPublicLecturerProfiles(profilesByEventId.get(eventId) ?? [])]),
    );
  }
}

function mapPublicLecturerProfiles(lecturers: PublicEventLecturerProfileRecord[]): PublicLecturerProfile[] {
  return lecturers.flatMap((lecturer) => {
    const profile = lecturer.person.lecturerProfile;
    if (!profile) {
      return [];
    }

    return {
      id: profile.id,
      displayName: profile.displayName,
      biography: profile.biography,
      publishGoogleUserPicture: profile.publishGoogleUserPicture,
      googleUserPicture: profile.publishGoogleUserPicture ? profile.googleUserPicture : null,
      email: profile.email,
      whatsapp: profile.whatsapp,
    };
  });
}

function resolvePublicEventsPagination(skip?: number, take?: number): { skip: number; take: number } {
  const pagination = resolvePagination(skip, take);

  return {
    skip: pagination.skip,
    take: Math.min(pagination.take, PUBLIC_EVENTS_MAX_TAKE),
  };
}

function buildPublicEventsTypesenseFilter(input: {
  eventGroupId?: string;
  majorEventId?: string;
  startDateFrom?: Date;
  startDateUntil?: Date;
}): string {
  const filters = ['publiclyVisible:=true'];

  if (input.eventGroupId) {
    filters.push(`eventGroupId:=${escapeTypesenseFilterValue(input.eventGroupId)}`);
  }
  if (input.majorEventId) {
    filters.push(`majorEventId:=${escapeTypesenseFilterValue(input.majorEventId)}`);
  }
  if (input.startDateFrom) {
    filters.push(`startDate:>=${toTypesenseTimestamp(input.startDateFrom)}`);
  }
  if (input.startDateUntil) {
    filters.push(`startDate:<=${toTypesenseTimestamp(input.startDateUntil)}`);
  }

  return filters.join(' && ');
}

function escapeTypesenseFilterValue(value: string): string {
  return `\`${value.replace(/[`\\]/g, '\\$&')}\``;
}

function toTypesenseTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

@Public()
@Resolver(() => PublicEvent)
export class PublicEventsResolver {
  private static readonly calendarPastLimitMonths = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  @Query(() => [PublicEvent], {
    name: 'publicEvents',
    description:
      'Lists public, non-deleted events for catalog and search surfaces. Supports optional date, major-event, event-group, text-search, and pagination filters; results are ordered by newest start date unless search relevance is available. Rate limited to 60 requests per minute.',
  })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  async publicEvents(
    @Args('query', {
      type: () => String,
      nullable: true,
      description:
        'Optional participant-facing search text. Uses Typesense relevance when configured; otherwise falls back to a case-insensitive event-name match.',
    })
    query?: string,
    @Args('startDateFrom', { type: () => Date, nullable: true })
    startDateFrom?: Date,
    @Args('startDateUntil', { type: () => Date, nullable: true })
    startDateUntil?: Date,
    @Args('majorEventId', {
      type: () => String,
      nullable: true,
      description: 'Restricts results to events attached to the given major event.',
    })
    majorEventId?: string,
    @Args('eventGroupId', {
      type: () => String,
      nullable: true,
      description: 'Restricts results to events attached to the given event group.',
    })
    eventGroupId?: string,
    @Args('skip', {
      type: () => Int,
      nullable: true,
      description: 'Number of rows to skip. Negative values are treated as zero.',
    })
    skip?: number,
    @Args('take', {
      type: () => Int,
      nullable: true,
      description: 'Maximum number of rows to return. Defaults to 50 and is capped at 100.',
    })
    take?: number,
  ) {
    const pagination = resolvePublicEventsPagination(skip, take);
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
        const searchResult = await this.typesenseSearch.searchEvents(normalizedQuery, {
          filterBy: buildPublicEventsTypesenseFilter({
            eventGroupId,
            majorEventId,
            startDateFrom,
            startDateUntil,
          }),
          limit: pagination.take,
          offset: pagination.skip,
        });
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
      select: PUBLIC_EVENT_SELECT,
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
      );
  }

  @Query(() => [PublicEvent], {
    name: 'publicCalendarEvents',
    description:
      'Calendar-optimized public event list. Only public, non-deleted events are returned, ordered from oldest to newest, and the effective start date cannot be earlier than the beginning of the day one month ago.',
  })
  async publicCalendarEvents(
    @Args('query', {
      type: () => String,
      nullable: true,
      description:
        'Optional participant-facing search text. Uses Typesense relevance when configured; otherwise falls back to a case-insensitive event-name match.',
    })
    query?: string,
    @Args('eventType', {
      type: () => EventType,
      nullable: true,
      description: 'Optional event category filter used by the public calendar tabs and chips.',
    })
    eventType?: EventType,
    @Args('startDateFrom', {
      type: () => Date,
      nullable: true,
      description:
        'Inclusive lower schedule boundary. Values before the calendar retention window, one month ago at start of day, are rejected.',
    })
    startDateFrom?: Date,
    @Args('startDateUntil', {
      type: () => Date,
      nullable: true,
      description: 'Inclusive upper schedule boundary for calendar range loading.',
    })
    startDateUntil?: Date,
  ) {
    const minimumStartDate = startOfDay(subMonths(new Date(), PublicEventsResolver.calendarPastLimitMonths));
    const normalizedQuery = query?.trim();

    if (startDateFrom && startDateFrom < minimumStartDate) {
      throw new NotFoundException(
        'Event is out of bounds for calendar listing. Minimum start date is ' + minimumStartDate.toISOString(),
      );
    }

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
        const searchResult = await this.typesenseSearch.searchEvents(normalizedQuery, 500);
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

  @Query(() => PublicEvent, {
    name: 'publicEvent',
    description:
      'Returns a single public, non-deleted event for the detail page. Hidden, deleted, or unknown events resolve as not found.',
  })
  async publicEvent(
    @Args('id', {
      type: () => String,
      description: 'Public event identifier.',
    })
    id: string,
  ) {
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
    description:
      'Returns the current public slot availability snapshot for one visible event. Unlimited-capacity events are considered available.',
  })
  async publicEventSubscriptionSummary(
    @Args('eventId', {
      type: () => String,
      description: 'Public event whose direct subscription availability should be checked.',
    })
    eventId: string,
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
    description:
      'Builds the public subscription page model for a major event: major-event details, visible child events still eligible for subscription, and per-event availability snapshots.',
  })
  async publicMajorEventSubscriptionPage(
    @Args('majorEventId', {
      type: () => String,
      description:
        'Major event identifier. The major event itself must exist and not be deleted; returned child events must also be public, subscription-enabled, and not past their subscription end date.',
    })
    majorEventId: string,
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

  @ResolveField(() => [PublicLecturerProfile], {
    name: 'lecturers',
    description: 'Public lecturer profiles associated with this event.',
  })
  async lecturers(
    @Parent() event: PublicEvent,
    @Context() context?: PublicEventsGraphqlContext,
  ): Promise<PublicLecturerProfile[]> {
    return this.getLecturerProfileLoader(context).load(event.id);
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

  private getLecturerProfileLoader(context?: PublicEventsGraphqlContext): PublicEventLecturerProfileLoader {
    if (!context) {
      return new PublicEventLecturerProfileLoader(this.prisma);
    }

    context.publicEventLecturerProfileLoader ??= new PublicEventLecturerProfileLoader(this.prisma);

    return context.publicEventLecturerProfileLoader;
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
