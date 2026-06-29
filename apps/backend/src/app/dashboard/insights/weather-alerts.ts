import { DashboardWeatherAlert } from '../models';
import { WeatherService } from '../../weather/weather.service';
import { UNFAVORABLE_WEATHER_CODES } from './constants';
import { InsightEvent } from './insight-event.select';
import { isFuture } from 'date-fns';

export async function buildWeatherAlerts(
  weatherService: WeatherService,
  events: InsightEvent[],
): Promise<DashboardWeatherAlert[]> {
  const weatherEvents = events.filter(
    (event) => event.latitude != null && event.longitude != null && isFuture(event.startDate),
  );

  const forecasts = await Promise.all(
    weatherEvents.map(async (event) => {
      try {
        const forecast = await weatherService.getPublicEventWeather(event.id);
        if (!forecast || !UNFAVORABLE_WEATHER_CODES.has(forecast.weatherCode)) {
          return null;
        }

        return {
          eventId: event.id,
          eventName: event.name,
          summary: forecast.summary,
          materialIcon: forecast.materialIcon,
          forecastTime: forecast.forecastTime,
          temperature: forecast.temperature,
        };
      } catch {
        return null;
      }
    }),
  );

  return forecasts.filter((forecast) => forecast != null);
}
