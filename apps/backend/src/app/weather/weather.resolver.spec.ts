import { IS_PUBLIC_KEY } from '../auth/auth.constants';
import { WeatherResolver } from './weather.resolver';

describe('WeatherResolver', () => {
  it('exposes a public forecast for the requested event', async () => {
    const forecast = { temperatureCelsius: 24 };
    const getPublicEventWeather = jest.fn().mockResolvedValue(forecast);
    const resolver = new WeatherResolver({ getPublicEventWeather } as never);

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, WeatherResolver)).toBe(true);
    await expect(resolver.publicEventWeather('event-1')).resolves.toBe(forecast);
    expect(getPublicEventWeather).toHaveBeenCalledWith('event-1');
  });

  it('returns the nullable public contract when the provider cannot resolve a forecast', async () => {
    const getPublicEventWeather = jest.fn().mockRejectedValue(new Error('provider unavailable'));
    const resolver = new WeatherResolver({ getPublicEventWeather } as never);

    await expect(resolver.publicEventWeather('event-1')).resolves.toBeNull();
  });
});
