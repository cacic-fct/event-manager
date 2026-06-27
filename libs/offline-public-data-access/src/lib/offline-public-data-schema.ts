import type { EventTargetType, PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import type { AttendanceCreationMethod } from '@cacic-fct/shared-data-types';
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

export type CalendarDefaultItemViewPreference = 'automatic' | 'list' | 'week';

export interface OfflineCalendarPreferencesRecord {
  key: 'calendar';
  defaultItemView: CalendarDefaultItemViewPreference;
  updatedAt: number;
}

export interface OfflineTotpSeedRecord {
  userId: string;
  primaryEmail: string;
  seed: string;
  algorithm: 'SHA512';
  digits: 6;
  periodSeconds: 30;
  serverTime: string | Date;
  sessionExpiresAt: number;
  updatedAt: number;
}

export interface OfflineAttendanceCollectionEventRecord {
  key: string;
  userId: string;
  eventId: string;
  cachedAt: number;
  event: PublicEvent;
}

export type OfflineAttendanceQueueStatus = 'PENDING' | 'SYNCING' | 'DUPLICATE' | 'CONFLICT' | 'FORBIDDEN' | 'FAILED';

export interface OfflineAttendanceQueueLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export interface OfflineAttendanceQueueItem {
  clientId: string;
  queuedByUserId: string;
  eventId: string;
  eventName: string;
  createdByMethod: Extract<AttendanceCreationMethod, 'SCANNER' | 'MANUAL_INPUT'>;
  code?: string;
  value?: string;
  location: OfflineAttendanceQueueLocation;
  collectedAt: string;
  queuedAt: number;
  updatedAt: number;
  authorUserId: string | null;
  authorName: string | null;
  authorEmail: string | null;
  status: OfflineAttendanceQueueStatus;
  attempts: number;
  lastError?: string | null;
}

export class OfflinePublicDataDatabase extends Dexie {
  calendarEvents!: Table<OfflineCalendarEvent, string>;
  syncMetadata!: Table<OfflinePublicDataSyncMetadata, string>;
  userSnapshots!: Table<OfflineUserSnapshot, string>;
  attendanceFeeds!: Table<OfflineAttendanceFeedRecord, string>;
  attendanceDetails!: Table<OfflineAttendanceDetailRecord, string>;
  featureFlagCache!: Table<OfflineFeatureFlagCacheRecord, string>;
  calendarPreferences!: Table<OfflineCalendarPreferencesRecord, string>;
  totpSeeds!: Table<OfflineTotpSeedRecord, string>;
  attendanceCollectionEvents!: Table<OfflineAttendanceCollectionEventRecord, string>;
  attendanceQueue!: Table<OfflineAttendanceQueueItem, string>;

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

    this.version(4).stores({
      calendarEvents: 'id, startDate, cachedAt',
      syncMetadata: 'key',
      userSnapshots: 'userId, updatedAt',
      attendanceFeeds: 'key, userId, updatedAt',
      attendanceDetails: 'key, userId, [userId+targetType+targetId], updatedAt',
      featureFlagCache: 'key, updatedAt',
      attendanceCollectionEvents: 'key, userId, eventId, cachedAt, [userId+eventId]',
      attendanceQueue: 'clientId, eventId, status, queuedAt, updatedAt, [eventId+status]',
    });

    this.version(5)
      .stores({
        calendarEvents: 'id, startDate, cachedAt',
        syncMetadata: 'key',
        userSnapshots: 'userId, updatedAt',
        attendanceFeeds: 'key, userId, updatedAt',
        attendanceDetails: 'key, userId, [userId+targetType+targetId], updatedAt',
        featureFlagCache: 'key, updatedAt',
        attendanceCollectionEvents: 'key, userId, eventId, cachedAt, [userId+eventId]',
        attendanceQueue: [
          'clientId',
          'queuedByUserId',
          'eventId',
          'status',
          'queuedAt',
          'updatedAt',
          '[queuedByUserId+eventId]',
          '[queuedByUserId+status]',
          '[eventId+status]',
        ].join(', '),
      })
      .upgrade((transaction) =>
        transaction
          .table<OfflineAttendanceQueueItem, string>('attendanceQueue')
          .toCollection()
          .modify((item) => {
            item.queuedByUserId = item.queuedByUserId ?? item.authorUserId ?? '';
          }),
      );

    this.version(6).stores({
      calendarEvents: 'id, startDate, cachedAt',
      syncMetadata: 'key',
      userSnapshots: 'userId, updatedAt',
      attendanceFeeds: 'key, userId, updatedAt',
      attendanceDetails: 'key, userId, [userId+targetType+targetId], updatedAt',
      featureFlagCache: 'key, updatedAt',
      totpSeeds: 'userId, primaryEmail, sessionExpiresAt, updatedAt',
      attendanceCollectionEvents: 'key, userId, eventId, cachedAt, [userId+eventId]',
      attendanceQueue: [
        'clientId',
        'queuedByUserId',
        'eventId',
        'status',
        'queuedAt',
        'updatedAt',
        '[queuedByUserId+eventId]',
        '[queuedByUserId+status]',
        '[eventId+status]',
      ].join(', '),
    });

    this.version(7).stores({
      calendarEvents: 'id, startDate, cachedAt',
      syncMetadata: 'key',
      userSnapshots: 'userId, updatedAt',
      attendanceFeeds: 'key, userId, updatedAt',
      attendanceDetails: 'key, userId, [userId+targetType+targetId], updatedAt',
      featureFlagCache: 'key, updatedAt',
      calendarPreferences: 'key, updatedAt',
      totpSeeds: 'userId, primaryEmail, sessionExpiresAt, updatedAt',
      attendanceCollectionEvents: 'key, userId, eventId, cachedAt, [userId+eventId]',
      attendanceQueue: [
        'clientId',
        'queuedByUserId',
        'eventId',
        'status',
        'queuedAt',
        'updatedAt',
        '[queuedByUserId+eventId]',
        '[queuedByUserId+status]',
        '[eventId+status]',
      ].join(', '),
    });
  }
}
