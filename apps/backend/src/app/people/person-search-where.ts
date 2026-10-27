import { Prisma } from '@prisma/client';

export function personSearchWhere(query: string | null | undefined): Prisma.PeopleWhereInput | undefined {
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) {
    return undefined;
  }

  return {
    OR: [
      { name: { contains: normalizedQuery, mode: 'insensitive' } },
      { email: { contains: normalizedQuery, mode: 'insensitive' } },
      { secondaryEmails: { has: normalizedQuery } },
      { phone: { contains: normalizedQuery, mode: 'insensitive' } },
      { identityDocument: { contains: normalizedQuery } },
      { academicId: { contains: normalizedQuery } },
    ],
  };
}

type PersonPresenceFilters = {
  hasUser?: boolean | null;
  hasEmail?: boolean | null;
  hasPhone?: boolean | null;
  hasIdentityDocument?: boolean | null;
  hasAcademicId?: boolean | null;
};

export function personPresenceConditions(filters: PersonPresenceFilters): Prisma.PeopleWhereInput[] {
  const conditions: Prisma.PeopleWhereInput[] = [];
  if (typeof filters.hasUser === 'boolean') {
    conditions.push({ userId: filters.hasUser ? { not: null } : null });
  }
  const fields = [
    ['email', filters.hasEmail],
    ['phone', filters.hasPhone],
    ['identityDocument', filters.hasIdentityDocument],
    ['academicId', filters.hasAcademicId],
  ] as const;
  for (const [field, present] of fields) {
    if (typeof present !== 'boolean') {
      continue;
    }
    // Legacy imports may store an empty string instead of null for missing data.
    conditions.push(
      present
        ? { AND: [{ [field]: { not: null } }, { [field]: { not: '' } }] }
        : { OR: [{ [field]: null }, { [field]: '' }] },
    );
  }
  return conditions;
}
