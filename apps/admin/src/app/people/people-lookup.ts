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

  const searches: PeopleFilters[] = [];
  const addSearch = (filters: PeopleFilters) => {
    const key = JSON.stringify(filters);
    if (!searches.some((search) => JSON.stringify(search) === key)) {
      searches.push(filters);
    }
  };
  const userId = parseUserAztecIdentifier(normalizedQuery);
  const identityDocumentDigits = normalizedQuery.replace(/\D/g, '');

  if (userId) {
    addSearch({ userId, take });
  }

  if (normalizedQuery.includes('@')) {
    addSearch({ email: normalizedQuery, take });
  }

  if (identityDocumentDigits.length >= 8) {
    if (identityDocumentDigits !== normalizedQuery) {
      addSearch({ identityDocument: identityDocumentDigits, take });
    }
    addSearch({ identityDocument: normalizedQuery, take });
  }

  if (identityDocumentDigits.length >= 10) {
    if (identityDocumentDigits !== normalizedQuery) {
      addSearch({ phone: identityDocumentDigits, take });
    }
    addSearch({ phone: normalizedQuery, take });
  }

  addSearch({ query: normalizedQuery, take });

  return searches;
}

export function parseUserAztecIdentifier(query: string): string | null {
  if (!query.startsWith('user:')) {
    return null;
  }

  const userId = query.slice('user:'.length).trim();
  return userId && !userId.includes(':') ? userId : null;
}

export function buildDuplicatePeopleLookupFilters(input: {
  email?: string | null;
  identityDocument?: string | null;
  take: number;
}): PeopleFilters | null {
  const email = input.email?.trim();
  const identityDocument = input.identityDocument?.trim();

  if (!email && !identityDocument) {
    return null;
  }

  return {
    email: email || undefined,
    identityDocument: identityDocument || undefined,
    take: input.take,
  };
}
