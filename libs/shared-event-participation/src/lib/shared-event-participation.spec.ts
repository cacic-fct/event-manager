import { describe, expect, it } from 'vitest';
import { AttendanceEligibility, interestedEventIds, isAttendanceEligible, matchesEventFormAudience, resolveAttendanceEligibility } from './shared-event-participation';

describe('attendance eligibility', () => {
  it('preserves standalone and major event defaults', () => {
    expect(resolveAttendanceEligibility({})).toBe('REGISTERED_ONLY');
    expect(resolveAttendanceEligibility({ eventGroup: {} })).toBe('REGISTERED_ONLY');
    expect(resolveAttendanceEligibility({ majorEventId: 'major-event' })).toBe('APPROVED_REGISTRATIONS_ONLY');
  });

  it('inherits parent policy while preserving explicit child overrides', () => {
    const majorEvent = { attendanceEligibility: AttendanceEligibility.ANYONE };
    expect(resolveAttendanceEligibility({ majorEvent })).toBe('ANYONE');
    const eventGroup = { attendanceEligibility: AttendanceEligibility.REGISTERED_ONLY };
    expect(resolveAttendanceEligibility({ eventGroup, majorEvent })).toBe('REGISTERED_ONLY');
    expect(resolveAttendanceEligibility({ attendanceEligibility: 'INVITED_ONLY', eventGroup, majorEvent }))
      .toBe('INVITED_ONLY');
  });

  it.each([
    ['ANYONE', false, false, true],
    ['ANYONE', true, false, true],
    ['REGISTERED_ONLY', false, true, false],
    ['REGISTERED_ONLY', true, false, true],
    ['APPROVED_REGISTRATIONS_ONLY', true, false, false],
    ['APPROVED_REGISTRATIONS_ONLY', false, true, false],
    ['APPROVED_REGISTRATIONS_ONLY', true, true, true],
    ['INVITED_ONLY', true, true, false],
  ] as const)('%s with registered=%s and approved=%s resolves to %s', (policy, registered, approved, eligible) => {
    expect(isAttendanceEligible(policy, { registered, approved })).toBe(eligible);
  });
});

describe('form audience membership', () => {
  it('keeps explicit interest for analytics while excluding subscribers from interest-only forms', () => {
    const person = { interested: true, subscribed: true, attended: false };
    expect(matchesEventFormAudience(['INTERESTED'], person)).toBe(false);
    expect(matchesEventFormAudience(['INTERESTED', 'SUBSCRIBERS'], person)).toBe(true);
    expect(person.interested).toBe(true);
  });

  it('matches any selected audience without granting access for an empty selection', () => {
    const person = { interested: true, subscribed: false, attended: false };
    expect(matchesEventFormAudience(['INTERESTED', 'ATTENDEES'], person)).toBe(true);
    expect(matchesEventFormAudience(['SUBSCRIBERS', 'ATTENDEES'], person)).toBe(false);
    expect(matchesEventFormAudience([], person)).toBe(false);
    expect(matchesEventFormAudience(['ATTENDEES'], { ...person, attended: true })).toBe(true);
  });
});

describe('registration interest markers', () => {
  it('marks explicit event and group interests without selecting the whole major event', () => {
    const events = [{ id: 'one' }, { id: 'two', eventGroupId: 'group' }, { id: 'three' }];
    const interests = [{ eventId: 'one' }, { eventGroupId: 'group' }, { eventId: null, eventGroupId: null }];
    expect(interestedEventIds(events, interests)).toEqual(new Set(['one', 'two']));
  });
});
