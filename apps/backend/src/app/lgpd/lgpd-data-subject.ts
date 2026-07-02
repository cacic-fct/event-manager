import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DataSubjectResolution, LgpdUserLookup } from './lgpd-records';

export async function resolveDataSubject(
  prisma: PrismaService,
  input: LgpdUserLookup,
): Promise<DataSubjectResolution> {
  const userIds = new Set<string>();
  const personIds = new Set<string>();
  const emails = new Set<string>();
  const queriedEmails = new Set<string>();
  const initialUserId = input.userId.trim();
  const initialEmail = normalizeEmail(input.email);

  if (initialUserId) {
    userIds.add(initialUserId);
  }
  if (initialEmail) {
    emails.add(initialEmail);
  }

  let changed = true;
  while (changed) {
    changed = false;
    changed = (await expandUsers(prisma, userIds, emails)) || changed;
    changed = (await expandAccountMerges(prisma, userIds)) || changed;
    changed = (await expandPeopleByEmail(prisma, personIds, emails, queriedEmails)) || changed;
    changed = (await expandPeople(prisma, userIds, personIds, emails)) || changed;
  }

  const people = await findPeopleByIds(prisma, [...personIds]);

  return {
    userIds: [...userIds],
    personIds: people.map((person) => person.id),
    emails: [...emails],
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
      const email = normalizeEmail(user.email);
      if (email) {
        changed = add(emails, email) || changed;
      }
    }
  }

  if (emails.size > 0) {
    const users = await prisma.user.findMany({
      where: {
        OR: [...emails].map((email) => ({
          email: {
            equals: email,
            mode: 'insensitive' as const,
          },
        })),
      },
      select: { id: true, email: true },
    });

    for (const user of users) {
      changed = add(userIds, user.id) || changed;
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

async function expandPeopleByEmail(
  prisma: PrismaService,
  personIds: Set<string>,
  emails: Set<string>,
  queriedEmails: Set<string>,
): Promise<boolean> {
  let changed = false;

  for (const email of emails) {
    if (queriedEmails.has(email)) {
      continue;
    }

    queriedEmails.add(email);
    const people = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM people
      WHERE lower(email) = ${email}
        OR EXISTS (
          SELECT 1
          FROM unnest("secondaryEmails") AS secondary_email(email)
          WHERE lower(secondary_email.email) = ${email}
        )
    `;

    for (const person of people) {
      changed = add(personIds, person.id) || changed;
    }
  }

  return changed;
}

async function expandPeople(
  prisma: PrismaService,
  userIds: Set<string>,
  personIds: Set<string>,
  emails: Set<string>,
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
      email: true,
      secondaryEmails: true,
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

    for (const email of [person.email, ...person.secondaryEmails]) {
      const normalizedEmail = normalizeEmail(email);
      if (normalizedEmail) {
        changed = add(emails, normalizedEmail) || changed;
      }
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
