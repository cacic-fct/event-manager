import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  DashboardCalendarEvent,
  DashboardCertificatePendingItem,
  DashboardPendingReceiptMajorEvent,
  DashboardWeatherAlert,
  WorkspaceDashboardInsights,
} from '../models';
import { CACHE_KEY_PREFIX } from './constants';

const logger = new Logger('DashboardInsightsCache');

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
  pendingReceiptMajorEvents: (Omit<DashboardPendingReceiptMajorEvent, 'startDate' | 'endDate'> & {
    startDate: string;
    endDate: string;
  })[];
};

export async function getCachedInsights(redis: Redis, cacheKey: string): Promise<WorkspaceDashboardInsights | null> {
  const cached = await redis.get(cacheKey);
  if (!cached) {
    return null;
  }

  try {
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
      pendingReceiptMajorEvents: parsed.pendingReceiptMajorEvents.map((item) => ({
        ...item,
        startDate: new Date(item.startDate),
        endDate: new Date(item.endDate),
      })),
    };
  } catch (error) {
    logger.warn(`Ignoring invalid dashboard insights cache payload for key ${cacheKey}`, error);
    return null;
  }
}

export function getCacheKey(permissions: string[]): string {
  const normalizedPermissions = [...new Set(permissions)].sort();
  return `${CACHE_KEY_PREFIX}:${normalizedPermissions.join(',') || 'none'}`;
}
