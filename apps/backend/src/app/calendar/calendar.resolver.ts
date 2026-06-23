import { BadRequestException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext, UserRecord } from '../current-user/selects';
import { CurrentUserCalendarFeedSettings } from './calendar.models';
import { CalendarService } from './calendar.service';

@Resolver()
export class CalendarResolver {
  constructor(
    private readonly currentUserContext: CurrentUserContextService,
    private readonly calendars: CalendarService,
  ) {}

  @Query(() => CurrentUserCalendarFeedSettings, {
    name: 'currentUserCalendarFeedSettings',
    description: 'Read private calendar feed settings for the current authenticated user.',
  })
  async currentUserCalendarFeedSettings(@Context() context: GraphqlContext): Promise<CurrentUserCalendarFeedSettings> {
    const user = await this.resolveCurrentUser(context);
    return this.calendars.getCurrentUserCalendarFeedSettings(user.id);
  }

  @Mutation(() => CurrentUserCalendarFeedSettings, {
    name: 'setCurrentUserCalendarFeedEnabled',
    description:
      'Enable or disable the current user private calendar feed. Re-enabling preserves any existing private key.',
  })
  async setCurrentUserCalendarFeedEnabled(
    @Args('enabled', {
      type: () => Boolean,
      description: 'Whether the private calendar feed should be enabled.',
    })
    enabled: boolean,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserCalendarFeedSettings> {
    const user = await this.resolveCurrentUser(context);
    return this.calendars.setCurrentUserCalendarFeedEnabled(user.id, enabled);
  }

  @Mutation(() => CurrentUserCalendarFeedSettings, {
    name: 'rotateCurrentUserCalendarFeedKey',
    description: 'Rotate the private calendar feed key for the current authenticated user.',
  })
  async rotateCurrentUserCalendarFeedKey(@Context() context: GraphqlContext): Promise<CurrentUserCalendarFeedSettings> {
    const user = await this.resolveCurrentUser(context);
    return this.calendars.rotateCurrentUserCalendarFeedKey(user.id);
  }

  private async resolveCurrentUser(context: GraphqlContext): Promise<UserRecord> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { user } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser, true);
    if (!user) {
      throw new BadRequestException('Could not resolve the current user.');
    }

    return user;
  }
}
