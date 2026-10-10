import type { EventAudience } from '@cacic-fct/shared-event-participation';
import type { AttendanceEligibility } from '@cacic-fct/shared-event-participation';

export interface AudienceInvitationPerson {
  id: string;
  name: string;
  email?: string | null;
  unresolved?: boolean;
}

export interface AudienceParentRestriction {
  label: string;
  audience?: EventAudience | null;
  audienceCourseCodes?: readonly string[];
  attendanceEligibility?: AttendanceEligibility | null;
  unavailable?: boolean;
}

export const COURSE_CODE_COMPUTER_SCIENCE = '12';

export function normalizeAudienceCourseCodes(audience: EventAudience | null | undefined): string[] {
  return audience === 'COURSE_ONLY' ? [COURSE_CODE_COMPUTER_SCIENCE] : [];
}
