import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MergeCandidateOperationsService } from './operations.service';

describe('MergeCandidateOperationsService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let certificates: { refreshIssuedCertificatesAfterPeopleMerge: jest.Mock };
  let service: MergeCandidateOperationsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
    prisma = createPrisma();
    certificates = {
      refreshIssuedCertificatesAfterPeopleMerge: jest.fn().mockResolvedValue(undefined),
    };
    service = new MergeCandidateOperationsService(prisma as never, certificates as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('scans people and creates or refreshes pending candidates by match priority', async () => {
    prisma.mergeCandidate.updateMany.mockResolvedValue({ count: 1 });
    prisma.people.findMany.mockResolvedValue([
      person({ id: 'person-b', name: 'Maria Souza', email: 'same@example.com', identityDocument: '529.982.247-25' }),
      person({ id: 'person-a', name: 'Maria Souza', email: 'SAME@example.com', identityDocument: '52998224725' }),
      person({ id: 'person-c', name: 'Grace Hopper', email: 'grace@example.com' }),
      person({ id: 'person-d', name: 'Grace Hopper', email: null }),
    ]);
    prisma.mergeCandidate.findMany.mockResolvedValue([
      {
        id: 'candidate-existing',
        pairKey: 'person-c:person-d',
        status: 'STALE',
      },
    ]);

    await expect(service.scanMergeCandidates('actor-1')).resolves.toBe(3);

    expect(prisma.mergeCandidate.create).toHaveBeenCalledWith({
      data: {
        personAId: 'person-a',
        personBId: 'person-b',
        pairKey: 'person-a:person-b',
        score: 1,
        matchMethod: 'CPF',
        matchValue: '52998224725',
        status: 'PENDING',
        createdById: 'actor-1',
      },
    });
    expect(prisma.mergeCandidate.update).toHaveBeenCalledWith({
      where: { id: 'candidate-existing' },
      data: expect.objectContaining({
        personAId: 'person-c',
        personBId: 'person-d',
        status: 'PENDING',
        updatedById: 'actor-1',
      }),
    });
  });

  it('returns zero when a scan finds no matches even if stale candidates were marked', async () => {
    prisma.mergeCandidate.updateMany.mockResolvedValue({ count: 2 });
    prisma.people.findMany.mockResolvedValue([person({ id: 'person-a', name: 'Ada', email: 'ada@example.com' })]);

    await expect(service.scanMergeCandidates(null)).resolves.toBe(0);
    expect(prisma.mergeCandidate.findMany).not.toHaveBeenCalled();
  });

  it('merges people, migrates selected fields, records snapshots, and refreshes certificates', async () => {
    const tx = createTransaction();
    const target = person({
      id: 'target-person',
      name: 'Target',
      email: 'target@example.com',
      secondaryEmails: [],
    });
    const source = person({
      id: 'source-person',
      name: ' Source ',
      email: 'source@example.com',
      identityDocument: '52998224725',
    });
    const updatedCandidate = candidate({
      status: 'MERGED',
      personAId: target.id,
      personBId: source.id,
    });

    tx.mergeCandidate.findUnique.mockResolvedValue(
      candidate({
        status: 'PENDING',
        personAId: target.id,
        personBId: source.id,
        personA: target,
        personB: source,
      }),
    );
    tx.people.findUnique.mockResolvedValueOnce(target).mockResolvedValueOnce(source);
    tx.mergeCandidate.update.mockResolvedValue(updatedCandidate);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      service.mergeCandidatePeople(
        {
          candidateId: 'candidate-1',
          targetPersonId: target.id,
          migrateFields: ['NAME', 'EMAIL', 'EMAIL'],
        },
        'actor-1',
      ),
    ).resolves.toBe(updatedCandidate);

    expect(tx.people.update).toHaveBeenCalledWith({
      where: { id: source.id },
      data: {
        mergedIntoId: target.id,
        deletedAt: new Date('2026-05-21T12:00:00.000Z'),
        updatedById: 'actor-1',
      },
    });
    expect(tx.people.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: {
        secondaryEmails: ['target@example.com'],
        name: 'Source',
        email: 'source@example.com',
        updatedById: 'actor-1',
      },
    });
    expect(tx.peopleMergeOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetPersonId: target.id,
        sourcePersonId: source.id,
        mergeCandidateId: 'candidate-1',
        migratedFields: ['NAME', 'EMAIL'],
        targetSnapshot: expect.objectContaining({ name: 'Target' }),
        sourceSnapshot: expect.objectContaining({ name: ' Source ' }),
        movedRelations: expect.objectContaining({
          sourceAttendances: [],
          sourceLectures: [],
        }),
        createdById: 'actor-1',
      }),
    });
    expect(certificates.refreshIssuedCertificatesAfterPeopleMerge).toHaveBeenCalledWith(
      target.id,
      source.id,
      'actor-1',
    );
  });

  it('validates merge candidate state and selected target', async () => {
    const tx = createTransaction();
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.mergeCandidate.findUnique.mockResolvedValue(null);

    await expect(
      service.mergeCandidatePeople({ candidateId: 'missing', targetPersonId: 'person-a', migrateFields: [] }, null),
    ).rejects.toBeInstanceOf(NotFoundException);

    tx.mergeCandidate.findUnique.mockResolvedValue(candidate({ status: 'MERGED' }));
    await expect(
      service.mergeCandidatePeople({ candidateId: 'candidate-1', targetPersonId: 'person-a', migrateFields: [] }, null),
    ).rejects.toBeInstanceOf(ConflictException);

    tx.mergeCandidate.findUnique.mockResolvedValue(candidate({ status: 'PENDING' }));
    await expect(
      service.mergeCandidatePeople(
        { candidateId: 'candidate-1', targetPersonId: 'person-outside', migrateFields: [] },
        null,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rolls back a merge operation and restores moved relations plus snapshots', async () => {
    const tx = createTransaction();
    const target = person({ id: 'target-person' });
    const source = person({ id: 'source-person', mergedIntoId: target.id, deletedAt: new Date() });
    const operation = {
      id: 'operation-1',
      targetPersonId: target.id,
      sourcePersonId: source.id,
      targetSnapshot: snapshot({ name: 'Target Before' }),
      sourceSnapshot: snapshot({ name: 'Source Before' }),
      movedRelations: {
        sourceAttendances: [
          {
            eventId: 'event-1',
            attendedAt: '2026-05-21T10:00:00.000Z',
            createdAt: '2026-05-21T09:00:00.000Z',
            createdById: 'actor-1',
          },
        ],
        sourceLectures: [
          {
            eventId: 'lecture-1',
            createdAt: '2026-05-21T08:00:00.000Z',
            createdById: null,
          },
        ],
        insertedAttendanceEventIds: ['event-1'],
        insertedLectureEventIds: ['lecture-1'],
        movedEventSubscriptionIds: ['event-subscription-1'],
        movedEventGroupSubscriptionIds: ['group-subscription-1'],
        movedMajorEventSubscriptionIds: ['major-subscription-1'],
      },
    };
    const updatedCandidate = candidate({ status: 'PENDING' });

    tx.mergeCandidate.findUnique.mockResolvedValue(candidate({ status: 'MERGED' }));
    tx.peopleMergeOperation.findFirst.mockResolvedValue(operation);
    tx.people.findUnique.mockResolvedValueOnce(target).mockResolvedValueOnce(source);
    tx.mergeCandidate.update.mockResolvedValue(updatedCandidate);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(service.undoMergeCandidatePeople('candidate-1', 'actor-1')).resolves.toBe(updatedCandidate);

    expect(tx.eventSubscription.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['event-subscription-1'] },
        personId: target.id,
      },
      data: { personId: source.id },
    });
    expect(tx.eventAttendance.deleteMany).toHaveBeenCalledWith({
      where: {
        personId: target.id,
        eventId: { in: ['event-1'] },
      },
    });
    expect(tx.eventAttendance.createMany).toHaveBeenCalledWith({
      data: [
        {
          personId: source.id,
          eventId: 'event-1',
          attendedAt: new Date('2026-05-21T10:00:00.000Z'),
          createdAt: new Date('2026-05-21T09:00:00.000Z'),
          createdById: 'actor-1',
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.people.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: expect.objectContaining({
        name: 'Target Before',
        updatedById: 'actor-1',
      }),
    });
    expect(tx.peopleMergeOperation.update).toHaveBeenCalledWith({
      where: { id: operation.id },
      data: {
        status: 'ROLLED_BACK',
        rolledBackAt: new Date('2026-05-21T12:00:00.000Z'),
        rolledBackById: 'actor-1',
      },
    });
    expect(tx.mergeCandidate.update).toHaveBeenCalledWith({
      where: { id: 'candidate-1' },
      data: {
        status: 'PENDING',
        resolvedById: null,
        updatedById: 'actor-1',
      },
      include: {
        personA: true,
        personB: true,
      },
    });
  });

  it('rejects undo when the source is no longer merged into the operation target', async () => {
    const tx = createTransaction();
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.mergeCandidate.findUnique.mockResolvedValue(candidate({ status: 'MERGED' }));
    tx.peopleMergeOperation.findFirst.mockResolvedValue({
      id: 'operation-1',
      targetPersonId: 'target-person',
      sourcePersonId: 'source-person',
      targetSnapshot: snapshot(),
      sourceSnapshot: snapshot(),
      movedRelations: emptyMovedRelations(),
    });
    tx.people.findUnique
      .mockResolvedValueOnce(person({ id: 'target-person' }))
      .mockResolvedValueOnce(person({ id: 'source-person', mergedIntoId: 'other-person' }));

    await expect(service.undoMergeCandidatePeople('candidate-1', null)).rejects.toBeInstanceOf(ConflictException);
  });
});

function createPrisma() {
  return {
    mergeCandidate: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    people: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function createTransaction() {
  return {
    mergeCandidate: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    people: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    peopleMergeOperation: {
      create: jest.fn(),
      findFirst: jest.fn(),
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
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    eventGroupSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
  };
}

type PersonMock = ReturnType<typeof personShape>;

function person(overrides: Partial<PersonMock>): PersonMock {
  return {
    ...personShape(),
    ...overrides,
  };
}

function personShape() {
  return {
    id: 'person-a',
    name: 'Person Name',
    email: null,
    secondaryEmails: [] as string[],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null as Date | null,
    createdAt: new Date('2026-05-21T12:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-05-21T12:00:00.000Z'),
    updatedById: null,
    isCPF: null,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    personAId: 'person-a',
    personBId: 'person-b',
    status: 'PENDING',
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Person Snapshot',
    email: null,
    secondaryEmails: [],
    identityDocument: null,
    academicId: null,
    userId: null,
    externalRef: null,
    mergedIntoId: null,
    deletedAt: null,
    ...overrides,
  };
}

function emptyMovedRelations() {
  return {
    sourceAttendances: [],
    sourceLectures: [],
    insertedAttendanceEventIds: [],
    insertedLectureEventIds: [],
    movedEventSubscriptionIds: [],
    movedEventGroupSubscriptionIds: [],
    movedMajorEventSubscriptionIds: [],
  };
}
