import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DataSubjectResolution, LgpdUserLookup } from './lgpd-records';

export async function resolveDataSubject(prisma: PrismaService, input: LgpdUserLookup): Promise<DataSubjectResolution> {
  const userIds = new Set<string>();
  const personIds = new Set<string>();
  const emails = new Set<string>();
  // Account ids, recorded account merges, and person foreign keys are the only
  // identity edges. The request email is metadata from the caller and must not
  // turn a shared contact address into an export or deletion edge.
  const initialUserId = input.userId.trim();

  if (initialUserId) {
    userIds.add(initialUserId);
  }

  let changed = true;
  while (changed) {
    changed = false;
    changed = (await expandUsers(prisma, userIds, emails)) || changed;
    changed = (await expandAccountMerges(prisma, userIds)) || changed;
    changed = (await expandPeople(prisma, userIds, personIds)) || changed;
  }

  const people = await findPeopleByIds(prisma, [...personIds]);
  const safeEmails = await keepUnambiguousUserEmailMetadata(prisma, emails, userIds);

  return {
    userIds: [...userIds],
    personIds: people.map((person) => person.id),
    emails: safeEmails,
    people,
  };
}

async function expandUsers(prisma: PrismaService, userIds: Set<string>, emails: Set<string>): Promise<boolean> {
  let changed = false;

  if (userIds.size > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, email: true },
    });

    for (const user of users) {
      changed = add(userIds, user.id) || changed;
      // These emails are used only for legacy actor metadata after we have
      // resolved the authoritative account graph.
      const email = normalizeEmail(user.email);
      if (email) {
        changed = add(emails, email) || changed;
      }
    }
  }

  return changed;
}

async function expandAccountMerges(prisma: PrismaService, userIds: Set<string>): Promise<boolean> {
  if (userIds.size === 0) {
    return false;
  }

  let changed = false;
  const ids = [...userIds];
  const [accountUserMerges, externalAccountMergeOperations] = await Promise.all([
    prisma.accountUserMerge.findMany({
      where: { OR: [{ oldUserId: { in: ids } }, { newUserId: { in: ids } }] },
      select: { oldUserId: true, newUserId: true },
    }),
    prisma.externalAccountMergeOperation.findMany({
      where: {
        status: 'APPLIED',
        OR: [{ oldUserId: { in: ids } }, { newUserId: { in: ids } }],
      },
      select: { oldUserId: true, newUserId: true },
    }),
  ]);

  for (const merge of [...accountUserMerges, ...externalAccountMergeOperations]) {
    changed = add(userIds, merge.oldUserId) || changed;
    changed = add(userIds, merge.newUserId) || changed;
  }

  return changed;
}

async function expandPeople(
  prisma: PrismaService,
  userIds: Set<string>,
  personIds: Set<string>,
): Promise<boolean> {
  const where = peopleResolutionWhere(userIds, personIds);
  if (!where) {
    return false;
  }

  let changed = false;
  const people = await prisma.people.findMany({
    where,
    select: {
      id: true,
      userId: true,
      externalRef: true,
      mergedIntoId: true,
    },
  });

  for (const person of people) {
    changed = add(personIds, person.id) || changed;
    if (person.mergedIntoId) {
      changed = add(personIds, person.mergedIntoId) || changed;
    }
    if (person.userId) {
      changed = add(userIds, person.userId) || changed;
    }

    const externalUserId = fromKeycloakExternalRef(person.externalRef);
    if (externalUserId) {
      changed = add(userIds, externalUserId) || changed;
    }

  }

  return changed;
}

function peopleResolutionWhere(userIds: Set<string>, personIds: Set<string>): Prisma.PeopleWhereInput | null {
  const conditions: Prisma.PeopleWhereInput[] = [];
  const ids = [...userIds];
  const people = [...personIds];

  if (ids.length > 0) {
    conditions.push({ userId: { in: ids } });
    conditions.push({ externalRef: { in: ids.map((userId) => toKeycloakExternalRef(userId)) } });
  }

  if (people.length > 0) {
    conditions.push({ id: { in: people } });
    conditions.push({ mergedIntoId: { in: people } });
  }

  return conditions.length > 0 ? { OR: conditions } : null;
}

async function findPeopleByIds(prisma: PrismaService, personIds: string[]) {
  if (personIds.length === 0) {
    return [];
  }

  return prisma.people.findMany({
    where: {
      id: { in: personIds },
    },
    include: { user: true, mergedFrom: true, mergedInto: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function keepUnambiguousUserEmailMetadata(
  prisma: PrismaService,
  emails: Set<string>,
  userIds: Set<string>,
): Promise<string[]> {
  const candidates = [...emails];
  if (candidates.length === 0) {
    return [];
  }

  const matchingUsers = await prisma.user.findMany({
    where: {
      OR: candidates.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
    },
    select: { id: true, email: true },
  });
  const ambiguous = new Set<string>();

  for (const user of matchingUsers) {
    const email = normalizeEmail(user.email);
    if (email && !userIds.has(user.id)) {
      ambiguous.add(email);
    }
  }
  return candidates.filter((email) => !ambiguous.has(email));
}

function normalizeEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function toKeycloakExternalRef(userId: string): string {
  return `kc:${userId}`;
}

function fromKeycloakExternalRef(externalRef?: string | null): string | null {
  const prefix = 'kc:';
  if (!externalRef?.startsWith(prefix)) {
    return null;
  }

  return externalRef.slice(prefix.length).trim() || null;
}

function add(values: Set<string>, value: string): boolean {
  if (values.has(value)) {
    return false;
  }

  values.add(value);
  return true;
}
