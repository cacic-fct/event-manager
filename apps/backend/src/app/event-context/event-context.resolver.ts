import { Args, Context, Int, Query, Resolver } from '@nestjs/graphql';
import { GraphqlContext } from '../current-user/selects';
import { EventContextService } from './event-context.service';
import { AdminEventContextKind, AdminEventContextPage } from './event-context.models';

@Resolver()
export class EventContextResolver {
  constructor(private readonly eventContext: EventContextService) {}

  @Query(() => AdminEventContextPage, {
    name: 'adminEventContextPage',
    description: 'Permission-scoped event hierarchy browsing and ranked contextual search for admin workflows.',
  })
  adminEventContextPage(
    @Context() context: GraphqlContext,
    @Args('parentKind', { type: () => AdminEventContextKind, nullable: true }) parentKind?: AdminEventContextKind,
    @Args('parentId', { type: () => String, nullable: true }) parentId?: string,
    @Args('childKind', { type: () => AdminEventContextKind, nullable: true }) childKind?: AdminEventContextKind,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('cursor', { type: () => String, nullable: true }) cursor?: string,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('startDateFrom', { type: () => Date, nullable: true }) startDateFrom?: Date,
    @Args('startDateUntil', { type: () => Date, nullable: true }) startDateUntil?: Date,
    @Args('isInGroup', { type: () => Boolean, nullable: true }) isInGroup?: boolean,
    @Args('isInMajorEvent', { type: () => Boolean, nullable: true }) isInMajorEvent?: boolean,
  ): Promise<AdminEventContextPage> {
    return this.eventContext.getPage(context, { parentKind, parentId, childKind, query, cursor, take, startDateFrom, startDateUntil, isInGroup, isInMajorEvent });
  }
}
