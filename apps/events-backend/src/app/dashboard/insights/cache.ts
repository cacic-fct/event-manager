import Redis from 'ioredis';
import {
  DashboardCalendarEvent,
  DashboardCertificatePendingItem,
  DashboardWeatherAlert,
  WorkspaceDashboardInsights,
} from '../models';
import { CACHE_KEY_PREFIX } from './constants';

type CachedDashboardInsights = Omit<WorkspaceDashboardInsights, 'generatedAt'> & {
  generatedAt: string;
  calendarEvents: (Omit<DashboardCalendarEvent, 'startDate' | 'endDate'> & {
    startDate: string;
    endDate: string;
  })[];
  weatherAlerts: (Omit<DashboardWeatherAlert, 'forecastTime'> & {
    forecastTime: string;
  })[];
  pendingCertificates: (Omit<DashboardCertificatePendingItem, 'finishedAt'> & {
    finishedAt: string;
  })[];
};

export async function getCachedInsights(redis: Redis, cacheKey: string): Promise<WorkspaceDashboardInsights | null> {
  const cached = await redis.get(cacheKey);
  if (!cached) {
    return null;
  }

  const parsed = JSON.parse(cached) as CachedDashboardInsights;
  return {
    ...parsed,
    generatedAt: new Date(parsed.generatedAt),
    calendarEvents: parsed.calendarEvents.map((event) => ({
      ...event,
      startDate: new Date(event.startDate),
      endDate: new Date(event.endDate),
    })),
    weatherAlerts: parsed.weatherAlerts.map((alert) => ({
      ...alert,
      forecastTime: new Date(alert.forecastTime),
    })),
    pendingCertificates: parsed.pendingCertificates.map((item) => ({
      ...item,
      finishedAt: new Date(item.finishedAt),
    })),
  };
}

export function getCacheKey(permissions: string[]): string {
  return `${CACHE_KEY_PREFIX}:${permissions.join(',') || 'none'}`;
}
