import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_SELECT } from '../public-events/models';
import { PublicEventWeather } from './models';

type WeatherEvent = Prisma.EventGetPayload<{
  select: typeof PUBLIC_EVENT_SELECT;
}>;

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
  };
}

const WEATHER_QUEUE = 'weather';
const TIME_ZONE = 'America/Sao_Paulo';
const ATTRIBUTION = 'Weather data by Open-Meteo.com';

@Injectable()
export class WeatherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
    @InjectQueue(WEATHER_QUEUE) private readonly weatherQueue: Queue,
  ) {}

  async getPublicEventWeather(
    eventId: string,
  ): Promise<PublicEventWeather | null> {
    const cached = await this.getCachedWeather(eventId);
    if (cached) {
      return cached;
    }

    const event = await this.getWeatherEvent(eventId);
    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    await this.scheduleRefreshForEvent(event);
    return this.refreshEventWeather(event);
  }

  async refreshEventWeatherById(
    eventId: string,
  ): Promise<PublicEventWeather | null> {
    const event = await this.getWeatherEvent(eventId);
    if (!event) {
      return null;
    }

    return this.refreshEventWeather(event);
  }

  async scheduleUpcomingEventRefreshes(): Promise<void> {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 14);

    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        publiclyVisible: true,
        latitude: { not: null },
        longitude: { not: null },
        startDate: {
          gt: now,
          lte: horizon,
        },
      },
      select: PUBLIC_EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });

    await Promise.all(
      events.map((event) => this.scheduleRefreshForEvent(event)),
    );
  }

  async scheduleUpcomingEventRefreshScan(): Promise<void> {
    await this.weatherQueue.add(
      'schedule-upcoming-event-weather',
      {},
      {
        jobId: 'weather:schedule-upcoming-events',
        repeat: {
          pattern: '5 0 * * *',
          tz: TIME_ZONE,
        },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  async scheduleRefreshForEvent(event: WeatherEvent): Promise<void> {
    if (!this.canFetchWeather(event)) {
      return;
    }

    const category = this.getEventWeatherCategory(event.startDate);
    if (!category) {
      return;
    }

    const endDate = event.startDate;
    const repeatJobId = `weather:${event.id}:${category}`;
    const repeatPattern = this.getRepeatPattern(category);

    await this.weatherQueue.add(
      'refresh-event-weather',
      { eventId: event.id },
      {
        jobId: repeatJobId,
        repeat: {
          pattern: repeatPattern,
          tz: TIME_ZONE,
          endDate,
        },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    if (category === 'today') {
      const delay = event.startDate.getTime() - Date.now();
      if (delay > 0) {
        await this.weatherQueue.add(
          'refresh-event-weather',
          { eventId: event.id },
          {
            jobId: `weather:${event.id}:event-time`,
            delay,
            removeOnComplete: true,
            removeOnFail: 50,
          },
        );
      }
    }
  }

  private async getWeatherEvent(eventId: string): Promise<WeatherEvent | null> {
    return this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
        publiclyVisible: true,
      },
      select: PUBLIC_EVENT_SELECT,
    });
  }

  private async refreshEventWeather(
    event: WeatherEvent,
  ): Promise<PublicEventWeather | null> {
    if (!this.canFetchWeather(event)) {
      return null;
    }

    const category = this.getEventWeatherCategory(event.startDate);
    if (!category) {
      return null;
    }

    const forecast = await this.fetchOpenMeteoForecast(event);
    await this.redis.set(
      this.getCacheKey(event.id),
      JSON.stringify(forecast),
      'EX',
      this.getCacheTtlSeconds(category),
    );

    return forecast;
  }

  private async getCachedWeather(
    eventId: string,
  ): Promise<PublicEventWeather | null> {
    const cached = await this.redis.get(this.getCacheKey(eventId));
    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as PublicEventWeather;
    return {
      ...parsed,
      forecastTime: new Date(parsed.forecastTime),
      fetchedAt: new Date(parsed.fetchedAt),
    };
  }

  private async fetchOpenMeteoForecast(
    event: WeatherEvent,
  ): Promise<PublicEventWeather> {
    const eventDate = this.formatZonedDate(event.startDate);
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(event.latitude));
    url.searchParams.set('longitude', String(event.longitude));
    url.searchParams.set('hourly', 'temperature_2m,weather_code');
    url.searchParams.set('timezone', TIME_ZONE);
    url.searchParams.set('start_date', eventDate);
    url.searchParams.set('end_date', eventDate);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo returned ${response.status}.`);
    }

    const data = (await response.json()) as OpenMeteoResponse;
    const index = this.findForecastIndex(data, event.startDate);
    const temperature = data.hourly?.temperature_2m?.[index];
    const weatherCode = data.hourly?.weather_code?.[index];

    if (temperature == null || weatherCode == null) {
      throw new Error(
        `Open-Meteo did not return weather for event ${event.id}.`,
      );
    }

    return {
      eventId: event.id,
      temperature: Math.round(temperature),
      weatherCode,
      ...this.describeWeather(weatherCode, event.startDate),
      forecastTime: event.startDate,
      fetchedAt: new Date(),
      attribution: ATTRIBUTION,
    };
  }

  private findForecastIndex(data: OpenMeteoResponse, eventDate: Date): number {
    const targetTime = `${this.formatZonedDate(eventDate)}T${this.formatZonedHour(
      eventDate,
    )}:00`;
    const index = data.hourly?.time?.findIndex((time) => time === targetTime);
    if (index == null || index < 0) {
      return Number(this.formatZonedHour(eventDate));
    }

    return index;
  }

  private canFetchWeather(event: WeatherEvent): boolean {
    return (
      event.latitude != null &&
      event.longitude != null &&
      event.startDate.getTime() > Date.now()
    );
  }

  private getEventWeatherCategory(
    eventDate: Date,
  ): 'today' | 'tomorrow' | 'upcoming' | null {
    const days = this.daysBetweenZonedDates(new Date(), eventDate);
    if (days < 0 || days > 14) {
      return null;
    }

    if (days === 0) {
      return 'today';
    }

    if (days === 1) {
      return 'tomorrow';
    }

    return 'upcoming';
  }

  private getRepeatPattern(
    category: 'today' | 'tomorrow' | 'upcoming',
  ): string {
    switch (category) {
      case 'today':
        return '0 */2 * * *';
      case 'tomorrow':
        return '0 6,18 * * *';
      case 'upcoming':
        return '0 7 * * *';
    }
  }

  private getCacheTtlSeconds(
    category: 'today' | 'tomorrow' | 'upcoming',
  ): number {
    switch (category) {
      case 'today':
        return 60 * 60 * 2;
      case 'tomorrow':
        return 60 * 60 * 12;
      case 'upcoming':
        return 60 * 60 * 24;
    }
  }

  private describeWeather(
    weatherCode: number,
    eventDate: Date,
  ): Pick<PublicEventWeather, 'summary' | 'materialIcon'> {
    const night = Number(this.formatZonedHour(eventDate)) >= 18;
    const descriptions: Record<
      number,
      Pick<PublicEventWeather, 'summary' | 'materialIcon'>
    > = {
      0: {
        summary: 'Céu limpo',
        materialIcon: night ? 'nights_stay' : 'wb_sunny',
      },
      1: {
        summary: 'Céu predominantemente limpo',
        materialIcon: night ? 'nights_stay' : 'wb_sunny',
      },
      2: {
        summary: 'Predominantemente nublado',
        materialIcon: 'partly_cloudy_day',
      },
      3: { summary: 'Nublado', materialIcon: 'cloud' },
      45: { summary: 'Neblina', materialIcon: 'dehaze' },
      48: { summary: 'Neblina', materialIcon: 'dehaze' },
      51: { summary: 'Garoa leve', materialIcon: 'rainy' },
      53: { summary: 'Garoa', materialIcon: 'rainy' },
      55: { summary: 'Garoa intensa', materialIcon: 'rainy' },
      61: { summary: 'Chuva leve', materialIcon: 'rainy' },
      63: { summary: 'Chuva', materialIcon: 'rainy' },
      65: { summary: 'Chuva intensa', materialIcon: 'rainy' },
      71: { summary: 'Neve leve', materialIcon: 'ac_unit' },
      73: { summary: 'Neve', materialIcon: 'ac_unit' },
      75: { summary: 'Neve intensa', materialIcon: 'ac_unit' },
      80: { summary: 'Pancada leve de chuva', materialIcon: 'rainy' },
      81: { summary: 'Pancada de chuva', materialIcon: 'rainy' },
      82: { summary: 'Pancada intensa de chuva', materialIcon: 'rainy' },
      95: { summary: 'Trovoada', materialIcon: 'thunderstorm' },
      96: { summary: 'Trovoada', materialIcon: 'thunderstorm' },
      99: { summary: 'Trovoada', materialIcon: 'thunderstorm' },
    };

    return (
      descriptions[weatherCode] ?? {
        summary: 'Previsão indisponível',
        materialIcon: 'cloud',
      }
    );
  }

  private daysBetweenZonedDates(left: Date, right: Date): number {
    const leftNoon = new Date(`${this.formatZonedDate(left)}T12:00:00Z`);
    const rightNoon = new Date(`${this.formatZonedDate(right)}T12:00:00Z`);
    return Math.round(
      (rightNoon.getTime() - leftNoon.getTime()) / (24 * 60 * 60 * 1000),
    );
  }

  private formatZonedDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private formatZonedHour(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  }

  private getCacheKey(eventId: string): string {
    return `weather:event:${eventId}`;
  }
}
