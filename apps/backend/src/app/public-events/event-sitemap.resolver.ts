import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { PublicEventSitemapPage } from './event-sitemap.models';
import { EventSitemapService } from './event-sitemap.service';

@Public()
@Resolver(() => PublicEventSitemapPage)
export class EventSitemapResolver {
  constructor(private readonly sitemap: EventSitemapService) {}

  @Query(() => PublicEventSitemapPage, {
    name: 'publicEventSitemap',
    description:
      'Returns one cached page of public event sitemap URLs. Entries exclude soft-deleted and non-public events and are ordered by UUIDv7 ID.',
  })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  publicEventSitemap(@Args('page', { type: () => Int }) page: number): Promise<PublicEventSitemapPage> {
    return this.sitemap.getPage(page);
  }
}
