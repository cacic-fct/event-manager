import { NotFoundException } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';

describe('WeatherService', () => {
  const originalFetch = global.fetch;
  const now = new Date('2026-05-21T12:00:00.000Z').getTime();

  let prisma: {
    event: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
  };
  let queue: {
    add: jest.Mock;
  };
  let service: WeatherService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        hourly: {
          time: ['2026-05-22T09:00'],
          temperature_2m: [21.6],
          weather_code: [61],
        },
      }),
    });
    prisma = {
      event: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    service = new WeatherService(prisma as never, redis as never, queue as never);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('returns cached weather with date fields restored', async () => {
    prisma.event.findFirst.mockResolvedValue(weatherEventFixture());
    redis.get.mockResolvedValue(
      JSON.stringify({
        eventId: 'event-1',
        temperature: 22,
        weatherCode: 61,
        summary: 'Chuva leve',
        materialIcon: 'rainy',
        forecastTime: '2026-05-22T12:00:00.000Z',
        fetchedAt: '2026-05-21T12:00:00.000Z',
        attribution: 'Weather data by Open-Meteo.com',
      }),
    );

    const result = await service.getPublicEventWeather('event-1');

    expect(result).toEqual(
      expect.objectContaining({
        eventId: 'event-1',
        forecastTime: new Date('2026-05-22T12:00:00.000Z'),
        fetchedAt: new Date('2026-05-21T12:00:00.000Z'),
      }),
    );
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [PUBLIC_EVENT_WHERE, { id: 'event-1' }],
        },
      }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws when a requested public event does not exist', async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(service.getPublicEventWeather('missing-event')).rejects.toThrow(NotFoundException);
  });

  it('fetches, rounds, caches, and schedules weather for public events', async () => {
    prisma.event.findFirst.mockResolvedValue(weatherEventFixture());

    await expect(service.getPublicEventWeather('event-1')).resolves.toEqual(
      expect.objectContaining({
        eventId: 'event-1',
        temperature: 22,
        weatherCode: 61,
        summary: 'Chuva leve',
        materialIcon: 'rainy',
        forecastTime: new Date('2026-05-22T12:00:00.000Z'),
      }),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('https://api.open-meteo.com/v1/forecast'),
      }),
    );
    expect(redis.set).toHaveBeenCalledWith(
      'weather:event:event-1',
      expect.stringContaining('"temperature":22'),
      'EX',
      43_200,
    );
    expect(queue.add).toHaveBeenCalledWith(
      'refresh-event-weather',
      { eventId: 'event-1' },
      expect.objectContaining({
        jobId: 'weather:event-1:tomorrow',
        repeat: expect.objectContaining({ pattern: '0 6,18 * * *' }),
      }),
    );
  });

  it('returns null and does not fetch weather for past or locationless events', async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce(weatherEventFixture({ latitude: null }))
      .mockResolvedValueOnce(weatherEventFixture({ startDate: new Date('2026-05-20T12:00:00.000Z') }));

    await expect(service.refreshEventWeatherById('event-1')).resolves.toBeNull();
    await expect(service.refreshEventWeatherById('event-2')).resolves.toBeNull();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('schedules upcoming event refreshes and the recurring scan job', async () => {
    const event = weatherEventFixture({ startDate: new Date('2026-05-25T12:00:00.000Z') });
    prisma.event.findMany.mockResolvedValue([event]);

    await service.scheduleUpcomingEventRefreshes();
    await service.scheduleUpcomingEventRefreshScan();

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            PUBLIC_EVENT_WHERE,
            expect.objectContaining({
              latitude: { not: null },
              longitude: { not: null },
            }),
          ],
        },
        orderBy: { startDate: 'asc' },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'refresh-event-weather',
      { eventId: 'event-1' },
      expect.objectContaining({ jobId: 'weather:event-1:upcoming' }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'schedule-upcoming-event-weather',
      {},
      expect.objectContaining({
        jobId: 'weather:schedule-upcoming-events',
        repeat: { pattern: '5 0 * * *', tz: 'America/Sao_Paulo' },
      }),
    );
  });
});

function weatherEventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    latitude: -22.12,
    longitude: -51.4,
    startDate: new Date('2026-05-22T12:00:00.000Z'),
    ...overrides,
  };
}
