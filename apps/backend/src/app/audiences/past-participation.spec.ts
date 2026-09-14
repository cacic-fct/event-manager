import { ANONYMOUS_AUDIENCE, eventAudienceWhere, groupAudienceWhere, majorEventAudienceWhere } from './audience-context';
import { scopeAudienceQuery } from './audience-prisma.extension';

const now = new Date();
const formerStudent = { ...ANONYMOUS_AUDIENCE, userId: 'user-1', personIds: ['person-1'] };
const history = { ...formerStudent, pastParticipationBefore: now };
type RecordValue = Record<string, unknown>;

describe('personal participation history after audience changes', () => {
  it.each(['COURSE_ONLY', 'UNESP_ONLY', 'INVITATION_ONLY'])('keeps an owned past attendance for %s without changing catalog access', (audience) => {
    const { attended, group, major } = fixtures(audience);
    expect(matches(attended, eventAudienceWhere(formerStudent))).toBe(false);
    expect(matches(attended, eventAudienceWhere(history))).toBe(true);
    expect(matches(group, groupAudienceWhere(history))).toBe(true);
    expect(matches(major, majorEventAudienceWhere(history))).toBe(true);
  });

  it('does not let historical parent access reveal unrelated or future children', () => {
    const { unrelated, future, major, group } = fixtures('INVITATION_ONLY');
    expect(matches(major, majorEventAudienceWhere(history))).toBe(true);
    expect(matches(group, groupAudienceWhere(history))).toBe(true);
    expect(matches(unrelated, eventAudienceWhere(history))).toBe(false);
    expect(matches(future, eventAudienceWhere(history))).toBe(false);
  });

  it('retains owned ended registrations, lecturer records and issued certificates', () => {
    for (const evidence of [
      { subscriptions: [{ personId: 'person-1', deletedAt: null }] },
      { lecturers: [{ personId: 'person-1' }] },
      { certificateConfigs: [{ certificates: [{ personId: 'person-1', deletedAt: null }] }] },
    ]) {
      const event = { ...fixtures('COURSE_ONLY').unrelated, ...evidence };
      expect(matches(event, eventAudienceWhere(history))).toBe(true);
    }
  });

  it('does not accept another person, interest-only records, deleted registrations or absences as proof', () => {
    for (const evidence of [
      { attendances: [{ personId: 'person-2', status: 'PRESENT' }] },
      { interests: [{ personId: 'person-1', deletedAt: null }] },
      { subscriptions: [{ personId: 'person-1', deletedAt: now }] },
      { attendances: [{ personId: 'person-1', status: 'ABSENT' }] },
    ]) {
      expect(matches({ ...fixtures('COURSE_ONLY').unrelated, ...evidence }, eventAudienceWhere(history))).toBe(false);
    }
  });

  it('removes the historical exception from writes even inside a history read scope', () => {
    const { attended } = fixtures('INVITATION_ONLY');
    const query = scopeAudienceQuery('Event', 'findFirst', { where: { id: attended.id } }, history);
    const update = scopeAudienceQuery('Event', 'update', { where: { id: attended.id }, data: { name: 'Changed' } }, history);
    expect(matches(attended, query['where'])).toBe(true);
    expect(matches(attended, update['where'])).toBe(false);
  });
});

function fixtures(audience: string) {
  const major: RecordValue = { id: 'major', audience, endDate: new Date(now.getTime() - 86400000), audienceCourseCodes: ['12'], audienceInvitations: [], subscriptions: [], certificateConfigs: [], events: [], eventGroups: [] };
  const group: RecordValue = { id: 'group', audience, audienceCourseCodes: ['12'], audienceInvitations: [], majorEventId: 'major', majorEvent: major, subscriptions: [], certificateConfigs: [], events: [] };
  const base = { audience: 'PUBLIC', audienceCourseCodes: [], audienceInvitations: [], majorEventId: 'major', majorEvent: major, eventGroupId: 'group', eventGroup: group, subscriptions: [], lecturers: [], certificateConfigs: [], attendances: [], endDate: new Date(now.getTime() - 86400000) };
  const attended = { ...base, id: 'attended', audience, audienceCourseCodes: ['12'], attendances: [{ personId: 'person-1', status: 'PRESENT' }] };
  const unrelated = { ...base, id: 'unrelated' };
  const future = { ...base, id: 'future', endDate: new Date(now.getTime() + 86400000), subscriptions: [{ personId: 'person-1', deletedAt: null }] };
  major.events = group.events = [attended, unrelated, future];
  major.eventGroups = [group];
  return { attended, unrelated, future, group, major };
}

// Interpret only Prisma's generic boolean/relation/scalar filter operators;
// the real query compiler is exercised separately by audience-prisma.extension.spec.
function matches(record: unknown, filter: unknown): boolean {
  if (!record || typeof record !== 'object' || !filter || typeof filter !== 'object') return false;
  const row = record as RecordValue;
  return Object.entries(filter).every(([key, expected]) => {
    if (key === 'AND') return (Array.isArray(expected) ? expected : [expected]).every((part) => matches(row, part));
    if (key === 'OR') return (Array.isArray(expected) ? expected : [expected]).some((part) => matches(row, part));
    const value = row[key];
    if (expected === null) return value == null;
    if (typeof expected !== 'object') return value === expected;
    const condition = expected as RecordValue;
    if ('is' in condition) return matches(value, condition['is']);
    if ('some' in condition) return Array.isArray(value) && value.some((item) => matches(item, condition['some']));
    if ('in' in condition) return Array.isArray(condition['in']) && condition['in'].includes(value);
    if ('has' in condition) return Array.isArray(value) && value.includes(condition['has']);
    if ('lte' in condition) return value instanceof Date && condition['lte'] instanceof Date && value <= condition['lte'];
    return matches(value, expected);
  });
}
