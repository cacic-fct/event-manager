import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { CertificateIssuingService } from '../certificate/certificate-issuing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountMergeService } from './account-merge.service';
import { AccountMergeScoreRequestDto } from './dto';

describe('AccountMergeService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AccountMergeService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
    prisma = createPrismaMock();
    service = new AccountMergeService(
      prisma as unknown as PrismaService,
      {} as unknown as CertificateIssuingService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('scores trimmed unique account merge candidates from local user and people data', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'ADMIN',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    prisma.people.findMany.mockResolvedValue([
      {
        id: 'person-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        secondaryEmails: ['ada.secondary@example.com', 'ADA@EXAMPLE.COM'],
        phone: '+55 18 99999-0000',
        identityDocument: '123',
        academicId: 'RA123',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        _count: {
          attendances: 2,
          eventSubscriptions: 3,
          eventGroupSubscriptions: 1,
          majorEventSubscriptions: 2,
          lectures: 4,
          certificates: 10,
        },
      },
    ]);
    prisma.majorEventSubscription.count.mockResolvedValue(5);

    await expect(
      service.scoreAccountMergeCandidates({
        userIds: [' old-user ', 'old-user'],
      }),
    ).resolves.toEqual({
      scores: {
        'old-user': 362,
      },
    });

    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ userId: 'old-user' }, { externalRef: 'kc:old-user' }],
        }),
      }),
    );
  });

  it('rejects malformed score requests and returns zero for unknown users', async () => {
    const malformedRequest = { userIds: 'old-user' } as unknown as AccountMergeScoreRequestDto;

    await expect(service.scoreAccountMergeCandidates(malformedRequest)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.scoreAccountMergeCandidates({ userIds: [''] })).rejects.toBeInstanceOf(BadRequestException);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.people.findMany.mockResolvedValue([]);

    await expect(service.scoreAccountMergeCandidates({ userIds: ['missing-user'] })).resolves.toEqual({
      scores: {
        'missing-user': 0,
      },
    });
    expect(prisma.majorEventSubscription.count).not.toHaveBeenCalled();
  });

  it('resolves final user ids through merge chains and stops on cycles', async () => {
    prisma.accountUserMerge.findUnique
      .mockResolvedValueOnce({ oldUserId: 'user-a', newUserId: 'user-b' })
      .mockResolvedValueOnce({ oldUserId: 'user-b', newUserId: 'user-c' })
      .mockResolvedValueOnce(null);

    await expect(service.resolveFinalUserId(' user-a ')).resolves.toBe('user-c');
    await expect(service.resolveFinalUserId('  ')).resolves.toBeNull();

    prisma.accountUserMerge.findUnique
      .mockResolvedValueOnce({ oldUserId: 'cycle-a', newUserId: 'cycle-b' })
      .mockResolvedValueOnce({ oldUserId: 'cycle-b', newUserId: 'cycle-a' });

    await expect(service.resolveFinalUserId('cycle-a')).resolves.toBe('cycle-a');
  });

  it('acknowledges an already applied matching event idempotently', async () => {
    const tx = createTransactionMock();
    tx.externalAccountMergeOperation.findUnique.mockResolvedValue({
      status: 'APPLIED',
      type: 'account.merged',
      oldUserId: 'old-user',
      newUserId: 'new-user',
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(service.acknowledgeAccountMerge(notification(), 'actor-1')).resolves.toEqual({
      eventId: 'event-1',
      type: 'account.merged',
      oldUserId: 'old-user',
      newUserId: 'new-user',
      status: 'success',
    });

    expect(tx.accountUserMerge.create).not.toHaveBeenCalled();
  });

  it('rejects an already applied event with different merge data and records the failure', async () => {
    const tx = createTransactionMock();
    tx.externalAccountMergeOperation.findUnique.mockResolvedValue({
      status: 'APPLIED',
      type: 'account.merged',
      oldUserId: 'other-user',
      newUserId: 'new-user',
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    prisma.externalAccountMergeOperation.findUnique.mockResolvedValue({ status: 'FAILED' });

    await expect(service.acknowledgeAccountMerge(notification(), 'actor-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(prisma.externalAccountMergeOperation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('already registered with different account merge data'),
        }),
      }),
    );
  });

  it('creates account mapping and reassigns a source person when there is no target person', async () => {
    const tx = createTransactionMock();
    tx.people.findMany.mockResolvedValueOnce([person({ id: 'source-person', userId: 'old-user' })]);
    tx.people.findMany.mockResolvedValueOnce([]);
    tx.user.findUnique.mockResolvedValue(null);
    tx.people.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(service.acknowledgeAccountMerge(notification(), 'actor-1')).resolves.toEqual(
      expect.objectContaining({ status: 'success' }),
    );

    expect(tx.accountUserMerge.create).toHaveBeenCalledWith({
      data: {
        oldUserId: 'old-user',
        newUserId: 'new-user',
      },
    });
    expect(tx.people.update).toHaveBeenCalledWith({
      where: { id: 'source-person' },
      data: {
        userId: null,
        externalRef: 'kc:new-user',
        updatedById: 'actor-1',
      },
    });
    expect(tx.externalAccountMergeOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: 'PERSON_REASSIGNED',
        }),
      }),
    );
  });

  it('merges two local people records and moves source relations to the target', async () => {
    const tx = createTransactionMock();
    tx.people.findMany.mockResolvedValueOnce([
      person({
        id: 'source-person',
        email: 'source@example.com',
        secondaryEmails: ['alt@example.com'],
        phone: '123',
        identityDocument: '456',
        academicId: 'RA456',
        userId: 'old-user',
      }),
    ]);
    tx.people.findMany.mockResolvedValueOnce([
      person({
        id: 'target-person',
        email: 'target@example.com',
        secondaryEmails: [],
        phone: null,
        identityDocument: null,
        academicId: null,
        userId: 'new-user',
      }),
    ]);
    tx.user.findUnique.mockResolvedValue({ id: 'new-user' });
    tx.people.findUnique.mockResolvedValue(null);
    tx.eventAttendance.findMany
      .mockResolvedValueOnce([
        {
          eventId: 'event-1',
          attendedAt: new Date('2026-01-01T12:00:00.000Z'),
          createdAt: new Date('2026-01-01T12:10:00.000Z'),
          createdById: 'collector-1',
          createdByMethod: 'MANUAL',
          category: 'ATTENDEE',
        },
      ])
      .mockResolvedValueOnce([]);
    tx.eventLecturer.findMany
      .mockResolvedValueOnce([
        {
          eventId: 'event-2',
          createdAt: new Date('2026-01-02T12:00:00.000Z'),
          createdById: 'admin-1',
        },
      ])
      .mockResolvedValueOnce([]);
    tx.eventSubscription.findMany.mockResolvedValue([{ id: 'event-subscription-1' }]);
    tx.eventGroupSubscription.findMany.mockResolvedValue([]);
    tx.majorEventSubscription.findMany.mockResolvedValue([{ id: 'major-subscription-1' }]);
    tx.peopleMergeOperation.create.mockResolvedValue({ id: 'merge-operation-1' });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(service.acknowledgeAccountMerge(notification(), 'actor-1')).resolves.toEqual(
      expect.objectContaining({ status: 'success' }),
    );

    expect(tx.eventAttendance.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ personId: 'target-person', eventId: 'event-1' })],
        skipDuplicates: true,
      }),
    );
    expect(tx.eventSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['event-subscription-1'] } },
      data: { personId: 'target-person' },
    });
    expect(tx.peopleMergeOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetPersonId: 'target-person',
          sourcePersonId: 'source-person',
          movedRelations: expect.objectContaining({
            insertedAttendanceEventIds: ['event-1'],
            insertedLectureEventIds: ['event-2'],
            movedMajorEventSubscriptionIds: ['major-subscription-1'],
          }),
        }),
      }),
    );
    expect(tx.externalAccountMergeOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: 'PEOPLE_MERGED',
          peopleMergeOperationId: 'merge-operation-1',
        }),
      }),
    );
  });

  it('records conflicting account mappings as failed acknowledgements', async () => {
    const tx = createTransactionMock();
    tx.accountUserMerge.findUnique.mockResolvedValue({
      oldUserId: 'old-user',
      newUserId: 'different-user',
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    prisma.externalAccountMergeOperation.findUnique.mockResolvedValue(null);

    await expect(service.acknowledgeAccountMerge(notification(), null)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(prisma.externalAccountMergeOperation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'FAILED',
          createdById: undefined,
          updatedById: undefined,
          errorMessage: expect.stringContaining('already merged into different-user'),
        }),
      }),
    );
  });

  it('rejects invalid account merge notifications before opening a transaction', async () => {
    await expect(service.acknowledgeAccountMerge({ ...notification(), type: 'unknown' }, 'actor-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.acknowledgeAccountMerge({ ...notification(), oldUserId: 'same-user', newUserId: 'same-user' }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.acknowledgeAccountMerge({ ...notification(), occurredAt: 'not-a-date' }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
    },
    people: {
      findMany: jest.fn(),
    },
    majorEventSubscription: {
      count: jest.fn(),
    },
    accountUserMerge: {
      findUnique: jest.fn(),
    },
    externalAccountMergeOperation: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function createTransactionMock() {
  const delegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  });

  return {
    externalAccountMergeOperation: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    accountUserMerge: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    people: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    eventLecturer: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    eventSubscription: delegate(),
    eventGroupSubscription: delegate(),
    majorEventSubscription: delegate(),
    peopleMergeOperation: {
      create: jest.fn(),
    },
  };
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'event-1',
    type: 'account.merged',
    oldUserId: 'old-user',
    newUserId: 'new-user',
    occurredAt: '2026-05-21T12:00:00.000Z',
    ...overrides,
  };
}

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: 'person-1',
    name: 'Person',
    email: 'person@example.com',
    secondaryEmails: [],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    externalRef: null,
    mergedIntoId: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}
