export const CACHE_TTL_SECONDS = 5 * 60;
export const CACHE_KEY_PREFIX = 'dashboard:workspace:v4';
export const DEFAULT_EMOJI = '❔';
export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
export const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
export const SUSPICIOUS_EARLIEST_DATE = new Date('2010-01-01T00:00:00.000Z');
export const UNFAVORABLE_WEATHER_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);
export const DASHBOARD_PERMISSION_REQUIREMENTS = [
  'event#read',
  'event#edit',
  'major-event#read',
  'major-event#edit',
  'certificate#edit',
  'merge-candidate#read',
  'validate-receipt:read',
  'validate-receipt:edit',
] as const;
