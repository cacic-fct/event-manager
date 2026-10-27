import { personPresenceConditions, personSearchWhere } from './person-search-where';

describe('personSearchWhere', () => {
  it('searches every supported participant identifier with one normalized query', () => {
    expect(personSearchWhere('  123456  ')).toEqual({
      OR: [
        { name: { contains: '123456', mode: 'insensitive' } },
        { email: { contains: '123456', mode: 'insensitive' } },
        { secondaryEmails: { has: '123456' } },
        { phone: { contains: '123456', mode: 'insensitive' } },
        { identityDocument: { contains: '123456' } },
        { academicId: { contains: '123456' } },
      ],
    });
  });

  it('does not add a predicate for an empty query', () => {
    expect(personSearchWhere('   ')).toBeUndefined();
  });
});

describe('personPresenceConditions', () => {
  it('ignores omitted and null filters', () => {
    expect(personPresenceConditions({})).toEqual([]);
    expect(personPresenceConditions({ hasUser: null, hasEmail: null })).toEqual([]);
  });

  it.each([true, false])('filters linked accounts with presence %s', (present) => {
    expect(personPresenceConditions({ hasUser: present })).toEqual([{ userId: present ? { not: null } : null }]);
  });

  it.each([
    ['hasEmail', 'email'],
    ['hasPhone', 'phone'],
    ['hasIdentityDocument', 'identityDocument'],
    ['hasAcademicId', 'academicId'],
  ])('treats null and empty %s values as missing', (filter, field) => {
    expect(personPresenceConditions({ [filter]: false })).toEqual([{ OR: [{ [field]: null }, { [field]: '' }] }]);
    expect(personPresenceConditions({ [filter]: true })).toEqual([
      { AND: [{ [field]: { not: null } }, { [field]: { not: '' } }] },
    ]);
  });
});
