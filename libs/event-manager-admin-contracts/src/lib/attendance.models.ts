import type { Event, MajorEvent } from './event.models';
import type { Person } from './people.models';

export type AttendanceCreationMethod = 'CSV_IMPORT' | 'MANUAL_INPUT' | 'SCANNER' | 'ONLINE_CODE' | 'UNKNOWN';
export type AttendanceImportMatchType = 'IDENTITY_DOCUMENT' | 'EMAIL' | 'FULL_NAME';
export type AttendanceCategory = 'NON_PAYING' | 'NON_SUBSCRIBED' | 'REGULAR' | 'UNKNOWN';
export type SubscriptionStatus =
  | 'WAITING_RECEIPT_UPLOAD'
  | 'RECEIPT_UNDER_REVIEW'
  | 'REJECTED_INVALID_RECEIPT'
  | 'REJECTED_NO_SLOTS'
  | 'REJECTED_SCHEDULE_CONFLICT'
  | 'REJECTED_GENERIC'
  | 'CONFIRMED'
  | 'CANCELED';
export type SubscriptionCreationMethod = 'ADMIN_DASHBOARD' | 'SELF_SUBSCRIPTION' | 'UNKNOWN';

export interface EventAttendance {
  personId: string;
  eventId: string;
  person?: Person | null;
  event?: Event | null;
  category: AttendanceCategory;
  attendedAt: string;
  createdAt: string;
  createdById?: string | null;
  committedById?: string | null;
  createdByMethod: AttendanceCreationMethod;
  collectedByFullName?: string | null;
  committedByFullName?: string | null;
  collectedLatitude?: number | null;
  collectedLongitude?: number | null;
  collectedAccuracyMeters?: number | null;
}

export type OfflineEventAttendanceSubmissionStatus = 'PENDING' | 'COMMITTED' | 'REJECTED';
export type OfflineEventAttendanceResolutionIssue =
  | 'COLLECTION_WINDOW_EXPIRED'
  | 'DUPLICATE_ATTENDANCE'
  | 'DUPLICATE_PERSON'
  | 'EVENT_DELETED'
  | 'EVENT_LOCKED'
  | 'INVALID_SCANNER_CODE'
  | 'LOCATION_IMPRECISE'
  | 'LOCATION_MISSING'
  | 'PERSON_NOT_FOUND'
  | 'UNSUPPORTED_METHOD'
  | 'UNKNOWN';

export interface OfflineEventAttendanceSubmission {
  id: string;
  clientId: string;
  eventId: string;
  event?: Event | null;
  personId?: string | null;
  person?: Person | null;
  status: OfflineEventAttendanceSubmissionStatus;
  createdByMethod: AttendanceCreationMethod;
  scannerCode?: string | null;
  manualValue?: string | null;
  collectedAt: string;
  authorUserId?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  submittedById: string;
  submittedByFullName?: string | null;
  submittedAt: string;
  stagedReason?: string | null;
  resolutionError?: string | null;
  resolutionIssue?: OfflineEventAttendanceResolutionIssue | null;
  collectedLatitude?: number | null;
  collectedLongitude?: number | null;
  collectedAccuracyMeters?: number | null;
  committedAt?: string | null;
  committedById?: string | null;
  committedByFullName?: string | null;
  rejectedAt?: string | null;
  rejectedById?: string | null;
  rejectedByFullName?: string | null;
  rejectionReason?: string | null;
}

export interface EventAttendanceCollector {
  eventId: string;
  personId: string;
  event?: Event | null;
  person?: Person | null;
  createdAt: string;
  createdById?: string | null;
}

export interface EventAttendanceScannerFeedItem {
  personId: string;
  eventId: string;
  fullName?: string | null;
  unespRole?: string | null;
  subscriptionStatus?: SubscriptionStatus | null;
  attendedAt?: string | null;
  createdByMethod?: AttendanceCreationMethod | null;
  collectedByFirstName?: string | null;
}

export interface MajorEventEventAttendanceStatus {
  eventId: string;
  eventName: string;
  eventStartDate?: string | null;
  attended: boolean;
  attendedAt?: string | null;
  category: AttendanceCategory;
}

export interface MajorEventUserAttendance {
  majorEventId: string;
  subscriptionId?: string | null;
  personId: string;
  person?: Person | null;
  subscriptionStatus: string;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  attendances: MajorEventEventAttendanceStatus[];
}

export interface WorkspaceEventSubscription {
  id: string;
  eventId: string;
  event?: Event | null;
  personId: string;
  person?: Person | null;
  eventGroupSubscriptionId?: string | null;
  majorEventSubscriptionId?: string | null;
  createdAt: string;
  createdById?: string | null;
  createdByMethod: SubscriptionCreationMethod;
  isLecturerSubscription: boolean;
}

export interface WorkspaceMajorEventSubscriptionEvent {
  eventId: string;
  eventName: string;
  eventStartDate?: string | null;
  subscribed: boolean;
  isLecturerSubscription: boolean;
}

export interface WorkspaceMajorEventSubscription {
  id: string;
  majorEventId: string;
  majorEvent?: MajorEvent | null;
  personId: string;
  person?: Person | null;
  subscriptionStatus: SubscriptionStatus;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  createdAt: string;
  createdById?: string | null;
  createdByMethod: SubscriptionCreationMethod;
  events: WorkspaceMajorEventSubscriptionEvent[];
}

export interface EventAttendanceCsvImportResult {
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
  failedValues: string[];
  inferredMatchType: AttendanceImportMatchType;
  ambiguousValues: EventAttendanceCsvImportAmbiguousValue[];
}

export interface EventAttendanceCsvImportCandidate {
  id: string;
  name: string;
}

export interface EventAttendanceCsvImportAmbiguousValue {
  value: string;
  candidates: EventAttendanceCsvImportCandidate[];
}

export interface EventAttendanceCsvImportResolution {
  value: string;
  personId: string;
}

export interface MajorEventSubscriptionCsvColumnMapping {
  emailHeader?: string | null;
  fullNameHeader?: string | null;
  enrollmentNumberHeader?: string | null;
  identityDocumentHeader?: string | null;
  subscribedEventIdsHeader: string;
}

export interface MajorEventSubscriptionCsvImportResult {
  createdSubscriptionCount: number;
  updatedSubscriptionCount: number;
  duplicateCount: number;
  createdPeopleCount: number;
  failedCount: number;
  createdPeople: Person[];
  failedRows: string[];
}

export interface EventLecturer {
  eventId: string;
  personId: string;
  event?: Event | null;
  person?: Person | null;
  createdAt: string;
  createdById?: string | null;
}
