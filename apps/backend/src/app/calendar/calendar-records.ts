import { Prisma } from '@prisma/client';
import type { ICalLocation } from 'ical-generator';
import {
  ADMIN_EVENT_GROUP_RANGE_EVENT_TAKE,
  PUBLIC_EVENT_GROUP_RANGE_EVENT_QUERY_TAKE,
} from './calendar-feed.constants';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';

export const CALENDAR_EVENT_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  createdAt: true,
  updatedAt: true,
  majorEvent: {
    select: {
      name: true,
    },
  },
  eventGroup: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.EventSelect;

export const PUBLIC_EVENT_CALENDAR_SELECT = {
  ...CALENDAR_EVENT_SELECT,
  eventGroup: {
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      events: {
        where: PUBLIC_EVENT_WHERE,
        orderBy: {
          startDate: 'asc',
        },
        select: {
          startDate: true,
          endDate: true,
        },
        take: PUBLIC_EVENT_GROUP_RANGE_EVENT_QUERY_TAKE,
      },
    },
  },
} satisfies Prisma.EventSelect;

export const CALENDAR_FEED_SETTINGS_SELECT = {
  feedKeyNonce: true,
  feedKeyHash: true,
  enabled: true,
  disabledAt: true,
  disabledReason: true,
  lastFetchedAt: true,
  rotatedAt: true,
  updatedAt: true,
} satisfies Prisma.UserCalendarFeedSettingsSelect;

export const ADMIN_CALENDAR_FEED_SETTINGS_SELECT = {
  feedKeyNonce: true,
  feedKeyHash: true,
  enabled: true,
  disabledAt: true,
  disabledReason: true,
  lastFetchedAt: true,
  lastCheckedAt: true,
  rotatedAt: true,
  updatedAt: true,
} satisfies Prisma.UserAdminCalendarFeedSettingsSelect;

export const SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT = {
  feedKeyNonce: true,
  feedKeyHash: true,
  enabled: true,
  lastFetchedAt: true,
  rotatedAt: true,
  updatedAt: true,
} satisfies Prisma.SuperAdminCalendarFeedSettingsSelect;

export const ADMIN_MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MajorEventSelect;

export function buildAdminEventGroupSelect() {
  return {
    id: true,
    name: true,
    createdAt: true,
    updatedAt: true,
    events: {
      where: {
        deletedAt: null,
      },
      orderBy: {
        startDate: 'asc',
      },
      select: {
        startDate: true,
        endDate: true,
      },
      take: ADMIN_EVENT_GROUP_RANGE_EVENT_TAKE,
    },
  } satisfies Prisma.EventGroupSelect;
}

export const ADMIN_CALENDAR_GRANT_SELECT = {
  permission: true,
  scope: true,
  eventId: true,
  majorEventId: true,
  eventGroupId: true,
} satisfies Prisma.EventManagerPermissionGrantSelect;

export type CalendarEventRecord = Prisma.EventGetPayload<{ select: typeof CALENDAR_EVENT_SELECT }>;
export type PublicEventCalendarRecord = Prisma.EventGetPayload<{ select: typeof PUBLIC_EVENT_CALENDAR_SELECT }>;
export type CalendarFeedSettingsRecord = Prisma.UserCalendarFeedSettingsGetPayload<{
  select: typeof CALENDAR_FEED_SETTINGS_SELECT;
}>;
export type AdminCalendarFeedSettingsRecord = Prisma.UserAdminCalendarFeedSettingsGetPayload<{
  select: typeof ADMIN_CALENDAR_FEED_SETTINGS_SELECT;
}>;
export type SuperAdminCalendarFeedSettingsRecord = Prisma.SuperAdminCalendarFeedSettingsGetPayload<{
  select: typeof SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT;
}>;
export type AdminMajorEventRecord = Prisma.MajorEventGetPayload<{ select: typeof ADMIN_MAJOR_EVENT_SELECT }>;
export type AdminEventGroupRecord = Prisma.EventGroupGetPayload<{ select: ReturnType<typeof buildAdminEventGroupSelect> }>;
export type AdminCalendarGrantRecord = Prisma.EventManagerPermissionGrantGetPayload<{
  select: typeof ADMIN_CALENDAR_GRANT_SELECT;
}>;

export type CalendarEntry = {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  description: string | null;
  location: ICalLocation | string | null;
  created: Date;
  lastModified: Date;
  url: string | null;
};

export type AdminFeedTargetPlan = {
  globalEvents: boolean;
  globalEventGroups: boolean;
  globalMajorEvents: boolean;
  eventIds: Set<string>;
  eventMajorEventIds: Set<string>;
  eventGroupIdsForEvents: Set<string>;
  eventGroupIds: Set<string>;
  majorEventIds: Set<string>;
};
