import {
  AttendanceEligibility,
  ATTENDANCE_ELIGIBILITY_LABELS,
} from '@cacic-fct/shared-event-participation';

export type AttendanceEligibilityTarget = 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT' | 'CERTIFICATE';
export type AttendanceEligibilityParent = 'NONE' | 'GROUP' | 'MAJOR';

export interface AttendanceEligibilityOption {
  value: AttendanceEligibility | null;
  label: string;
  disabled?: boolean;
}

export function attendanceEligibilityOptionsFor(
  target: AttendanceEligibilityTarget,
  parent: AttendanceEligibilityParent,
  current: AttendanceEligibility | null | undefined,
  hasMajorEventContext = false,
): AttendanceEligibilityOption[] {
  if (target === 'CERTIFICATE') {
    const options: AttendanceEligibilityOption[] = [
      { value: null, label: 'Usar regras dos eventos' },
      { value: AttendanceEligibility.REGISTERED_ONLY, label: ATTENDANCE_ELIGIBILITY_LABELS.REGISTERED_ONLY },
    ];

    if (parent === 'MAJOR' || hasMajorEventContext) {
      options.push({
        value: AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY,
        label: 'Inscrição confirmada no grande evento',
      });
    }

    options.push({
      value: AttendanceEligibility.INVITED_ONLY,
      label: ATTENDANCE_ELIGIBILITY_LABELS.INVITED_ONLY,
    });

    return options;
  }

  const options: AttendanceEligibilityOption[] = [];
  if (parent !== 'NONE') {
    options.push({
      value: null,
      label: parent === 'GROUP' ? 'Usar regra do grupo' : 'Usar regra do grande evento',
    });
  }

  options.push({ value: AttendanceEligibility.ANYONE, label: ATTENDANCE_ELIGIBILITY_LABELS.ANYONE });
  options.push({ value: AttendanceEligibility.REGISTERED_ONLY, label: ATTENDANCE_ELIGIBILITY_LABELS.REGISTERED_ONLY });

  if (target === 'MAJOR_EVENT' || parent === 'MAJOR' || hasMajorEventContext) {
    options.push({
      value: AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY,
      label: 'Inscrição confirmada no grande evento',
    });
  }

  options.push({
    value: AttendanceEligibility.INVITED_ONLY,
    label: ATTENDANCE_ELIGIBILITY_LABELS.INVITED_ONLY,
  });

  return options;
}

export function displayAttendanceEligibility(
  policy: AttendanceEligibility | null | undefined,
  target: AttendanceEligibilityTarget,
  parent: AttendanceEligibilityParent,
  hasMajorEventContext = false,
): AttendanceEligibility | null {
  if (target === 'CERTIFICATE') {
    return policy === AttendanceEligibility.ANYONE ? null : (policy ?? null);
  }

  if (policy === AttendanceEligibility.INVITED_ONLY) {
    return policy;
  }
  if (policy === null || policy === undefined) {
    return parent === 'NONE'
      ? target === 'MAJOR_EVENT'
        ? AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY
        : AttendanceEligibility.REGISTERED_ONLY
      : null;
  }
  if (
    policy === AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY &&
    target !== 'MAJOR_EVENT' &&
    parent !== 'MAJOR' &&
    !hasMajorEventContext
  ) {
    return AttendanceEligibility.REGISTERED_ONLY;
  }
  return policy;
}

export function attendanceEligibilityLabel(policy: AttendanceEligibility | null | undefined): string {
  return policy ? ATTENDANCE_ELIGIBILITY_LABELS[policy] : 'Herdar regra';
}

export function attendanceEligibilityHint(): string {
  return 'Define quem pode confirmar a própria presença on-line; o público de acesso é configurado separadamente. A coleta pela equipe continua disponível para todos; os certificados seguem critérios próprios.';
}
