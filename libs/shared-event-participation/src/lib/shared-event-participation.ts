import { AttendanceEligibility, EventFormAudience } from '@cacic-fct/event-manager-public-contracts/types';
import type { EventInterest } from '@cacic-fct/event-manager-public-contracts/types';
export { AttendanceEligibility, EventFormAudience, InterestTargetType } from '@cacic-fct/event-manager-public-contracts/types';
export type { EventInterest } from '@cacic-fct/event-manager-public-contracts/types';

/** Interest history is retained, but interest-only forms target people still considering registration. */
export function matchesEventFormAudience(
  audiences: readonly EventFormAudience[],
  person: { interested: boolean; subscribed: boolean; attended: boolean },
): boolean {
  return audiences.some((audience) => {
    switch (audience) {
      case EventFormAudience.INTERESTED: return person.interested && !person.subscribed;
      case EventFormAudience.SUBSCRIBERS: return person.subscribed;
      case EventFormAudience.ATTENDEES: return person.attended;
    }
  });
}

export function interestedEventIds(
  events: readonly { id: string; eventGroupId?: string | null }[],
  interests: readonly Pick<EventInterest, 'eventId' | 'eventGroupId'>[],
): Set<string> {
  const direct = new Set(interests.flatMap((interest) => interest.eventId ? [interest.eventId] : []));
  const groups = new Set(interests.flatMap((interest) => interest.eventGroupId ? [interest.eventGroupId] : []));
  return new Set(events.filter((event) => direct.has(event.id) || Boolean(event.eventGroupId && groups.has(event.eventGroupId)))
    .map((event) => event.id));
}

export interface AttendancePolicyContext {
  attendanceEligibility?: AttendanceEligibility | null;
  eventGroup?: { attendanceEligibility?: AttendanceEligibility | null } | null;
  majorEventId?: string | null;
  majorEvent?: { attendanceEligibility?: AttendanceEligibility | null } | null;
}

/** Child overrides are explicit; null keeps the parent policy and legacy defaults. */
export function resolveAttendanceEligibility(context: AttendancePolicyContext): AttendanceEligibility {
  return context.attendanceEligibility
    ?? context.eventGroup?.attendanceEligibility
    ?? context.majorEvent?.attendanceEligibility
    ?? (context.majorEventId || context.majorEvent
      ? AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY
      : AttendanceEligibility.REGISTERED_ONLY);
}

export interface AttendanceEligibilitySubject {
  registered: boolean;
  approved: boolean;
  invited?: boolean;
}

/** This controls certificate credit and self check-in, never staff attendance collection. */
export function isAttendanceEligible(
  policy: AttendanceEligibility,
  subject: AttendanceEligibilitySubject,
): boolean {
  switch (policy) {
    case AttendanceEligibility.ANYONE:
      return true;
    case AttendanceEligibility.REGISTERED_ONLY:
      return subject.registered;
    case AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY:
      return subject.registered && subject.approved;
    case AttendanceEligibility.INVITED_ONLY:
      return subject.invited === true;
  }
}

export const ATTENDANCE_ELIGIBILITY_LABELS: Record<AttendanceEligibility, string> = {
  ANYONE: 'Qualquer participante',
  REGISTERED_ONLY: 'Pessoas inscritas',
  APPROVED_REGISTRATIONS_ONLY: 'Pessoas com inscrição aprovada',
  INVITED_ONLY: 'Pessoas convidadas',
};

