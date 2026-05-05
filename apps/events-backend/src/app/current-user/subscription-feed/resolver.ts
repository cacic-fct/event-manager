import { Context, Query, Resolver } from '@nestjs/graphql';
import { CurrentUserContextService } from '../context.service';
import { CurrentUserSubscriptionFeed } from '../models';
import { GraphqlContext } from '../selects';
import { CurrentUserSubscriptionFeedService } from './service';

@Resolver()
export class CurrentUserSubscriptionFeedResolver {
  constructor(
    private readonly currentUserContext: CurrentUserContextService,
    private readonly subscriptionFeed: CurrentUserSubscriptionFeedService,
  ) {}

  @Query(() => CurrentUserSubscriptionFeed, {
    name: 'currentUserSubscriptionFeed',
    description:
      'Get the current user subscription feed grouped by single events and event groups, excluding major-event content.',
  })
  async currentUserSubscriptionFeed(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserSubscriptionFeed> {
    const authenticatedUser =
      this.currentUserContext.getAuthenticatedUser(context);
    const { person } =
      await this.currentUserContext.resolveCurrentUserContext(
        authenticatedUser,
      );
    if (!person) {
      return {
        items: [],
      };
    }

    return this.subscriptionFeed.getCurrentUserSubscriptionFeed(person.id);
  }
}
