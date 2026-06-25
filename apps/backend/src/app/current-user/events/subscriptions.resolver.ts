import { NotFoundException, UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver, createUnionType } from '@nestjs/graphql';
import {
  CurrentUserEventGroupSubscription,
  CurrentUserEventSubscription,
  SubscribedEventGroupItem,
  SubscribedSingleEventItem,
} from '../models';
import { CurrentUserContextService } from '../context.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import { CurrentUserEventSubscriptionService } from './subscription.service';
import {
  CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
  CURRENT_USER_EVENT_SUBSCRIPTION_SELECT,
  EVENT_SELECT,
  GraphqlContext,
} from '../selects';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicEvent } from '../../public-events/models';
import { PUBLIC_EVENT_WHERE } from '../../public-events/models';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { RateLimit } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';

export const SubscribedItemUnion = createUnionType({
  name: 'SubscribedItem',
  types: () => [SubscribedSingleEventItem, SubscribedEventGroupItem],
  resolveType(value) {
    if ('event' in value) {
      return SubscribedSingleEventItem;
    }

    if ('eventGroup' in value) {
      return SubscribedEventGroupItem;
    }

    return undefined;
  },
});

@Resolver()
export class CurrentUserEventSubscriptionsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly eventSubscriptions: CurrentUserEventSubscriptionService,
    private readonly frozenResources: FrozenResourceService,
  ) {}

  @Query(() => [PublicEvent], {
    name: 'currentUserStandaloneEventSubscriptions',
  })
  async currentUserStandaloneEventSubscriptions(@Context() context: GraphqlContext): Promise<PublicEvent[]> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    const standaloneSubscriptions = await this.prisma.eventSubscription.findMany({
      where: {
        personId: person.id,
        deletedAt: null,
        event: {
          AND: [PUBLIC_EVENT_WHERE, { majorEventId: null }],
        },
      },
      select: {
        event: {
          select: EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return standaloneSubscriptions.map((subscription) => this.mapper.mapPublicEvent(subscription.event));
  }

  @Query(() => CurrentUserEventSubscription, {
    name: 'currentUserEventSubscription',
    nullable: true,
  })
  async currentUserEventSubscription(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserEventSubscription | null> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return null;
    }

    const subscription = await this.prisma.eventSubscription.findFirst({
      where: {
        eventId,
        personId: person.id,
        deletedAt: null,
        event: {
          AND: [PUBLIC_EVENT_WHERE],
        },
      },
      select: CURRENT_USER_EVENT_SUBSCRIPTION_SELECT,
    });

    if (!subscription) {
      return null;
    }

    return this.mapper.mapCurrentUserEventSubscription(subscription);
  }

  @Query(() => [CurrentUserEventSubscription], {
    name: 'currentUserMajorEventEventSubscriptions',
  })
  async currentUserMajorEventEventSubscriptions(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserEventSubscription[]> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    const subscriptions = await this.prisma.eventSubscription.findMany({
      where: {
        personId: person.id,
        deletedAt: null,
        event: {
          AND: [PUBLIC_EVENT_WHERE, { majorEventId }],
        },
      },
      select: CURRENT_USER_EVENT_SUBSCRIPTION_SELECT,
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return subscriptions.map((subscription) => this.mapper.mapCurrentUserEventSubscription(subscription));
  }

  @Mutation(() => PublicEvent, { name: 'subscribeCurrentUserStandaloneEvent' })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.standaloneEventSubscription, [{ source: 'args', path: 'eventId' }])
  async subscribeCurrentUserStandaloneEvent(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<PublicEvent> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    await this.frozenResources.assertEventMutable(eventId, authenticatedUser, 'edit');
    const person = await this.currentUserContext.requireCurrentPerson(context);
    return this.eventSubscriptions.subscribeCurrentUserEvent(person.id, eventId, authenticatedUser);
  }

  @Mutation(() => PublicEvent, { name: 'unsubscribeCurrentUserStandaloneEvent' })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.standaloneEventSubscription, [{ source: 'args', path: 'eventId' }])
  async unsubscribeCurrentUserStandaloneEvent(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<PublicEvent> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    await this.frozenResources.assertEventMutable(eventId, authenticatedUser, 'delete');
    const person = await this.currentUserContext.requireCurrentPerson(context);
    return this.eventSubscriptions.unsubscribeCurrentUserEvent(person.id, eventId, authenticatedUser);
  }

  @Query(() => [CurrentUserEventGroupSubscription], {
    name: 'currentUserEventGroupSubscriptions',
  })
  async currentUserEventGroupSubscriptions(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserEventGroupSubscription[]> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    const subscriptions = await this.prisma.eventGroupSubscription.findMany({
      where: {
        personId: person.id,
        deletedAt: null,
        eventGroup: {
          deletedAt: null,
        },
      },
      select: CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const eventsBySubscriptionId = await this.eventSubscriptions.getSubscribedEventsByEventGroupSubscription(
      person.id,
      subscriptions.map((subscription) => subscription.id),
    );

    return subscriptions.map((subscription) =>
      this.mapper.mapCurrentUserEventGroupSubscription(subscription, eventsBySubscriptionId.get(subscription.id) ?? []),
    );
  }

  @Query(() => [SubscribedItemUnion], {
    name: 'currentUserSubscribedItems',
    description: 'Get all subscribed events and event groups, merged and ordered by date',
  })
  async currentUserSubscribedItems(
    @Context() context: GraphqlContext,
  ): Promise<Array<SubscribedSingleEventItem | SubscribedEventGroupItem>> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    const items = await this.eventSubscriptions.getCurrentUserSubscribedItems(person.id);

    return items.map((item) => {
      if (item.type === 'single') {
        return this.mapper.mapSubscribedSingleEventItem(item.id, item.event, item.startDate);
      } else {
        return this.mapper.mapSubscribedEventGroupItem(
          item.id,
          this.mapper.mapPublicEventGroup(item.eventGroup),
          item.events,
          item.startDate,
        );
      }
    });
  }

  @Query(() => CurrentUserEventGroupSubscription, {
    name: 'currentUserEventGroupSubscription',
    nullable: true,
  })
  async currentUserEventGroupSubscription(
    @Args('eventGroupId', { type: () => String }) eventGroupId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserEventGroupSubscription | null> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return null;
    }

    const subscription = await this.prisma.eventGroupSubscription.findFirst({
      where: {
        eventGroupId,
        personId: person.id,
        deletedAt: null,
        eventGroup: {
          deletedAt: null,
        },
      },
      select: CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
    });

    if (!subscription) {
      return null;
    }

    const eventsBySubscriptionId = await this.eventSubscriptions.getSubscribedEventsByEventGroupSubscription(
      person.id,
      [subscription.id],
    );

    return this.mapper.mapCurrentUserEventGroupSubscription(
      subscription,
      eventsBySubscriptionId.get(subscription.id) ?? [],
    );
  }

  @Mutation(() => CurrentUserEventGroupSubscription, {
    name: 'subscribeCurrentUserEventGroup',
  })
  async subscribeCurrentUserEventGroup(
    @Args('eventGroupId', { type: () => String }) eventGroupId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserEventGroupSubscription> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    await this.frozenResources.assertEventGroupMutable(eventGroupId, authenticatedUser, 'edit');
    const person = await this.currentUserContext.requireCurrentPerson(context);
    return this.eventSubscriptions.subscribeCurrentUserEventGroup(person.id, eventGroupId, authenticatedUser);
  }

  @Query(() => [PublicEvent], { name: 'eventsByMajorEventId' })
  async eventsByMajorEventId(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Args('onlySubscribable', { type: () => Boolean, nullable: true })
    onlySubscribable: boolean | undefined,
    @Context() context: GraphqlContext,
  ): Promise<PublicEvent[]> {
    this.currentUserContext.getAuthenticatedUser(context);
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: majorEventId,
        deletedAt: null,
        publicationState: 'PUBLISHED',
      },
      select: {
        id: true,
      },
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${majorEventId} was not found.`);
    }

    return this.prisma.event.findMany({
      where: {
        AND: [PUBLIC_EVENT_WHERE, { majorEventId }],
        ...(onlySubscribable ? { allowSubscription: true } : {}),
      },
      select: EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });
  }
}
