import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { LgpdService } from './lgpd.service';

describe('LgpdService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let s3: ReturnType<typeof createS3Mock>;
  let tx: ReturnType<typeof createTransactionMock>;
  let service: LgpdService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
    prisma = createPrismaMock();
    s3 = createS3Mock();
    tx = createTransactionMock();
    service = new LgpdService(prisma as unknown as PrismaService, s3 as unknown as S3Service);

    prisma.user.findMany.mockImplementation(async (args: UserFindManyArgs) => findUsers(args));
    prisma.accountUserMerge.findMany.mockResolvedValue([{ oldUserId: 'old-user', newUserId: 'new-user' }]);
    prisma.externalAccountMergeOperation.findMany.mockResolvedValue([]);
    prisma.people.findMany.mockImplementation(async (args: PeopleFindManyArgs) => findPeople(args));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.majorEventReceipt.findMany.mockResolvedValue([{ objectKey: 'receipts/old.png' }]);
    prisma.$transaction.mockImplementation(
      async (input: Promise<unknown>[] | ((transaction: typeof tx) => unknown)) =>
        Array.isArray(input) ? Promise.all(input) : input(tx),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('hard deletes source and target identities when the request uses the old merged user id', async () => {
    await expect(
      service.hardDelete({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'erase-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleDeleted: 2,
      usersDeleted: 2,
      recordsDeleted: 3,
    });

    expect(tx.eventSubscription.deleteMany).toHaveBeenCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] } },
    });
    expect(tx.accountUserMerge.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { oldUserId: { in: ['old-user', 'new-user'] } },
          { newUserId: { in: ['old-user', 'new-user'] } },
        ],
      },
    });
    expect(tx.people.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['source-person', 'target-person'] } },
    });
    expect(tx.eventManagerPermissionGrant.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['old-user', 'new-user'] } },
    });
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-user', 'new-user'] } },
    });
    expect(s3.deleteFile).toHaveBeenCalledWith('receipts/old.png');
    expect(tx.majorEventReceiptValidationAction.deleteMany).toHaveBeenCalledWith({
      where: { subscription: { personId: { in: ['source-person', 'target-person'] } } },
    });
    expect(tx.majorEventReceipt.deleteMany).toHaveBeenCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] } },
    });
    expect(tx.majorEventReceiptValidationAction.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.majorEventSubscription.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.eventManagerPermissionGrant.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      s3.deleteFile.mock.invocationCallOrder[0],
    );
  });

  it('exports merged source and target identities when the request uses the final user id', async () => {
    prisma.eventSubscription.findMany.mockResolvedValue([{ id: 'moved-subscription' }]);
    prisma.majorEventReceipt.findMany.mockResolvedValueOnce([
      {
        id: 'receipt-1',
        personId: 'source-person',
        objectKey: 'receipts/receipt-1.avif',
        ocrText: 'Pagamento PIX de R$ 50,00',
      },
    ]);
    prisma.majorEventReceiptValidationAction.findMany.mockResolvedValueOnce([
      {
        id: 'action-1',
        subscriptionId: 'subscription-1',
        receiptId: 'receipt-1',
        nextRejectionReason: null,
      },
    ]);

    const result = await service.collectUserData({
      userId: 'new-user',
      email: 'old@example.com',
    });

    expect(result.metadata).toEqual(
      expect.objectContaining({
        generatedAt: '2026-05-21T12:00:00.000Z',
        resolvedUserIds: expect.arrayContaining(['old-user', 'new-user']),
        personIds: ['source-person', 'target-person'],
      }),
    );
    expect(result.accountUsers).toEqual({
      records: expect.arrayContaining([
        expect.objectContaining({ id: 'old-user', email: 'old@example.com' }),
        expect.objectContaining({ id: 'new-user', email: 'new@example.com' }),
      ]),
    });
    expect(result.people).toEqual({
      records: expect.arrayContaining([
        expect.objectContaining({ id: 'source-person', mergedIntoId: 'target-person' }),
        expect.objectContaining({ id: 'target-person' }),
      ]),
    });
    expect(result.subscriptions).toEqual(
      expect.objectContaining({
        eventSubscriptions: [{ id: 'moved-subscription' }],
      }),
    );
    expect(result.mergeHistory).toEqual(
      expect.objectContaining({
        accountUserMerges: [{ oldUserId: 'old-user', newUserId: 'new-user' }],
      }),
    );
    expect(result.receipts).toEqual({
      majorEventReceipts: [
        {
          id: 'receipt-1',
          personId: 'source-person',
          objectKey: 'receipts/receipt-1.avif',
          ocrText: 'Pagamento PIX de R$ 50,00',
        },
      ],
      receiptValidationActions: [
        {
          id: 'action-1',
          subscriptionId: 'subscription-1',
          receiptId: 'receipt-1',
          nextRejectionReason: null,
        },
      ],
    });
    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: { in: ['source-person', 'target-person'] } },
      }),
    );
    expect(prisma.majorEventReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: { in: ['source-person', 'target-person'] } },
        include: expect.objectContaining({
          validationActions: true,
        }),
      }),
    );
    expect(prisma.majorEventReceiptValidationAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscription: { personId: { in: ['source-person', 'target-person'] } } },
      }),
    );
  });

  it('removes receipt storage and database rows when scheduling deletion', async () => {
    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 7,
    });

    expect(s3.deleteFile).toHaveBeenCalledWith('receipts/old.png');
    expect(prisma.majorEventReceiptValidationAction.deleteMany).toHaveBeenCalledWith({
      where: { subscription: { personId: { in: ['source-person', 'target-person'] } } },
    });
    expect(prisma.majorEventReceipt.deleteMany).toHaveBeenCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] } },
    });
    expect(prisma.majorEventReceiptValidationAction.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.majorEventReceipt.deleteMany.mock.invocationCallOrder[0],
    );
    expect(prisma.majorEventReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.majorEventSubscription.updateMany.mock.invocationCallOrder[0],
    );
    expect(prisma.majorEventReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      s3.deleteFile.mock.invocationCallOrder[0],
    );
  });

  it('continues deleting receipt objects after an S3 cleanup failure', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma.majorEventReceipt.findMany.mockResolvedValueOnce([
      { objectKey: 'receipts/old.png' },
      { objectKey: 'receipts/broken.png' },
      { objectKey: 'receipts/new.png' },
    ]);
    s3.deleteFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('s3 unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 7,
    });

    expect(s3.deleteFile).toHaveBeenNthCalledWith(1, 'receipts/old.png');
    expect(s3.deleteFile).toHaveBeenNthCalledWith(2, 'receipts/broken.png');
    expect(s3.deleteFile).toHaveBeenNthCalledWith(3, 'receipts/new.png');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('receipts/broken.png'));
  });
});

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

const users = [
  { id: 'old-user', email: 'old@example.com', name: 'Old User', createdAt: new Date('2025-01-01T00:00:00.000Z') },
  { id: 'new-user', email: 'new@example.com', name: 'New User', createdAt: new Date('2025-02-01T00:00:00.000Z') },
];

const people = [
  {
    id: 'source-person',
    name: 'Source Person',
    email: 'old@example.com',
    secondaryEmails: [],
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
    eventSubscription: softDeleteDelegate(),
    eventGroupSubscription: softDeleteDelegate(),
    majorEventSubscription: softDeleteDelegate(),
    majorEventSubscriptionEventSelection: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    eventAttendance: findManyDelegate(),
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
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
}

function createTransactionMock() {
  const deleteManyDelegate = (count = 0) => ({
    deleteMany: jest.fn().mockResolvedValue({ count }),
  });

  return {
    certificate: deleteManyDelegate(),
    majorEventSubscriptionEventSelection: deleteManyDelegate(),
    majorEventReceiptValidationAction: deleteManyDelegate(),
    majorEventReceipt: deleteManyDelegate(),
    eventSubscription: deleteManyDelegate(1),
    eventGroupSubscription: deleteManyDelegate(),
    majorEventSubscription: deleteManyDelegate(),
    eventAttendance: deleteManyDelegate(),
    eventLecturer: deleteManyDelegate(),
    externalAccountMergeOperation: deleteManyDelegate(),
    peopleMergeOperation: deleteManyDelegate(),
    mergeCandidate: deleteManyDelegate(),
    accountUserMerge: deleteManyDelegate(),
    eventManagerPermissionGrant: deleteManyDelegate(2),
    people: deleteManyDelegate(2),
    user: deleteManyDelegate(2),
  };
}

function createS3Mock() {
  return {
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
}
