import { Injectable, OnModuleInit } from '@nestjs/common';
import { WeatherService } from './weather.service';

@Injectable()
export class WeatherSchedulerService implements OnModuleInit {
  constructor(private readonly weather: WeatherService) {}

  async onModuleInit(): Promise<void> {
    await this.weather.scheduleUpcomingEventRefreshScan();
    await this.weather.scheduleUpcomingEventRefreshes();
  }
}
