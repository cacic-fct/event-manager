export const AttendanceEligibility = {
  ANYONE: 'ANYONE',
  REGISTERED_ONLY: 'REGISTERED_ONLY',
  APPROVED_REGISTRATIONS_ONLY: 'APPROVED_REGISTRATIONS_ONLY',
  INVITED_ONLY: 'INVITED_ONLY',
} as const;

export type AttendanceEligibility = (typeof AttendanceEligibility)[keyof typeof AttendanceEligibility];

export const InterestTargetType = {
  EVENT: 'EVENT',
  EVENT_GROUP: 'EVENT_GROUP',
  MAJOR_EVENT: 'MAJOR_EVENT',
} as const;

export type InterestTargetType = (typeof InterestTargetType)[keyof typeof InterestTargetType];

export const EventFormAudience = {
  INTERESTED: 'INTERESTED',
  SUBSCRIBERS: 'SUBSCRIBERS',
  ATTENDEES: 'ATTENDEES',
} as const;
export type EventFormAudience = (typeof EventFormAudience)[keyof typeof EventFormAudience];

export interface EventInterest {
  id: string;
  personId: string;
  eventId?: string | null;
  eventGroupId?: string | null;
  majorEventId?: string | null;
  createdAt: string;
}
