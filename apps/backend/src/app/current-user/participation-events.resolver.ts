import { BadRequestException } from '@nestjs/common';
import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { ANONYMOUS_AUDIENCE, audienceContext, eventAudienceWhere, pastEventParticipationWhere } from '../audiences/audience-context';
import { IncludePastParticipation } from '../audiences/past-participation.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_SELECT, PUBLIC_EVENT_WHERE, PublicEvent } from '../public-events/models';
import { CurrentUserContextService } from './context.service';
import { GraphqlContext } from './selects';

@Resolver()
export class CurrentUserParticipationEventsResolver {
  constructor(private readonly prisma: PrismaService, private readonly currentUser: CurrentUserContextService) {}

  @Query(() => [PublicEvent], {
    name: 'currentUserParticipationEvents',
    description: 'Lists visible activities and the current person’s own ended participations for a group or major-event history detail. Does not grant access to unrelated restricted children.',
  })
  @IncludePastParticipation()
  async currentUserParticipationEvents(
    @Context() context: GraphqlContext,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
    @Args('eventGroupId', { type: () => String, nullable: true }) eventGroupId?: string,
  ) {
    if (!majorEventId && !eventGroupId) throw new BadRequestException('Choose a group or major event for participation history.');
    const person = await this.currentUser.requireCurrentPerson(context);
    const principal = {
      ...(audienceContext.getStore() ?? ANONYMOUS_AUDIENCE),
      personIds: [person.id],
      pastParticipationBefore: new Date(),
    };
    const current = { ...principal, pastParticipationBefore: undefined };
    return audienceContext.run(principal, async () => this.prisma.event.findMany({
      where: {
        deletedAt: null,
        ...(majorEventId ? { majorEventId } : {}),
        ...(eventGroupId ? { eventGroupId } : {}),
        OR: [
          { AND: [PUBLIC_EVENT_WHERE, eventAudienceWhere(current)] },
          pastEventParticipationWhere(principal),
        ],
      },
      select: PUBLIC_EVENT_SELECT,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      take: 1000,
    }));
  }
}
