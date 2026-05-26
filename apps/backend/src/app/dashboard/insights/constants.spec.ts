import {
  CACHE_KEY_PREFIX,
  CACHE_TTL_SECONDS,
  DASHBOARD_PERMISSION_REQUIREMENTS,
  DEFAULT_EMOJI,
  EIGHT_HOURS_MS,
  SUSPICIOUS_EARLIEST_DATE,
  TWO_HOURS_MS,
  UNFAVORABLE_WEATHER_CODES,
} from './constants';

describe('dashboard insights constants', () => {
  it('exposes cache, time, weather, and permission settings used by dashboard insights', () => {
    expect(CACHE_TTL_SECONDS).toBe(300);
    expect(CACHE_KEY_PREFIX).toBe('dashboard:workspace:v4');
    expect(DEFAULT_EMOJI).toBe('❔');
    expect(TWO_HOURS_MS).toBe(7200000);
    expect(EIGHT_HOURS_MS).toBe(28800000);
    expect(SUSPICIOUS_EARLIEST_DATE).toEqual(new Date('2010-01-01T00:00:00.000Z'));
    expect([...UNFAVORABLE_WEATHER_CODES]).toEqual([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);
    expect(DASHBOARD_PERMISSION_REQUIREMENTS).toEqual([
      'event#read',
      'event#edit',
      'major-event#read',
      'major-event#edit',
      'certificate#edit',
      'merge-candidate#read',
      'validate-receipt:read',
      'validate-receipt:edit',
    ]);
  });
});
