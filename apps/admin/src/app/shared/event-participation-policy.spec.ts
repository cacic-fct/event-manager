import { AttendanceEligibility } from '@cacic-fct/shared-event-participation';
import {
  attendanceEligibilityHint,
  attendanceEligibilityOptionsFor,
  displayAttendanceEligibility,
} from './event-participation-policy';

describe('event participation policy options', () => {
  it('keeps standalone event choices to anyone and registered participants', () => {
    const options = attendanceEligibilityOptionsFor('EVENT', 'NONE', AttendanceEligibility.REGISTERED_ONLY);

    expect(options.map((option) => option.value)).toEqual([
      AttendanceEligibility.ANYONE,
      AttendanceEligibility.REGISTERED_ONLY,
    ]);
    expect(options.some((option) => option.value === AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY)).toBe(false);
    expect(options.some((option) => option.value === null)).toBe(false);
  });

  it('offers group inheritance and approved registration for a group inside a major event', () => {
    const options = attendanceEligibilityOptionsFor('EVENT', 'GROUP', null, true);

    expect(options[0]).toMatchObject({ value: null, label: 'Usar regra do grupo' });
    expect(options.map((option) => option.value)).toContain(AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY);
  });

  it('offers major-event inheritance for a linked group and no inheritance for the major root', () => {
    const linkedGroupOptions = attendanceEligibilityOptionsFor('EVENT_GROUP', 'MAJOR', null);
    const majorOptions = attendanceEligibilityOptionsFor('MAJOR_EVENT', 'NONE', null);

    expect(linkedGroupOptions[0]).toMatchObject({ value: null, label: 'Usar regra do grande evento' });
    expect(majorOptions.some((option) => option.value === null)).toBe(false);
    expect(majorOptions.map((option) => option.value)).toContain(AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY);
  });

  it('offers certificate inheritance and contextual registration restrictions', () => {
    const standaloneOptions = attendanceEligibilityOptionsFor('CERTIFICATE', 'NONE', null);
    const majorOptions = attendanceEligibilityOptionsFor('CERTIFICATE', 'MAJOR', null);

    expect(standaloneOptions[0]).toMatchObject({ value: null, label: 'Usar regras dos eventos' });
    expect(standaloneOptions.map((option) => option.value)).not.toContain(AttendanceEligibility.ANYONE);
    expect(majorOptions.map((option) => option.value)).toContain(null);
    expect(majorOptions.map((option) => option.value)).toContain(AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY);
  });

  it('normalizes legacy defaults without changing persisted values', () => {
    expect(displayAttendanceEligibility(null, 'EVENT', 'NONE')).toBe(AttendanceEligibility.REGISTERED_ONLY);
    expect(displayAttendanceEligibility(AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY, 'EVENT', 'NONE')).toBe(
      AttendanceEligibility.REGISTERED_ONLY,
    );
    expect(displayAttendanceEligibility(AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY, 'EVENT', 'GROUP')).toBe(
      AttendanceEligibility.REGISTERED_ONLY,
    );
    expect(
      displayAttendanceEligibility(
        AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY,
        'EVENT',
        'GROUP',
        true,
      ),
    ).toBe(AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY);
    expect(displayAttendanceEligibility(null, 'MAJOR_EVENT', 'NONE')).toBe(
      AttendanceEligibility.APPROVED_REGISTRATIONS_ONLY,
    );
    expect(displayAttendanceEligibility(null, 'EVENT', 'GROUP')).toBe(null);
    expect(displayAttendanceEligibility(null, 'CERTIFICATE', 'MAJOR')).toBe(null);
    expect(displayAttendanceEligibility(AttendanceEligibility.ANYONE, 'CERTIFICATE', 'MAJOR')).toBe(null);
  });

  it('keeps stored invited-only certificate criteria visible but unavailable', () => {
    const options = attendanceEligibilityOptionsFor('CERTIFICATE', 'NONE', AttendanceEligibility.INVITED_ONLY);

    expect(options.at(-1)).toMatchObject({
      value: AttendanceEligibility.INVITED_ONLY,
      disabled: true,
    });
  });

  it('preserves existing invited-only values as disabled read options', () => {
    const options = attendanceEligibilityOptionsFor('EVENT', 'NONE', AttendanceEligibility.INVITED_ONLY);

    expect(options.at(-1)).toMatchObject({
      value: AttendanceEligibility.INVITED_ONLY,
      disabled: true,
    });
  });

  it('uses the concise online attendance policy explanation', () => {
    expect(attendanceEligibilityHint()).toBe(
      'Define quem pode confirmar a própria presença on-line. A coleta pela equipe continua disponível para todos; os certificados seguem critérios próprios.',
    );
  });
});
