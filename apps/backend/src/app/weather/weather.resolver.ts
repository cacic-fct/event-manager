import { Logger, NotFoundException } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PublicEventWeather } from './models';
import { WeatherService } from './weather.service';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';

@Public()
@Resolver(() => PublicEventWeather)
export class WeatherResolver {
  private readonly logger = new Logger(WeatherResolver.name);

  constructor(private readonly weather: WeatherService) {}

  @Query(() => PublicEventWeather, {
    name: 'publicEventWeather',
    nullable: true,
    description:
      'Returns a cached or fetched public weather forecast for an event location and schedule when enough event data is available. Returns null when the event has no public forecast data or the weather provider cannot resolve a forecast.',
  })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicWeather)
  async publicEventWeather(
    @Args('eventId', {
      type: () => String,
      description: 'Public event identifier used to resolve the event location and forecast time.',
    })
    eventId: string,
  ): Promise<PublicEventWeather | null> {
    try {
      return await this.weather.getPublicEventWeather(eventId);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return null;
      }

      this.logger.error(
        `Public weather lookup failed for event ${eventId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
