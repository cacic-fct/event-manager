import {
  DeletionResult,
  EventGroup,
  EventGroupCreateInput,
  EventGroupUpdateInput,
} from '@cacic-eventos/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

@Resolver(() => EventGroup)
export class EventGroupsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  @Query(() => [EventGroup], { name: 'eventGroups' })
  @RequireScopes('event#read')
  async eventGroups(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const where: Prisma.EventGroupWhereInput = { deletedAt: null };
    const normalizedQuery = query?.trim();
    let prioritizedIds: string[] = [];

    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        prioritizedIds = await this.typesenseSearch.searchEventGroups(
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

    const groups = await this.prisma.eventGroup.findMany({
      where,
      orderBy: {
        name: 'asc',
      },
      skip,
      take,
    });

    if (prioritizedIds.length === 0) {
      return groups;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...groups].sort(
      (left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  @Query(() => EventGroup, { name: 'eventGroup' })
  @RequireScopes('event#read')
  async eventGroup(@Args('id', { type: () => String }) id: string) {
    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },
    });

    if (!eventGroup) {
      throw new NotFoundException(`Event group ${id} was not found.`);
    }

    return eventGroup;
  }

  @Mutation(() => EventGroup, { name: 'createEventGroup' })
  @RequireScopes('event#edit')
  async createEventGroup(
    @Args('input', { type: () => EventGroupCreateInput })
    input: EventGroupCreateInput,
  ) {
    const eventGroup = await this.prisma.eventGroup.create({
      data: input,
    });
    await this.typesenseSearch.upsertEventGroup({
      id: eventGroup.id,
      name: eventGroup.name,
    });
    return eventGroup;
  }

  @Mutation(() => EventGroup, { name: 'updateEventGroup' })
  @RequireScopes('event#edit')
  async updateEventGroup(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => EventGroupUpdateInput })
    input: EventGroupUpdateInput,
  ) {
    const { count } = await this.prisma.eventGroup.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: input,
    });

    if (count === 0) {
      throw new NotFoundException(`Event group ${id} was not found.`);
    }

    const eventGroup = await this.prisma.eventGroup.findUnique({
      where: {
        id,
      },
    });
    if (eventGroup) {
      await this.typesenseSearch.upsertEventGroup({
        id: eventGroup.id,
        name: eventGroup.name,
      });
    }
    return eventGroup;
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventGroup' })
  @RequireScopes('event#delete')
  async deleteEventGroup(@Args('id', { type: () => String }) id: string) {
    const { count } = await this.prisma.eventGroup.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Event group ${id} was not found.`);
    }

    await this.typesenseSearch.deleteEventGroup(id);
    return {
      deleted: true,
      id,
    };
  }
}
