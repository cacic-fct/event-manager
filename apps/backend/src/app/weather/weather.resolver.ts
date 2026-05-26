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
  })
  async publicEventWeather(
    @Args('eventId', { type: () => String }) eventId: string,
  ): Promise<PublicEventWeather | null> {
    try {
      return await this.weather.getPublicEventWeather(eventId);
    } catch {
      return null;
    }
  }
}
