import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { PUBLIC_MAJOR_EVENT_SELECT, PublicMajorEvent, mapPublicMajorEvent } from './models';

@Public()
@Resolver(() => PublicMajorEvent)
export class PublicMajorEventsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  @Query(() => [PublicMajorEvent], { name: 'publicMajorEvents' })
  async publicMajorEvents(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('startDateFrom', { type: () => Date, nullable: true })
    startDateFrom?: Date,
    @Args('startDateUntil', { type: () => Date, nullable: true })
    startDateUntil?: Date,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
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
        prioritizedIds = await this.typesenseSearch.searchMajorEvents(
          normalizedQuery,
          pagination.skip + pagination.take,
        );
        if (prioritizedIds.length === 0) {
          return [];
        }
        where.id = { in: prioritizedIds };
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
      )
      .slice(pagination.skip, pagination.skip + pagination.take);
  }

  @Query(() => PublicMajorEvent, { name: 'publicMajorEvent' })
  async publicMajorEvent(@Args('id', { type: () => String }) id: string) {
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
