import type { EventTargetType, PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import type { AttendanceCreationMethod, SportsMatchActionType } from '@cacic-fct/shared-data-types';
import type { EventDetails, EventGroupDetails, MajorEventDetails, SubscriptionsFeed } from '@cacic-fct/shared-utils';
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
  enrollmentNumber: string | number | null;
  updatedAt: number;
}

export interface OfflineRestaurantCard {
  userId: string;
  cardNumber: string;
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
  authorUserId: string;
  authorName: string | null;
  authorEmail: string | null;
  status: OfflineAttendanceQueueStatus;
  attempts: number;
  syncedAt?: number | null;
  lastError?: string | null;
}

export function normalizeOfflineAttendanceQueueOwnership(item: OfflineAttendanceQueueItem): void {
  const legacyItem = item as OfflineAttendanceQueueItem & {
    queuedByUserId?: string | null;
    authorUserId?: string | null;
  };
  const authorUserId = legacyItem.authorUserId ?? legacyItem.queuedByUserId ?? '';
  const queuedByUserId = legacyItem.queuedByUserId ?? legacyItem.authorUserId ?? '';
  item.authorUserId = authorUserId;
  item.queuedByUserId = queuedByUserId;
}

export interface OfflineOralAttendancePerson {
  personId: string;
  fullName: string;
  identityDocument?: string | null;
  unespRole?: string | null;
}

export interface OfflineOralAttendanceRosterRecord {
  key: string;
  userId: string;
  eventId: string;
  cachedAt: number;
  people: OfflineOralAttendancePerson[];
}

export interface OfflineOralAttendanceDecision {
  clientId: string;
  queuedByUserId: string;
  eventId: string;
  personId: string;
  status: 'PRESENT' | 'ABSENT';
  location: OfflineAttendanceQueueLocation;
  collectedAt: string;
  queuedAt: number;
  attempts: number;
  syncedAt?: number | null;
  lastError?: string | null;
}

export type OfflineSportsMatchActionType = Exclude<SportsMatchActionType, 'RESCHEDULE' | 'RESET'>;

export interface OfflineSportsMatchAction {
  clientId: string;
  matchId: string;
  baseRevision: number;
  type: OfflineSportsMatchActionType;
  payloadJson: string;
  scorerRosterEntryId?: string | null;
  authoredAt: string;
  offline: boolean;
}

export interface OfflineSportsRosterCheckIn {
  clientId: string;
  matchId: string;
  rosterEntryId: string;
  checkedInAt: string;
  offline: boolean;
  present?: boolean;
  collectorPersonId?: string;
  collectorCredential?: string;
}

export interface OfflineSportsScannerCheckIn {
  clientId: string;
  matchId: string;
  code: string;
  checkedInAt: string;
  offline: boolean;
  collectorPersonId?: string;
  collectorCredential?: string;
}

export interface OfflineSportsCollectorCredential {
  userScope: string;
  matchId: string;
  credential: string;
  collectorPersonId: string;
  issuedAt: string;
}

export interface OfflineSportsMatchPeriodTimer {
  periodNumber: number;
  startedAtUnixMs?: number | null;
  pausedAtUnixMs?: number | null;
  elapsedBeforePauseMs: number;
  scheduledStartOffsetMs: number;
  capMs?: number | null;
  allowOvertime: boolean;
}

export interface OfflineSportsTimerSnapshot {
  overall: {
    startedAtUnixMs: number | null;
    pausedAtUnixMs: number | null;
    elapsedBeforePauseMs: number;
  };
  periods: OfflineSportsMatchPeriodTimer[];
  activePeriod: number | null;
}

interface OfflineSportsOperationQueueItemBase {
  id: string;
  userScope: string;
  attempts: number;
  queuedAt: string;
  lastError?: string;
}

export type OfflineSportsOperationQueueItem =
  | (OfflineSportsOperationQueueItemBase & {
      kind: 'ACTION';
      action: OfflineSportsMatchAction;
      timerSnapshot?: OfflineSportsTimerSnapshot;
    })
  | (OfflineSportsOperationQueueItemBase & { kind: 'CHECK_IN'; checkIn: OfflineSportsRosterCheckIn })
  | (OfflineSportsOperationQueueItemBase & { kind: 'SCANNER'; scannerCheckIn: OfflineSportsScannerCheckIn });

export const OFFLINE_SPORTS_COLLECTOR_PROOF_MISSING =
  'Esta presença foi salva sem a credencial original do coletor e não pode ser enviada automaticamente.';

export type OfflineSportsProvenAttendanceQueueItem =
  | (Extract<OfflineSportsOperationQueueItem, { kind: 'CHECK_IN' }> & {
      checkIn: OfflineSportsRosterCheckIn & { collectorPersonId: string; collectorCredential: string };
    })
  | (Extract<OfflineSportsOperationQueueItem, { kind: 'SCANNER' }> & {
      scannerCheckIn: OfflineSportsScannerCheckIn & { collectorPersonId: string; collectorCredential: string };
    });

export function hasOfflineSportsAttendanceCollectorProof(
  item: OfflineSportsOperationQueueItem,
): item is OfflineSportsProvenAttendanceQueueItem {
  if (item.kind === 'ACTION') {
    return false;
  }
  const input = item.kind === 'CHECK_IN' ? item.checkIn : item.scannerCheckIn;
  return Boolean(input.collectorPersonId && input.collectorCredential);
}

export function markOfflineSportsCollectorProofMissing(item: OfflineSportsOperationQueueItem): void {
  if (item.kind !== 'ACTION' && !hasOfflineSportsAttendanceCollectorProof(item)) {
    item.lastError = OFFLINE_SPORTS_COLLECTOR_PROOF_MISSING;
  }
}

export class OfflinePublicDataDatabase extends Dexie {
  calendarEvents!: Table<OfflineCalendarEvent, string>;
  syncMetadata!: Table<OfflinePublicDataSyncMetadata, string>;
  userSnapshots!: Table<OfflineUserSnapshot, string>;
  restaurantCards!: Table<OfflineRestaurantCard, string>;
  attendanceFeeds!: Table<OfflineAttendanceFeedRecord, string>;
  attendanceDetails!: Table<OfflineAttendanceDetailRecord, string>;
  featureFlagCache!: Table<OfflineFeatureFlagCacheRecord, string>;
  calendarPreferences!: Table<OfflineCalendarPreferencesRecord, string>;
  totpSeeds!: Table<OfflineTotpSeedRecord, string>;
  attendanceCollectionEvents!: Table<OfflineAttendanceCollectionEventRecord, string>;
  attendanceQueue!: Table<OfflineAttendanceQueueItem, string>;
  oralAttendanceRosters!: Table<OfflineOralAttendanceRosterRecord, string>;
  oralAttendanceDecisions!: Table<OfflineOralAttendanceDecision, string>;
  sportsOperationQueue!: Table<OfflineSportsOperationQueueItem, [string, string]>;
  sportsCollectorCredentials!: Table<OfflineSportsCollectorCredential, [string, string]>;

  constructor(name = 'cacic-public-offline-data') {
    super(name);

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

    this.version(5).stores({
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
    });

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

    this.version(8).stores({
      calendarEvents: 'id, startDate, cachedAt',
      syncMetadata: 'key',
      userSnapshots: 'userId, updatedAt',
      restaurantCards: 'userId, updatedAt',
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

    this.version(9)
      .stores({
        calendarEvents: 'id, startDate, cachedAt',
        syncMetadata: 'key',
        userSnapshots: 'userId, updatedAt',
        restaurantCards: 'userId, updatedAt',
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
        oralAttendanceRosters: 'key, userId, eventId, cachedAt, [userId+eventId]',
        oralAttendanceDecisions:
          'clientId, queuedByUserId, eventId, personId, queuedAt, [queuedByUserId+eventId], [queuedByUserId+eventId+personId]',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<OfflineAttendanceQueueItem, string>('attendanceQueue')
          .toCollection()
          .modify(normalizeOfflineAttendanceQueueOwnership);
      });

    this.version(10).stores({
      calendarEvents: 'id, startDate, cachedAt',
      syncMetadata: 'key',
      userSnapshots: 'userId, updatedAt',
      restaurantCards: 'userId, updatedAt',
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
      oralAttendanceRosters: 'key, userId, eventId, cachedAt, [userId+eventId]',
      oralAttendanceDecisions:
        'clientId, queuedByUserId, eventId, personId, queuedAt, [queuedByUserId+eventId], [queuedByUserId+eventId+personId]',
      sportsOperationQueue: '[userScope+id], userScope, queuedAt',
    });

    this.version(11)
      .stores({
        calendarEvents: 'id, startDate, cachedAt',
        syncMetadata: 'key',
        userSnapshots: 'userId, updatedAt',
        restaurantCards: 'userId, updatedAt',
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
        oralAttendanceRosters: 'key, userId, eventId, cachedAt, [userId+eventId]',
        oralAttendanceDecisions:
          'clientId, queuedByUserId, eventId, personId, queuedAt, [queuedByUserId+eventId], [queuedByUserId+eventId+personId]',
        sportsOperationQueue: '[userScope+id], userScope, queuedAt',
        sportsCollectorCredentials: '[userScope+matchId], userScope, matchId, issuedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<OfflineSportsOperationQueueItem, [string, string]>('sportsOperationQueue')
          .toCollection()
          .modify(markOfflineSportsCollectorProofMissing);
      });
  }
}
