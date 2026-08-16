export type AttendanceReviewStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';

export interface AttendanceTimeBucket {
  start: string;
  count: number;
}

export interface AttendanceMethodCount {
  method: string;
  count: number;
}

export interface AttendanceCollectorProductivity {
  actorId: string;
  name: string;
  count: number;
  firstScanAt: string;
  lastScanAt: string;
  methods: AttendanceMethodCount[];
  onlineCount: number;
  offlineCount: number;
}

export interface AttendanceHeatmapPoint {
  latitude: number;
  longitude: number;
  count: number;
  averageAccuracyMeters?: number | null;
}

export interface AttendanceReviewItem {
  id: string;
  eventId: string;
  kind: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: AttendanceReviewStatus;
  title: string;
  summary: string;
  detectedAt: string;
  personId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  deepLink?: string | null;
}

export interface AttendanceReviewEventSummary {
  eventId: string;
  eventName: string;
  emoji: string;
  pendingCount: number;
  startDate: string;
}

export interface EventAttendanceAnalyticsSnapshot {
  eventId: string;
  eventName: string;
  emoji: string;
  generatedAt: string;
  windowMinutes: number;
  presentCount: number;
  noShowCount: number;
  pendingReviewCount: number;
  pendingOfflineCount: number;
  eventLatitude?: number | null;
  eventLongitude?: number | null;
  scansPerMinute: AttendanceTimeBucket[];
  scansByHour: AttendanceTimeBucket[];
  collectors: AttendanceCollectorProductivity[];
  methods: AttendanceMethodCount[];
  heatmapPoints: AttendanceHeatmapPoint[];
  reviewItems: AttendanceReviewItem[];
}
