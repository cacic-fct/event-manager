import {
  DeletionResult,
  EventAttendanceCollector,
  EventAttendanceCollectorCreateInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver(() => EventAttendanceCollector)
export class EventAttendanceCollectorsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly frozenResources: FrozenResourceService,
  ) {}

  @Query(() => [EventAttendanceCollector], { name: 'eventAttendanceCollectors' })
  @RequirePermissions(Permission.EventAttendanceCollector.Read)
  eventAttendanceCollectors(
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('personId', { type: () => String, nullable: true }) personId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.EventAttendanceCollectorWhereInput = {};

    if (eventId) {
      where.eventId = eventId;
    }

    if (personId) {
      where.personId = personId;
    }

    return this.prisma.eventAttendanceCollector.findMany({
      where,
      select: {
        eventId: true,
        personId: true,
        createdAt: true,
        createdById: true,
        person: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  @Mutation(() => EventAttendanceCollector, { name: 'createEventAttendanceCollector' })
  @RequirePermissions(Permission.EventAttendanceCollector.Create)
  async createEventAttendanceCollector(
    @Args('input', { type: () => EventAttendanceCollectorCreateInput })
    input: EventAttendanceCollectorCreateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    return this.prisma.eventAttendanceCollector.create({
      data: {
        ...input,
        createdById: context.req?.user?.sub ?? context.request?.user?.sub,
      },
    });
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventAttendanceCollector' })
  @RequirePermissions(Permission.EventAttendanceCollector.Delete)
  async deleteEventAttendanceCollector(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'delete');
    await this.prisma.eventAttendanceCollector.delete({
      where: {
        eventId_personId: {
          eventId,
          personId,
        },
      },
    });

    return {
      deleted: true,
      eventId,
      personId,
    };
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
