import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { PublicPlatformStats } from './models';
import { PublicPlatformStatsService } from './public-platform-stats.service';

@Public()
@Resolver(() => PublicPlatformStats)
export class PublicPlatformStatsResolver {
  constructor(private readonly statsService: PublicPlatformStatsService) {}

  @Query(() => PublicPlatformStats, {
    name: 'publicPlatformStats',
    description:
      'Returns cached all-time aggregate platform counts with a two-week delay. Values exclude soft-deleted records and may be refreshed nightly.',
  })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  publicPlatformStats(): Promise<PublicPlatformStats> {
    return this.statsService.getPublicPlatformStats();
  }
}
