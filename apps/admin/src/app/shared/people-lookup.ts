import type { PeopleFilters } from '../graphql/people-api.service';

export type PeopleLookupIdentifierType = 'query' | 'userId' | 'identityDocument' | 'email' | 'phone';

type PeopleLookupOptions = Pick<PeopleFilters, 'skip' | 'take'>;
type PeopleSearchOptions = Omit<PeopleFilters, 'query' | 'userId' | 'email' | 'phone' | 'identityDocument'>;

export function buildPeopleSearchFilters(query: string, options: PeopleSearchOptions = {}): PeopleFilters {
  const normalizedQuery = query.trim();
  return {
    ...(normalizedQuery ? { query: normalizedQuery } : {}),
    ...options,
  };
}

export function buildPeopleLookupFilters(
  identifierType: string,
  identifierValue: string,
  options: PeopleLookupOptions = {},
): PeopleFilters | null {
  const identifier = identifierValue.trim();
  if (!identifier) {
    return null;
  }

  switch (identifierType) {
    case 'userId':
      return { userId: identifier, ...options };
    case 'identityDocument':
      return { identityDocument: identifier, ...options };
    case 'email':
      return { email: identifier, ...options };
    case 'phone':
      return { phone: identifier, ...options };
    case 'query':
    default:
      return { query: identifier, ...options };
  }
}

export function buildPeopleCandidateLookupFilters(query: string, take: number): PeopleFilters[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const searches: PeopleFilters[] = [{ query: normalizedQuery, take }];
  const identityDocumentDigits = normalizedQuery.replace(/\D/g, '');

  if (normalizedQuery.includes('@')) {
    searches.unshift({ email: normalizedQuery, take });
  }

  if (identityDocumentDigits.length >= 8) {
    searches.unshift({ identityDocument: normalizedQuery, take });
    if (identityDocumentDigits !== normalizedQuery) {
      searches.unshift({ identityDocument: identityDocumentDigits, take });
    }
  }

  return searches;
}

export function buildDuplicatePeopleLookupFilters(input: {
  name: string;
  email?: string | null;
  identityDocument?: string | null;
  take: number;
}): PeopleFilters {
  const name = input.name.trim();
  const email = input.email?.trim();
  const identityDocument = input.identityDocument?.trim();

  return {
    query: name || undefined,
    email: email || undefined,
    identityDocument: identityDocument || undefined,
    take: input.take,
  };
}
