import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WeatherService } from './weather.service';

interface RefreshEventWeatherJob {
  eventId?: string;
}

@Processor('weather')
export class WeatherProcessor extends WorkerHost {
  constructor(private readonly weather: WeatherService) {
    super();
  }

  async process(job: Job<RefreshEventWeatherJob>): Promise<void> {
    if (job.name !== 'refresh-event-weather') {
      if (job.name === 'schedule-upcoming-event-weather') {
        await this.weather.scheduleUpcomingEventRefreshes();
      }
      return;
    }

    if (job.data.eventId) {
      await this.weather.refreshEventWeatherById(job.data.eventId);
    }
  }
}
