import { buildMyDayWeatherAdvisories } from './weather-advisories';

describe('buildMyDayWeatherAdvisories', () => {
  it('returns compact independent guidance for rain, cold, heat, and UV', () => {
    expect(advisories({ weatherCode: 61, temperature: 19, uvIndex: 4 })).toEqual([
      expect.objectContaining({ kind: 'RAIN', materialIcon: 'rainy' }),
      expect.objectContaining({ kind: 'COLD', materialIcon: 'ac_unit' }),
      expect.objectContaining({ kind: 'UV', materialIcon: 'wb_sunny' }),
    ]);
    expect(advisories({ weatherCode: 1, temperature: 31, uvIndex: 3 })).toEqual([
      expect.objectContaining({ kind: 'HEAT', materialIcon: 'thermostat' }),
    ]);
  });

  it('uses the severe thunderstorm advisory without duplicating a rain advisory', () => {
    expect(advisories({ weatherCode: 95, temperature: 24, uvIndex: null })).toEqual([
      expect.objectContaining({ kind: 'THUNDERSTORM', materialIcon: 'thunderstorm' }),
    ]);
  });
});

function advisories(overrides: { weatherCode: number; temperature: number; uvIndex: number | null }) {
  return buildMyDayWeatherAdvisories({
    eventId: 'event-1',
    summary: 'Previsão',
    materialIcon: 'cloud',
    forecastTime: new Date('2026-08-17T12:00:00.000Z'),
    fetchedAt: new Date('2026-08-16T12:00:00.000Z'),
    attribution: 'Open-Meteo.com',
    ...overrides,
  });
}
