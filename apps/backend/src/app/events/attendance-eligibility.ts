import { AttendanceCurrentAssessment } from '@cacic-fct/shared-data-types';
import {
  AttendanceEligibility,
  AttendancePolicyContext,
  isAttendanceEligible,
  resolveAttendanceEligibility,
} from '@cacic-fct/shared-event-participation';
import { Prisma, SubscriptionStatus } from '@prisma/client';

/**
 * The smallest event relation needed by every attendance eligibility reader.
 * Keep this separate from the public event selects: staff and current-user
 * paths also need the inherited policy, while the public mapper owns the
 * participant-facing shape.
 */
export const ATTENDANCE_POLICY_EVENT_SELECT = {
  attendanceEligibility: true,
  majorEventId: true,
  eventGroupId: true,
  eventGroup: {
    select: {
      attendanceEligibility: true,
      deletedAt: true,
    },
  },
  majorEvent: {
    select: {
      attendanceEligibility: true,
      isPaymentRequired: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.EventSelect;

export type AttendancePolicyEvent = Prisma.EventGetPayload<{
  select: typeof ATTENDANCE_POLICY_EVENT_SELECT;
}>;

export type AttendanceRegistrationEvidence = {
  hasEventSubscription: boolean;
  majorEventSubscriptionStatus?: string | null;
  hasSelectedEvent?: boolean;
  autoSubscribe?: boolean;
};

export const ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES = [
  SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
  SubscriptionStatus.RECEIPT_UNDER_REVIEW,
  SubscriptionStatus.CONFIRMED,
] as const;

export function isActiveMajorEventRegistration(status: string | null | undefined): boolean {
  return ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES.some((active) => active === status);
}

export function eventAttendanceEligibility(event: AttendancePolicyContext): AttendanceEligibility {
  const candidate = event as AttendancePolicyContext & {
    eventGroupId?: string | null;
    eventGroup?: (NonNullable<AttendancePolicyContext['eventGroup']> & { deletedAt?: Date | null }) | null;
    majorEvent?: (NonNullable<AttendancePolicyContext['majorEvent']> & { deletedAt?: Date | null }) | null;
  };
  return resolveAttendanceEligibility({
    ...event,
    eventGroup:
      candidate.eventGroupId && !candidate.eventGroup?.deletedAt ? candidate.eventGroup : null,
    majorEvent:
      candidate.majorEventId && !candidate.majorEvent?.deletedAt ? candidate.majorEvent : null,
  });
}

export function isApprovedAttendance(
  event: { majorEventId?: string | null },
  evidence: AttendanceRegistrationEvidence,
): boolean {
  if (!isRegisteredAttendanceEvidence(event, evidence)) {
    return false;
  }

  return !event.majorEventId || evidence.majorEventSubscriptionStatus === SubscriptionStatus.CONFIRMED;
}

export function isRegisteredAttendanceEvidence(
  event: { majorEventId?: string | null },
  evidence: AttendanceRegistrationEvidence,
): boolean {
  if (evidence.hasEventSubscription) {
    return true;
  }

  if (!event.majorEventId || !isActiveMajorEventRegistration(evidence.majorEventSubscriptionStatus)) {
    return false;
  }

  return evidence.hasSelectedEvent === true || evidence.autoSubscribe === true;
}

export function currentAssessmentForAttendance(
  event: {
    majorEventId?: string | null;
    majorEvent?: {
      isPaymentRequired?: boolean | null;
      attendanceEligibility?: AttendanceEligibility | null;
    } | null;
    attendanceEligibility?: AttendanceEligibility | null;
    eventGroup?: { attendanceEligibility?: AttendanceEligibility | null } | null;
  },
  input: {
    hasEventSubscription: boolean;
    majorEventSubscriptionStatus?: string | null;
    hasSelectedEvent?: boolean;
    autoSubscribe?: boolean;
    invited?: boolean;
  },
): AttendanceCurrentAssessment {
  const policy = eventAttendanceEligibility(event);
  if (policy === AttendanceEligibility.INVITED_ONLY && input.invited !== true) {
    return AttendanceCurrentAssessment.INVITATION_REQUIRED;
  }

  if (
    policy === AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY &&
    event.majorEventId &&
    event.majorEvent?.isPaymentRequired &&
    input.majorEventSubscriptionStatus !== SubscriptionStatus.CONFIRMED
  ) {
    if (input.majorEventSubscriptionStatus === SubscriptionStatus.WAITING_RECEIPT_UPLOAD) {
      return AttendanceCurrentAssessment.MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT;
    }

    if (input.majorEventSubscriptionStatus === SubscriptionStatus.RECEIPT_UNDER_REVIEW) {
      return AttendanceCurrentAssessment.MAJOR_EVENT_PAYMENT_UNDER_REVIEW;
    }

    return AttendanceCurrentAssessment.MAJOR_EVENT_PAYMENT_NOT_CONFIRMED;
  }

  const registrationEvidence = {
    hasEventSubscription: input.hasEventSubscription,
    majorEventSubscriptionStatus: input.majorEventSubscriptionStatus,
    hasSelectedEvent: input.hasSelectedEvent,
    autoSubscribe: input.autoSubscribe,
  } satisfies AttendanceRegistrationEvidence;
  const registered = isRegisteredAttendanceEvidence(event, registrationEvidence);
  const approved = isApprovedAttendance(event, registrationEvidence);
  if (!isAttendanceEligible(policy, { registered, approved, invited: input.invited })) {
    return AttendanceCurrentAssessment.ACTIVITY_SUBSCRIPTION_MISSING;
  }

  return AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET;
}
