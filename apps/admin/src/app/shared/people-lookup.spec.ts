import {
  buildDuplicatePeopleLookupFilters,
  buildPeopleCandidateLookupFilters,
  buildPeopleLookupFilters,
  buildPeopleSearchFilters,
} from './people-lookup';

describe('people lookup helpers', () => {
  it('builds paged search filters with optional workspace filters', () => {
    expect(
      buildPeopleSearchFilters('  ada  ', {
        skip: 50,
        take: 51,
        permissionGrantFilter: 'ACTIVE',
        hasLecturerProfile: true,
      }),
    ).toEqual({
      query: 'ada',
      skip: 50,
      take: 51,
      permissionGrantFilter: 'ACTIVE',
      hasLecturerProfile: true,
    });
  });

  it('maps explicit identifier lookup modes', () => {
    expect(buildPeopleLookupFilters('email', ' ada@example.com ', { take: 10 })).toEqual({
      email: 'ada@example.com',
      take: 10,
    });
    expect(buildPeopleLookupFilters('identityDocument', ' 12345678900 ', { take: 10 })).toEqual({
      identityDocument: '12345678900',
      take: 10,
    });
    expect(buildPeopleLookupFilters('query', ' Ada ', { take: 10 })).toEqual({ query: 'Ada', take: 10 });
    expect(buildPeopleLookupFilters('email', '   ', { take: 10 })).toBeNull();
  });

  it('expands free-text candidate searches to exact email and document lookups', () => {
    expect(buildPeopleCandidateLookupFilters(' 123.456.789-00 ', 10)).toEqual([
      { identityDocument: '12345678900', take: 10 },
      { identityDocument: '123.456.789-00', take: 10 },
      { phone: '12345678900', take: 10 },
      { phone: '123.456.789-00', take: 10 },
      { query: '123.456.789-00', take: 10 },
    ]);
    expect(buildPeopleCandidateLookupFilters('ada@example.com', 10)).toEqual([
      { email: 'ada@example.com', take: 10 },
      { query: 'ada@example.com', take: 10 },
    ]);
    expect(buildPeopleCandidateLookupFilters('user:account-1', 10)).toEqual([
      { userId: 'account-1', take: 10 },
      { query: 'user:account-1', take: 10 },
    ]);
  });

  it('trims duplicate-check filters while keeping omitted values undefined', () => {
    expect(
      buildDuplicatePeopleLookupFilters({
        name: ' Ada Lovelace ',
        email: ' ',
        identityDocument: ' 123456 ',
        take: 10,
      }),
    ).toEqual({
      query: 'Ada Lovelace',
      email: undefined,
      identityDocument: '123456',
      take: 10,
    });
  });
});
