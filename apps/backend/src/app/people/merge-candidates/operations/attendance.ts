import {
  AttendanceCategory,
  AttendanceCreationMethod,
  AttendanceCurrentAssessment,
  EventAttendanceStatus,
} from '@prisma/client';
import { AttendanceSnapshot } from './types';

export type AttendanceRecord = {
  eventId: string;
  status: EventAttendanceStatus;
  category: AttendanceCategory;
  currentAssessment: AttendanceCurrentAssessment | null;
  attendedAt: Date;
  createdAt: Date;
  createdById: string | null;
  committedById: string | null;
  createdByMethod: AttendanceCreationMethod;
  collectedLatitude: number | null;
  collectedLongitude: number | null;
  collectedAccuracyMeters: number | null;
};

export function toAttendanceSnapshot(attendance: AttendanceRecord): AttendanceSnapshot {
  return {
    eventId: attendance.eventId,
    status: attendance.status,
    category: attendance.category,
    currentAssessment: attendance.currentAssessment,
    attendedAt: attendance.attendedAt.toISOString(),
    createdAt: attendance.createdAt.toISOString(),
    createdById: attendance.createdById,
    committedById: attendance.committedById,
    createdByMethod: attendance.createdByMethod,
    collectedLatitude: attendance.collectedLatitude,
    collectedLongitude: attendance.collectedLongitude,
    collectedAccuracyMeters: attendance.collectedAccuracyMeters,
  };
}

export function toAttendanceCreateData(personId: string, attendance: AttendanceSnapshot) {
  return {
    personId,
    eventId: attendance.eventId,
    status: attendance.status,
    category: attendance.category,
    currentAssessment: attendance.currentAssessment,
    attendedAt: new Date(attendance.attendedAt),
    createdAt: new Date(attendance.createdAt),
    createdById: attendance.createdById,
    committedById: attendance.committedById,
    createdByMethod: attendance.createdByMethod,
    collectedLatitude: attendance.collectedLatitude,
    collectedLongitude: attendance.collectedLongitude,
    collectedAccuracyMeters: attendance.collectedAccuracyMeters,
  };
}
