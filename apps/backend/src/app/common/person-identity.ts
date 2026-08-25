import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PersonIdentityMatch = {
  id: string;
  mergedIntoId: string | null;
};

export function normalizeIdentityDocumentForLookup(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase();
}

export async function findPeopleByCanonicalIdentityDocument(
  prisma: PrismaService,
  value: string,
): Promise<PersonIdentityMatch[]> {
  const normalizedValue = normalizeIdentityDocumentForLookup(value);
  if (!normalizedValue || typeof prisma.$queryRaw !== 'function') {
    return [];
  }

  return prisma.$queryRaw<PersonIdentityMatch[]>`
    SELECT id, "mergedIntoId"
    FROM people
    WHERE "deletedAt" IS NULL
      AND regexp_replace(upper(coalesce("identityDocument", '')), '[^[:alnum:]]', '', 'g') = ${normalizedValue}
  `;
}

export function identityDocumentWhere(value: string): Prisma.PeopleWhereInput {
  const digits = value.replace(/\D/g, '');
  return {
    identityDocument: {
      in: [...new Set([value, digits].filter(Boolean))],
    },
  };
}
