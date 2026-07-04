import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { LgpdService } from './lgpd.service';

type UserFindManyArgs = {
  where?: {
    id?: { in: string[] };
    OR?: Array<{ email?: { equals: string } }>;
  };
};

type PeopleFindManyArgs = {
  where?: {
    id?: { in: string[] };
    OR?: Array<{
      id?: { in: string[] };
      userId?: { in: string[] };
      externalRef?: { in: string[] };
      mergedIntoId?: { in: string[] };
    }>;
  };
  select?: unknown;
};

export type LgpdServiceTestContext = ReturnType<typeof createLgpdServiceTestContext>;

export const users = [
  { id: 'old-user', email: 'old@example.com', name: 'Old User', createdAt: new Date('2025-01-01T00:00:00.000Z') },
  { id: 'new-user', email: 'new@example.com', name: 'New User', createdAt: new Date('2025-02-01T00:00:00.000Z') },
];

export const people = [
  {
    id: 'source-person',
    name: 'Source Person',
    email: 'old@example.com',
    secondaryEmails: [],
    phone: '+55 18 99999-0000',
    identityDocument: '529.982.247-25',
    isCPF: true,
    academicId: null,
    userId: 'old-user',
    externalRef: 'kc:old-user',
    mergedIntoId: 'target-person',
    deletedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    user: users[0],
    mergedFrom: [],
    mergedInto: null,
  },
  {
    id: 'target-person',
    name: 'Target Person',
    email: 'new@example.com',
    secondaryEmails: ['old@example.com'],
    phone: null,
    identityDocument: null,
    isCPF: true,
    academicId: null,
    userId: 'new-user',
    externalRef: 'kc:new-user',
    mergedIntoId: null,
    deletedAt: null,
    createdAt: new Date('2025-02-01T00:00:00.000Z'),
    user: users[1],
    mergedFrom: [],
    mergedInto: null,
  },
];

export function createLgpdServiceTestContext() {
  jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));

  const prisma = createPrismaMock();
  const s3 = createS3Mock();
  const typesenseSearch = createTypesenseSearchMock();
  const tx = createTransactionMock();
  const service = new LgpdService(
    prisma as unknown as PrismaService,
    s3 as unknown as S3Service,
    typesenseSearch as unknown as TypesenseSearchService,
  );

  prisma.user.findMany.mockImplementation(async (args: UserFindManyArgs) => findUsers(args));
  prisma.accountUserMerge.findMany.mockResolvedValue([{ oldUserId: 'old-user', newUserId: 'new-user' }]);
  prisma.externalAccountMergeOperation.findMany.mockResolvedValue([]);
  prisma.eventDraft.findMany.mockResolvedValue([]);
  prisma.people.findMany.mockImplementation(async (args: PeopleFindManyArgs) => findPeople(args));
  prisma.$queryRaw.mockResolvedValue([]);
  prisma.majorEventReceipt.findMany.mockResolvedValue([{ objectKey: 'receipts/old.png' }]);
  prisma.$transaction.mockImplementation(
    async (input: Promise<unknown>[] | ((transaction: typeof tx) => unknown)) =>
      Array.isArray(input) ? Promise.all(input) : input(tx),
  );

  return {
    prisma,
    s3,
    typesenseSearch,
    tx,
    service,
  };
}

export function restoreLgpdServiceTestContext() {
  jest.restoreAllMocks();
  jest.useRealTimers();
}

function findUsers(args: UserFindManyArgs) {
  if (args.where?.id?.in) {
    return users.filter((user) => args.where?.id?.in.includes(user.id));
  }

  const emails = new Set(args.where?.OR?.map((condition) => condition.email?.equals.toLowerCase()).filter(Boolean));
  if (emails.size > 0) {
    return users.filter((user) => emails.has(user.email.toLowerCase()));
  }

  return [];
}

function findPeople(args: PeopleFindManyArgs) {
  if (args.where?.id?.in) {
    return people.filter((person) => args.where?.id?.in.includes(person.id));
  }

  if (args.select && args.where?.OR) {
    return people.filter((person) =>
      args.where?.OR?.some((condition) => {
        if (condition.id?.in.includes(person.id)) {
          return true;
        }
        if (person.userId && condition.userId?.in.includes(person.userId)) {
          return true;
        }
        if (person.externalRef && condition.externalRef?.in.includes(person.externalRef)) {
          return true;
        }

        return person.mergedIntoId ? condition.mergedIntoId?.in.includes(person.mergedIntoId) : false;
      }),
    );
  }

  return [];
}

function createPrismaMock() {
  const findManyDelegate = () => ({ findMany: jest.fn().mockResolvedValue([]) });
  const softDeleteDelegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  });

  return {
    user: {
      findMany: jest.fn(),
    },
    people: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    accountUserMerge: {
      findMany: jest.fn(),
    },
    externalAccountMergeOperation: {
      findMany: jest.fn(),
    },
    eventDraft: findManyDelegate(),
    eventSubscription: softDeleteDelegate(),
    eventGroupSubscription: softDeleteDelegate(),
    majorEventSubscription: softDeleteDelegate(),
    majorEventSubscriptionEventSelection: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    eventAttendance: findManyDelegate(),
    offlineEventAttendanceSubmission: findManyDelegate(),
    eventLecturer: findManyDelegate(),
    certificate: softDeleteDelegate(),
    majorEventReceipt: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    majorEventReceiptValidationAction: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    peopleMergeOperation: findManyDelegate(),
    mergeCandidate: findManyDelegate(),
    auditLogEntry: findManyDelegate(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
}

function createTransactionMock() {
  const writeManyDelegate = (count = 0) => ({
    updateMany: jest.fn().mockResolvedValue({ count }),
    deleteMany: jest.fn().mockResolvedValue({ count }),
  });
  const deleteManyDelegate = (count = 0) => ({
    deleteMany: jest.fn().mockResolvedValue({ count }),
  });

  return {
    auditLogEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    eventDraft: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    certificate: writeManyDelegate(),
    majorEventSubscriptionEventSelection: writeManyDelegate(1),
    majorEventReceiptValidationAction: deleteManyDelegate(),
    majorEventReceipt: deleteManyDelegate(),
    eventSubscription: writeManyDelegate(1),
    eventGroupSubscription: writeManyDelegate(),
    majorEventSubscription: writeManyDelegate(),
    eventAttendance: deleteManyDelegate(),
    offlineEventAttendanceSubmission: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    eventLecturer: deleteManyDelegate(),
    externalAccountMergeOperation: deleteManyDelegate(),
    peopleMergeOperation: deleteManyDelegate(),
    mergeCandidate: deleteManyDelegate(),
    accountUserMerge: deleteManyDelegate(),
    eventManagerPermissionGrant: deleteManyDelegate(2),
    people: writeManyDelegate(2),
    user: deleteManyDelegate(2),
  };
}

function createS3Mock() {
  return {
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
}

function createTypesenseSearchMock() {
  return {
    upsertAuditLogEntry: jest.fn().mockResolvedValue(undefined),
  };
}
