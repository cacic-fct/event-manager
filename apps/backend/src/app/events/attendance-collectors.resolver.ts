import {
  DeletionResult,
  EventAttendanceCollector,
  EventAttendanceCollectorCreateInput,
} from '@cacic-fct/shared-data-types';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver(() => EventAttendanceCollector)
export class EventAttendanceCollectorsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [EventAttendanceCollector], { name: 'eventAttendanceCollectors' })
  @RequireScopes('event#read')
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
  @RequireScopes('event#edit')
  createEventAttendanceCollector(
    @Args('input', { type: () => EventAttendanceCollectorCreateInput })
    input: EventAttendanceCollectorCreateInput,
    @Context() context: GraphqlContext,
  ) {
    return this.prisma.eventAttendanceCollector.create({
      data: {
        ...input,
        createdById: context.req?.user?.sub ?? context.request?.user?.sub,
      },
    });
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventAttendanceCollector' })
  @RequireScopes('event#edit')
  async deleteEventAttendanceCollector(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
  ) {
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
}
