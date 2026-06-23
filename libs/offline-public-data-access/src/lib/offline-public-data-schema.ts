import type { EventTargetType, PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import type {
  EventDetails,
  EventGroupDetails,
  MajorEventDetails,
  SubscriptionsFeed,
} from '@cacic-fct/shared-utils';
import Dexie, { Table } from 'dexie';

export interface OfflineCalendarEvent {
  id: string;
  startDate: string;
  cachedAt: number;
  event: PublicEvent;
}

export interface OfflinePublicDataSyncMetadata {
  key: string;
  refreshedAt: number;
}

export interface OfflineUserSnapshot {
  userId: string;
  name: string | null;
  picture: string | null;
  unespRole: string | string[] | null;
  identityDocument: string | null;
  updatedAt: number;
}

export type OfflineAttendanceDetail =
  | { eventType: 'event'; details: EventDetails }
  | { eventType: 'event-group'; details: EventGroupDetails }
  | { eventType: 'major-event'; details: MajorEventDetails };

export interface OfflineAttendanceFeedRecord {
  key: string;
  userId: string;
  updatedAt: number;
  feed: SubscriptionsFeed;
}

export interface OfflineAttendanceDetailRecord {
  key: string;
  userId: string;
  targetType: EventTargetType;
  targetId: string;
  updatedAt: number;
  detail: OfflineAttendanceDetail;
}

export interface OfflineFeatureFlagCacheRecord {
  key: string;
  updatedAt: number;
  value: unknown;
}

export class OfflinePublicDataDatabase extends Dexie {
  calendarEvents!: Table<OfflineCalendarEvent, string>;
  syncMetadata!: Table<OfflinePublicDataSyncMetadata, string>;
  userSnapshots!: Table<OfflineUserSnapshot, string>;
  attendanceFeeds!: Table<OfflineAttendanceFeedRecord, string>;
  attendanceDetails!: Table<OfflineAttendanceDetailRecord, string>;
  featureFlagCache!: Table<OfflineFeatureFlagCacheRecord, string>;

  constructor() {
    super('cacic-public-offline-data');

    this.version(1).stores({
      calendarEvents: 'id, startDate, cachedAt',
      syncMetadata: 'key',
    });

    this.version(2).stores({
      calendarEvents: 'id, startDate, cachedAt',
      syncMetadata: 'key',
      userSnapshots: 'userId, updatedAt',
      attendanceFeeds: 'key, userId, updatedAt',
      attendanceDetails: 'key, userId, [userId+targetType+targetId], updatedAt',
    });

    this.version(3).stores({
      calendarEvents: 'id, startDate, cachedAt',
      syncMetadata: 'key',
      userSnapshots: 'userId, updatedAt',
      attendanceFeeds: 'key, userId, updatedAt',
      attendanceDetails: 'key, userId, [userId+targetType+targetId], updatedAt',
      featureFlagCache: 'key, updatedAt',
    });
  }
}
