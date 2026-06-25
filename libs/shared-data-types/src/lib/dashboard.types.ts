export type DashboardInsightSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type DashboardInsightAction =
  | 'CREATE_EVENT'
  | 'CREATE_EVENT_GROUP'
  | 'CREATE_MAJOR_EVENT'
  | 'OPEN_EVENT'
  | 'OPEN_EVENT_GROUP'
  | 'OPEN_MAJOR_EVENT'
  | 'OPEN_ATTENDANCE'
  | 'OPEN_CERTIFICATES'
  | 'OPEN_MERGE_CANDIDATES'
  | 'OPEN_PUBLICATION';

export type DashboardCertificateTargetType = 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT' | 'MAJOR_EVENT_LECTURERS';

export type DashboardInconsistencyType =
  | 'EVENT_GROUP_WITH_SINGLE_EVENT'
  | 'EVENT_GROUP_CERTIFICATE_SETTING_MISMATCH'
  | 'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE'
  | 'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE_COLLECTION'
  | 'EVENT_WITHOUT_LECTURER'
  | 'EVENT_WITHOUT_PLACE'
  | 'WEAK_EVENT_DESCRIPTION'
  | 'EVENT_SUBSCRIPTION_DATE_MISMATCH'
  | 'MAJOR_EVENT_SUBSCRIPTION_DATE_MISMATCH'
  | 'PLACE_DOUBLE_BOOKED'
  | 'LECTURER_DOUBLE_BOOKED'
  | 'LECTURER_SELF_SUBSCRIBED'
  | 'LECTURER_SELF_ATTENDED'
  | 'SUSPICIOUS_DURATION'
  | 'SUSPICIOUS_DATE'
  | 'PLACEHOLDER_EMOJI'
  | 'PUBLISHED_EVENT_HIDDEN_FROM_USERS'
  | 'DRAFT_EVENT_VISIBLE_TO_ADMINS'
  | 'PUBLISHED_EVENT_WITH_UNPUBLISHED_MAJOR_EVENT'
  | 'OVERDUE_SCHEDULED_PUBLICATION'
  | 'PUBLISHED_MAJOR_EVENT_WITHOUT_VISIBLE_CHILDREN';

export interface DashboardActionLink {
  action: DashboardInsightAction;
  label: string;
  targetId?: string | null;
}

export interface DashboardSummary {
  eventsCount: number;
  eventGroupsCount: number;
  majorEventsCount: number;
}

export interface DashboardCalendarEvent {
  id: string;
  name: string;
  emoji: string;
  type: string;
  startDate: string;
  endDate: string;
  locationDescription?: string | null;
  majorEventName?: string | null;
  eventGroupName?: string | null;
  attendancesCount: number;
  subscriptionsCount: number;
  shouldCollectAttendance: boolean;
  canCollectAttendanceNow: boolean;
}

export interface DashboardWeatherAlert {
  eventId: string;
  eventName: string;
  summary: string;
  materialIcon: string;
  forecastTime: string;
  temperature: number;
}

export interface DashboardCertificatePendingItem {
  targetType: DashboardCertificateTargetType;
  targetId: string;
  title: string;
  subtitle: string;
  finishedAt: string;
}

export interface DashboardPendingReceiptMajorEvent {
  majorEventId: string;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  pendingCount: number;
}

export interface DashboardPendingOfflineAttendanceEvent {
  eventId: string;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  pendingCount: number;
}

export interface DashboardInconsistency {
  type: DashboardInconsistencyType;
  action?: DashboardInsightAction | null;
  targetId?: string | null;
  severity: DashboardInsightSeverity;
  title: string;
  description: string;
  eventId?: string | null;
  relatedEventId?: string | null;
  personId?: string | null;
}

export interface DashboardPermissionGroup {
  type: string;
  label: string;
  resourceIcon: string;
  actions: {
    scope: string;
    label: string;
    icon: string;
  }[];
}

export interface WorkspaceDashboardInsights {
  generatedAt: string;
  summary: DashboardSummary;
  suggestions: DashboardActionLink[];
  calendarEvents: DashboardCalendarEvent[];
  weatherAlerts: DashboardWeatherAlert[];
  pendingCertificates: DashboardCertificatePendingItem[];
  pendingReceiptValidationsCount: number;
  pendingReceiptMajorEvents: DashboardPendingReceiptMajorEvent[];
  pendingOfflineAttendancesCount: number;
  pendingOfflineAttendanceEvents: DashboardPendingOfflineAttendanceEvent[];
  inconsistencies: DashboardInconsistency[];
  duplicatePeopleCount: number;
  permissions: DashboardPermissionGroup[];
}
