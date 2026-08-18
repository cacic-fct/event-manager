import { UseGuards } from '@nestjs/common';
import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { RateLimit } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { GraphqlContext } from '../selects';
import { CurrentUserMyDay } from './models';
import { CurrentUserMyDayService } from './service';

@Resolver()
export class CurrentUserMyDayResolver {
  constructor(private readonly myDay: CurrentUserMyDayService) {}

  @Query(() => CurrentUserMyDay, {
    name: 'currentUserMyDay',
    description:
      'Returns the authenticated user personal event-day projection for one São Paulo calendar date, including actionable roles and cached weather guidance.',
  })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.currentUserMyDay)
  currentUserMyDay(
    @Args('date', { type: () => String, description: 'Calendar date in YYYY-MM-DD format.' }) date: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserMyDay> {
    return this.myDay.getCurrentUserMyDay(context, date);
  }
}
