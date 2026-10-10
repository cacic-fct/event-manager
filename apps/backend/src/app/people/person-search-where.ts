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
