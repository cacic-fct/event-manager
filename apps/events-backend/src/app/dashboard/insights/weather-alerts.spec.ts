import { insightEvent } from './insights-service.fixtures';
import { buildWeatherAlerts } from './weather-alerts';

describe('buildWeatherAlerts', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns alerts only for future events with unfavorable weather forecasts', async () => {
    const weatherService = {
      getPublicEventWeather: jest
        .fn()
        .mockResolvedValueOnce({
          weatherCode: 61,
          summary: 'Chuva leve',
          materialIcon: 'rainy',
          forecastTime: new Date('2026-05-22T12:00:00.000Z'),
          temperature: 22,
        })
        .mockResolvedValueOnce({
          weatherCode: 1,
          summary: 'Céu limpo',
          materialIcon: 'sunny',
          forecastTime: new Date('2026-05-22T13:00:00.000Z'),
          temperature: 30,
        }),
    };

    const result = await buildWeatherAlerts(weatherService as never, [
      insightEvent({ id: 'rain-event', name: 'Rain event', latitude: -22.1, longitude: -51.4 }) as never,
      insightEvent({ id: 'clear-event', name: 'Clear event', latitude: -22.2, longitude: -51.5 }) as never,
      insightEvent({ id: 'no-location', latitude: null, longitude: -51.5 }) as never,
      insightEvent({
        id: 'past-event',
        latitude: -22.3,
        longitude: -51.6,
        startDate: new Date('2026-05-20T12:00:00.000Z'),
      }) as never,
    ]);

    expect(result).toEqual([
      {
        eventId: 'rain-event',
        eventName: 'Rain event',
        summary: 'Chuva leve',
        materialIcon: 'rainy',
        forecastTime: new Date('2026-05-22T12:00:00.000Z'),
        temperature: 22,
      },
    ]);
    expect(weatherService.getPublicEventWeather).toHaveBeenCalledTimes(2);
  });

  it('ignores missing forecasts and forecast failures', async () => {
    const weatherService = {
      getPublicEventWeather: jest.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline')),
    };

    await expect(
      buildWeatherAlerts(weatherService as never, [
        insightEvent({ id: 'missing-forecast', latitude: -22.1, longitude: -51.4 }) as never,
        insightEvent({ id: 'failed-forecast', latitude: -22.2, longitude: -51.5 }) as never,
      ]),
    ).resolves.toEqual([]);
  });
});
