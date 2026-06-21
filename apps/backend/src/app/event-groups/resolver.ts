import { DeletionResult, EventGroup, EventGroupCreateInput, EventGroupUpdateInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver(() => EventGroup)
export class EventGroupsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
    private readonly frozenResources: FrozenResourceService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {}

  @Query(() => [EventGroup], { name: 'eventGroups' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.EventGroup.Read)
  async eventGroups(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.EventGroupWhereInput = { deletedAt: null };
    const accessibleEventGroupIds = await this.authorizationPolicy.accessibleEventGroupIds(
      this.getUser(context),
      Permission.EventGroup.Read,
    );
    if (accessibleEventGroupIds && accessibleEventGroupIds.size === 0) {
      return [];
    }
    if (accessibleEventGroupIds) {
      where.id = {
        in: [...accessibleEventGroupIds],
      };
    }
    const normalizedQuery = query?.trim();
    let prioritizedIds: string[] = [];

    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        prioritizedIds = await this.typesenseSearch.searchEventGroups(
          normalizedQuery,
          pagination.skip + pagination.take,
        );
        if (accessibleEventGroupIds) {
          prioritizedIds = prioritizedIds.filter((id) => accessibleEventGroupIds.has(id));
        }
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
      skip: prioritizedIds.length > 0 ? 0 : pagination.skip,
      take: prioritizedIds.length > 0 ? prioritizedIds.length : pagination.take,
    });

    if (prioritizedIds.length === 0) {
      return groups;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...groups]
      .sort(
        (left, right) =>
          (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(pagination.skip, pagination.skip + pagination.take);
  }

  @Query(() => EventGroup, { name: 'eventGroup' })
  @RequirePermissions(Permission.EventGroup.Read)
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
  @RequirePermissions(Permission.EventGroup.Create)
  async createEventGroup(
    @Args('input', { type: () => EventGroupCreateInput })
    input: EventGroupCreateInput,
  ) {
    const normalizedInput = this.normalizeEventGroupCertificateInput(input);
    const eventGroup = await this.prisma.eventGroup.create({
      data: normalizedInput,
    });
    await this.typesenseSearch.upsertEventGroup({
      id: eventGroup.id,
      name: eventGroup.name,
    });
    return eventGroup;
  }

  @Mutation(() => EventGroup, { name: 'updateEventGroup' })
  @RequirePermissions(Permission.EventGroup.Update)
  async updateEventGroup(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => EventGroupUpdateInput })
    input: EventGroupUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventGroupMutable(id, this.getUser(context), 'edit');
    const normalizedInput = this.normalizeEventGroupCertificateInput(input, await this.hasMajorEventEvents(id));
    const { count } = await this.prisma.eventGroup.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: normalizedInput,
    });

    if (count === 0) {
      throw new NotFoundException(`Event group ${id} was not found.`);
    }

    if (normalizedInput.shouldIssueCertificate === false) {
      await this.prisma.event.updateMany({
        where: {
          eventGroupId: id,
          deletedAt: null,
        },
        data: {
          shouldIssueCertificate: false,
          shouldIssueCertificateForNonPayingAttendees: false,
          shouldIssueCertificateForNonSubscribedAttendees: false,
        },
      });
    }

    if (
      normalizedInput.shouldIssueCertificateForNonPayingAttendees === false ||
      normalizedInput.shouldIssueCertificateForNonSubscribedAttendees === false
    ) {
      await this.prisma.event.updateMany({
        where: {
          eventGroupId: id,
          deletedAt: null,
        },
        data: {
          ...(normalizedInput.shouldIssueCertificateForNonPayingAttendees === false
            ? { shouldIssueCertificateForNonPayingAttendees: false }
            : {}),
          ...(normalizedInput.shouldIssueCertificateForNonSubscribedAttendees === false
            ? { shouldIssueCertificateForNonSubscribedAttendees: false }
            : {}),
        },
      });
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
  @RequirePermissions(Permission.EventGroup.Delete)
  async deleteEventGroup(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    await this.frozenResources.assertEventGroupMutable(id, this.getUser(context), 'delete');
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

  private normalizeEventGroupCertificateInput<T extends EventGroupCreateInput | EventGroupUpdateInput>(
    input: T,
    hasMajorEventEvents = false,
  ): T {
    if (input.shouldIssueCertificate === false) {
      return {
        ...input,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        shouldIssueCertificateForEachEvent: false,
        shouldIssuePartialCertificate: false,
      };
    }

    if (hasMajorEventEvents) {
      return {
        ...input,
        shouldIssueCertificateForEachEvent: false,
      };
    }

    return input;
  }

  private async hasMajorEventEvents(eventGroupId: string): Promise<boolean> {
    const count = await this.prisma.event.count({
      where: {
        eventGroupId,
        majorEventId: {
          not: null,
        },
        deletedAt: null,
      },
    });

    return count > 0;
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
