import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { NotFoundException, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { PUBLIC_MAJOR_EVENT_SELECT, PublicMajorEvent, mapPublicMajorEvent } from './models';

@Public()
@Resolver(() => PublicMajorEvent)
export class PublicMajorEventsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  @Query(() => [PublicMajorEvent], {
    name: 'publicMajorEvents',
    description:
      'Lists non-deleted public-facing major events for landing, search, and subscription entry points. Supports optional date range, text search, and pagination; results are ordered by newest start date unless search relevance is available. Rate limited to 60 requests per minute.',
  })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  async publicMajorEvents(
    @Args('query', {
      type: () => String,
      nullable: true,
      description:
        'Optional participant-facing search text. Uses Typesense relevance when configured; otherwise falls back to a case-insensitive major-event-name match.',
    })
    query?: string,
    @Args('startDateFrom', {
      type: () => Date,
      nullable: true,
      description: 'Inclusive lower boundary for the major-event start date.',
    })
    startDateFrom?: Date,
    @Args('startDateUntil', {
      type: () => Date,
      nullable: true,
      description: 'Inclusive upper boundary for the major-event start date.',
    })
    startDateUntil?: Date,
    @Args('skip', {
      type: () => Int,
      nullable: true,
      description: 'Number of rows to skip. Negative values are treated as zero.',
    })
    skip?: number,
    @Args('take', {
      type: () => Int,
      nullable: true,
      description: 'Maximum number of rows to return. Defaults to 50 and is capped at 1000.',
    })
    take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.MajorEventWhereInput = {
      deletedAt: null,
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

    let prioritizedIds: string[] = [];
    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        const searchResult = await this.typesenseSearch.searchMajorEvents(normalizedQuery, {
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

    const majorEvents = await this.prisma.majorEvent.findMany({
      where,
      select: PUBLIC_MAJOR_EVENT_SELECT,
      orderBy: {
        startDate: 'desc',
      },
      skip: prioritizedIds.length > 0 ? 0 : pagination.skip,
      take: prioritizedIds.length > 0 ? prioritizedIds.length : pagination.take,
    });

    const mappedMajorEvents = majorEvents.map(mapPublicMajorEvent);

    if (prioritizedIds.length === 0) {
      return mappedMajorEvents;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return mappedMajorEvents
      .sort(
        (left, right) =>
          (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
  }

  @Query(() => PublicMajorEvent, {
    name: 'publicMajorEvent',
    description:
      'Returns one non-deleted public-facing major event with subscription, payment, price, contact, and certificate capability metadata.',
  })
  async publicMajorEvent(
    @Args('id', {
      type: () => String,
      description: 'Major event identifier.',
    })
    id: string,
  ) {
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: PUBLIC_MAJOR_EVENT_SELECT,
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${id} was not found.`);
    }

    return mapPublicMajorEvent(majorEvent);
  }
}
