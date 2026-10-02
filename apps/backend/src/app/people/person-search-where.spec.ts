import { personSearchWhere } from './person-search-where';

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
