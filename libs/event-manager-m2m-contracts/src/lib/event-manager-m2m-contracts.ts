export type EventManagerDateTime = string;

export const EVENT_MANAGER_M2M_API_PREFIX = '/api' as const;

export const EVENT_MANAGER_M2M_VOTING_ROLES = {
  READ: 'voting-integration:read',
} as const;

export type EventManagerM2mVotingRole =
  (typeof EVENT_MANAGER_M2M_VOTING_ROLES)[keyof typeof EVENT_MANAGER_M2M_VOTING_ROLES];

export interface EventManagerVotingEvent {
  id: string;
  name: string;
  startDate: EventManagerDateTime;
  endDate: EventManagerDateTime;
  locationDescription?: string | null;
  shouldCollectAttendance: boolean;
}

export type EventManagerVotingEventsResponse = EventManagerVotingEvent[];

export interface EventManagerVotingAttendanceCheckRequest {
  userId: string;
}

export interface EventManagerVotingAttendanceCheckResponse {
  eventId: string;
  userId: string;
  attended: boolean;
  attendedAt?: EventManagerDateTime | null;
}

export interface EventManagerVotingPerson {
  enrollmentNumber: string;
  name: string;
  email?: string | null;
}

export interface EventManagerVotingPeopleLookupRequest {
  enrollmentNumbers: string[];
}

export interface EventManagerVotingPeopleLookupResponse {
  people: EventManagerVotingPerson[];
}

export const EVENT_MANAGER_M2M_VOTING_ROUTE_TEMPLATES = {
  EVENTS: `${EVENT_MANAGER_M2M_API_PREFIX}/internal/voting/events`,
  ATTENDANCE_CHECK: `${EVENT_MANAGER_M2M_API_PREFIX}/internal/voting/events/:eventId/attendance-check`,
  PEOPLE_LOOKUP: `${EVENT_MANAGER_M2M_API_PREFIX}/internal/voting/people/lookup`,
} as const;

export const EVENT_MANAGER_M2M_VOTING_ROUTES = {
  events: () => `${EVENT_MANAGER_M2M_API_PREFIX}/internal/voting/events`,
  attendanceCheck: (eventId: string) =>
    `${EVENT_MANAGER_M2M_API_PREFIX}/internal/voting/events/${encodePathSegment(eventId)}/attendance-check`,
  peopleLookup: () => `${EVENT_MANAGER_M2M_API_PREFIX}/internal/voting/people/lookup`,
} as const;

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}
