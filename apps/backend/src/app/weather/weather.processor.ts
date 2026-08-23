import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
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
    switch (job.name) {
      case 'schedule-upcoming-event-weather':
        await this.weather.scheduleUpcomingEventRefreshes();
        return;
      case 'refresh-event-weather': {
        const eventId = job.data?.eventId?.trim();
        if (!eventId) {
          throw new BadRequestException('Weather refresh job requires a non-empty eventId.');
        }
        await this.weather.refreshEventWeatherById(eventId);
        return;
      }
      default:
        throw new BadRequestException(`Unsupported weather job: ${job.name}.`);
    }
  }
}
