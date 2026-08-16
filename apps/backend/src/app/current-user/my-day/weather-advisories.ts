import type { PublicEventWeather } from '../../weather/models';

export type MyDayWeatherAdvisoryKind = 'THUNDERSTORM' | 'RAIN' | 'COLD' | 'HEAT' | 'UV';

export interface MyDayWeatherAdvisory {
  kind: MyDayWeatherAdvisoryKind;
  title: string;
  advice: string;
  materialIcon: string;
}

const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
const THUNDERSTORM_CODES = new Set([95, 96, 99]);

export function buildMyDayWeatherAdvisories(weather: PublicEventWeather): MyDayWeatherAdvisory[] {
  const advisories: MyDayWeatherAdvisory[] = [];

  if (THUNDERSTORM_CODES.has(weather.weatherCode)) {
    advisories.push({
      kind: 'THUNDERSTORM',
      title: 'Trovoada prevista',
      advice: 'Leve um guarda-chuva e procure abrigo durante descargas elétricas.',
      materialIcon: 'thunderstorm',
    });
  } else if (RAIN_CODES.has(weather.weatherCode)) {
    advisories.push({
      kind: 'RAIN',
      title: 'Pode chover',
      advice: 'Leve um guarda-chuva.',
      materialIcon: 'rainy',
    });
  }

  if (weather.temperature < 20) {
    advisories.push({
      kind: 'COLD',
      title: 'Temperatura baixa',
      advice: 'Leve um agasalho.',
      materialIcon: 'ac_unit',
    });
  } else if (weather.temperature > 30) {
    advisories.push({
      kind: 'HEAT',
      title: 'Temperatura alta',
      advice: 'Beba bastante água.',
      materialIcon: 'thermostat',
    });
  }

  if ((weather.uvIndex ?? 0) > 3) {
    advisories.push({
      kind: 'UV',
      title: 'Índice UV elevado',
      advice: 'Use protetor solar.',
      materialIcon: 'wb_sunny',
    });
  }

  return advisories;
}
