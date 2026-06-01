import { Args, Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/decorators/public.decorator';
import { PublicEventWeather } from './models';
import { WeatherService } from './weather.service';

@Public()
@Resolver(() => PublicEventWeather)
export class WeatherResolver {
  constructor(private readonly weather: WeatherService) {}

  @Query(() => PublicEventWeather, {
    name: 'publicEventWeather',
    nullable: true,
    description:
      'Returns a cached or fetched public weather forecast for an event location and schedule when enough event data is available. Returns null when the event has no public forecast data or the weather provider cannot resolve a forecast.',
  })
  async publicEventWeather(
    @Args('eventId', {
      type: () => String,
      description: 'Public event identifier used to resolve the event location and forecast time.',
    })
    eventId: string,
  ): Promise<PublicEventWeather | null> {
    try {
      return await this.weather.getPublicEventWeather(eventId);
    } catch {
      return null;
    }
  }
}
