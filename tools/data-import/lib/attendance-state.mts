// Legacy source labels are retained for reporting; only current enum values reach PostgreSQL.
export type LegacyAttendanceCategory = 'REGULAR' | 'NON_PAYING' | 'NON_SUBSCRIBED' | 'UNKNOWN';

export function attendanceState(category: LegacyAttendanceCategory) {
  switch (category) {
    case 'NON_PAYING':
      return { category: 'NON_REGULAR', currentAssessment: 'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED' } as const;
    case 'NON_SUBSCRIBED':
      return { category: 'NON_REGULAR', currentAssessment: 'ACTIVITY_SUBSCRIPTION_MISSING' } as const;
    case 'REGULAR':
      return { category: 'REGULAR', currentAssessment: 'REQUIREMENTS_CURRENTLY_MET' } as const;
    case 'UNKNOWN':
      return { category: 'UNKNOWN', currentAssessment: null } as const;
  }
}
