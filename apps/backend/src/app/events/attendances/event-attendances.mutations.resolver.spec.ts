import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod } from '@prisma/client';
import { EventAttendancesMutationsResolver } from './event-attendances.mutations.resolver';

describe('EventAttendancesMutationsResolver', () => {
  let prisma: ReturnType<typeof createFullPrisma>;
  let attendanceCategories: { refreshForAttendance: jest.Mock };
  let resolver: EventAttendancesMutationsResolver;

  beforeEach(() => {
    prisma = createFullPrisma();
    attendanceCategories = { refreshForAttendance: jest.fn().mockResolvedValue(undefined) };
    resolver = new EventAttendancesMutationsResolver(prisma as never, attendanceCategories as never);
  });

  it('creates, updates, and deletes attendances while refreshing categories', async () => {
    const tx = createTxMock();
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue({ personId: 'person-1', eventId: 'event-1', createdById: 'collector-1' });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.createEventAttendance(
        { personId: 'person-1', eventId: 'event-1', attendedAt: new Date('2026-05-21T12:00:00.000Z') },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual({ personId: 'person-1', eventId: 'event-1', createdById: 'collector-1' });
    expect(tx.eventAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdByMethod: AttendanceCreationMethod.MANUAL_INPUT }) }),
    );
    expect(attendanceCategories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx);

    tx.eventAttendance.findUnique.mockResolvedValue({ personId: 'person-1', eventId: 'event-1' });
    const attendedAt = new Date('2026-05-21T13:00:00.000Z');
    tx.eventAttendance.findUniqueOrThrow
      .mockReset()
      .mockResolvedValueOnce({
        personId: 'person-1',
        eventId: 'event-1',
        attendedAt,
        createdById: 'collector-2',
        collectedLatitude: null,
        collectedLongitude: null,
        collectedAccuracyMeters: null,
      })
      .mockResolvedValueOnce({
        personId: 'person-1',
        eventId: 'event-1',
        createdById: 'collector-2',
      });
    prisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));
    await expect(resolver.updateEventAttendance('person-1', 'event-1', { attendedAt })).resolves.toEqual({
      personId: 'person-1',
      eventId: 'event-1',
      createdById: 'collector-2',
    });
    expect(tx.eventAttendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          attendedAt,
        },
      }),
    );

    tx.eventAttendance.findUnique.mockResolvedValueOnce(null);
    prisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));
    await expect(resolver.updateEventAttendance('person-1', 'missing-event', {})).rejects.toBeInstanceOf(NotFoundException);

    tx.eventAttendance.findUnique.mockResolvedValueOnce({ personId: 'person-1', eventId: 'event-1' });
    prisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));
    await expect(resolver.deleteEventAttendance('person-1', 'event-1')).resolves.toEqual({ deleted: true, personId: 'person-1', eventId: 'event-1' });
    tx.eventAttendance.findUnique.mockResolvedValueOnce(null);
    prisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));
    await expect(resolver.deleteEventAttendance('person-1', 'event-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates scanner and manual attendances with location metadata', async () => {
    const tx = createTxMock();
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue({
      personId: 'person-1',
      eventId: 'event-1',
      collectedLatitude: -22.1,
      collectedLongitude: -51.4,
      collectedAccuracyMeters: 12,
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    prisma.people.findFirst.mockResolvedValue({ id: 'person-1' });

    await expect(
      resolver.createEventAttendanceFromScannerCode(
        { eventId: 'event-1', code: 'user:user-1', location: { latitude: -22.1, longitude: -51.4, accuracyMeters: 12 } },
        { request: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ personId: 'person-1' }));

    expect(tx.eventAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByMethod: AttendanceCreationMethod.SCANNER,
          collectedLatitude: -22.1,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 12,
        }),
      }),
    );

    await expect(resolver.createEventAttendanceFromScannerCode({ eventId: 'event-1', code: 'bad-code' }, {} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.people.findMany.mockResolvedValue([{ id: 'person-2', mergedIntoId: null }]);
    await expect(resolver.createEventAttendanceFromManualInput({ eventId: 'event-1', value: 'ada@example.com' }, {} as never)).resolves.toEqual(
      expect.objectContaining({ eventId: 'event-1' }),
    );

    prisma.people.findMany.mockResolvedValue([
      { id: 'person-1', mergedIntoId: null },
      { id: 'person-2', mergedIntoId: null },
    ]);
    await expect(resolver.createEventAttendanceFromManualInput({ eventId: 'event-1', value: 'duplicate@example.com' }, {} as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('marks approved offline submissions as committed when attendance already exists', async () => {
    const submission = {
      id: 'submission-1',
      clientId: 'queue-1',
      eventId: 'event-1',
      personId: 'person-1',
      status: 'PENDING',
      createdByMethod: AttendanceCreationMethod.SCANNER,
      scannerCode: 'user:user-1',
      manualValue: null,
      collectedAt: new Date('2026-05-21T12:00:00.000Z'),
      authorUserId: 'offline-user',
      submittedById: 'collector-user',
      collectedLatitude: -22.1,
      collectedLongitude: -51.4,
      collectedAccuracyMeters: 12,
      event: { id: 'event-1', name: 'Evento' },
      person: { id: 'person-1', name: 'Pessoa' },
    };
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.people.findUnique.mockResolvedValue({ id: 'person-1', mergedIntoId: null });
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      status: 'COMMITTED',
      committedAt: new Date('2026-05-21T13:00:00.000Z'),
      committedById: 'admin-user',
      rejectedAt: null,
      rejectedById: null,
      rejectionReason: null,
      stagedReason: null,
      resolutionError: null,
    });
    const tx = createTxMock();
    tx.eventAttendance.findUnique.mockResolvedValue({ personId: 'person-1', eventId: 'event-1' });
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.approveOfflineEventAttendanceSubmission('submission-1', { req: { user: { sub: 'admin-user' } } } as never),
    ).resolves.toEqual(expect.objectContaining({ id: 'submission-1', status: 'COMMITTED' }));
    expect(tx.eventAttendance.create).not.toHaveBeenCalled();
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'submission-1',
          status: 'PENDING',
        },
        data: expect.objectContaining({
          status: 'COMMITTED',
          personId: 'person-1',
          committedById: 'admin-user',
        }),
      }),
    );
  });

  it('normalizes merged staged people before approving offline submissions', async () => {
    const submission = {
      id: 'submission-1',
      clientId: 'queue-1',
      eventId: 'event-1',
      personId: 'old-person',
      status: 'PENDING',
      createdByMethod: AttendanceCreationMethod.SCANNER,
      scannerCode: 'user:user-1',
      manualValue: null,
      collectedAt: new Date('2026-05-21T12:00:00.000Z'),
      authorUserId: 'offline-user',
      submittedById: 'collector-user',
      collectedLatitude: -22.1,
      collectedLongitude: -51.4,
      collectedAccuracyMeters: 12,
      event: { id: 'event-1', name: 'Evento' },
      person: { id: 'old-person', name: 'Pessoa antiga' },
    };
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.people.findUnique.mockResolvedValue({ id: 'old-person', mergedIntoId: 'person-1' });
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      personId: 'person-1',
      status: 'COMMITTED',
      committedAt: new Date('2026-05-21T13:00:00.000Z'),
      committedById: 'admin-user',
      rejectedAt: null,
      rejectedById: null,
      rejectionReason: null,
      stagedReason: null,
      resolutionError: null,
    });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    tx.eventAttendance.findUnique.mockResolvedValue({ personId: 'person-1', eventId: 'event-1' });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await resolver.approveOfflineEventAttendanceSubmission('submission-1', { req: { user: { sub: 'admin-user' } } } as never);

    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: 'person-1',
        }),
      }),
    );
    expect(tx.eventAttendance.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId_eventId: {
            personId: 'person-1',
            eventId: 'event-1',
          },
        },
      }),
    );
  });

  it('approves scanner offline submissions that store the raw keycloak user id', async () => {
    const submission = offlineSubmissionFixture({
      personId: null,
      scannerCode: 'user-1',
      resolutionError: 'Person for user user-1 was not found.',
    });
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.people.findFirst.mockResolvedValue({ id: 'person-1' });
    prisma.people.findUnique.mockResolvedValue({ id: 'person-1', mergedIntoId: null });
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      personId: 'person-1',
      status: 'COMMITTED',
      committedAt: new Date('2026-05-21T13:00:00.000Z'),
      committedById: 'admin-user',
      rejectedAt: null,
      rejectedById: null,
      rejectionReason: null,
      stagedReason: null,
      resolutionError: null,
    });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    tx.eventAttendance.findUnique.mockResolvedValue(null);
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue({ personId: 'person-1', eventId: 'event-1' });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await resolver.approveOfflineEventAttendanceSubmission('submission-1', { req: { user: { sub: 'admin-user' } } } as never);

    expect(prisma.people.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
        }),
      }),
    );
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: 'person-1',
        }),
      }),
    );
    expect(tx.eventAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event-1',
          personId: 'person-1',
          createdByMethod: AttendanceCreationMethod.SCANNER,
        }),
      }),
    );
  });

  it('updates pending offline submissions with corrected manual data', async () => {
    const submission = offlineSubmissionFixture({
      personId: null,
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      manualValue: 'ada@exmaple.com',
      resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
    });
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.people.findMany.mockResolvedValue([{ id: 'person-1', mergedIntoId: null }]);
    prisma.people.findUnique.mockResolvedValue({ id: 'person-1', mergedIntoId: null });
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      personId: 'person-1',
      manualValue: 'ada@example.com',
      resolutionError: null,
    });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.updateOfflineEventAttendanceSubmission(
        'submission-1',
        { createdByMethod: 'MANUAL_INPUT', manualValue: 'ada@example.com' },
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'submission-1',
        personId: 'person-1',
        resolutionIssue: 'UNKNOWN',
      }),
    );
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'submission-1',
          status: 'PENDING',
        },
        data: expect.objectContaining({
          createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
          manualValue: 'ada@example.com',
          scannerCode: null,
          personId: 'person-1',
          resolutionError: null,
        }),
      }),
    );
  });

  it('updates pending offline submissions with an explicit active person', async () => {
    const submission = offlineSubmissionFixture({
      personId: null,
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      manualValue: 'ada@exmaple.com',
      stagedReason: 'Nenhuma pessoa encontrada para o dado informado.',
      resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
    });
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.people.findUnique.mockResolvedValue({ id: 'person-2', mergedIntoId: null });
    prisma.people.findFirst.mockResolvedValue({ id: 'person-2' });
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      personId: 'person-2',
      person: { id: 'person-2', name: 'Pessoa corrigida' },
      stagedReason: null,
      resolutionError: null,
    });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.updateOfflineEventAttendanceSubmission(
        'submission-1',
        { personId: 'person-2' },
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'submission-1',
        personId: 'person-2',
        resolutionIssue: 'UNKNOWN',
      }),
    );
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: 'person-2',
          stagedReason: null,
          resolutionError: null,
        }),
      }),
    );
  });

  it('keeps explicit-person corrections retryable when the person is stale or missing', async () => {
    const submission = offlineSubmissionFixture({
      personId: null,
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      manualValue: 'ada@exmaple.com',
      resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
    });
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.people.findUnique.mockResolvedValue(null);
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      personId: null,
      resolutionError: 'Person missing-person was not found.',
    });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.updateOfflineEventAttendanceSubmission(
        'submission-1',
        { personId: 'missing-person' },
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'submission-1',
        personId: undefined,
        resolutionIssue: 'PERSON_NOT_FOUND',
      }),
    );
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: null,
          resolutionError: 'Person missing-person was not found.',
        }),
      }),
    );
  });

  it('updates scanner-based offline submissions with an explicit active person', async () => {
    const submission = offlineSubmissionFixture({
      personId: null,
      createdByMethod: AttendanceCreationMethod.SCANNER,
      scannerCode: 'user:typo',
      resolutionError: 'Person for user typo was not found.',
    });
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.people.findUnique.mockResolvedValue({ id: 'person-2', mergedIntoId: null });
    prisma.people.findFirst.mockResolvedValue({ id: 'person-2' });
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      personId: 'person-2',
      person: { id: 'person-2', name: 'Pessoa corrigida' },
      resolutionError: null,
    });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.updateOfflineEventAttendanceSubmission(
        'submission-1',
        { createdByMethod: 'SCANNER', scannerCode: 'user:typo', personId: 'person-2' },
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ personId: 'person-2' }));
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByMethod: AttendanceCreationMethod.SCANNER,
          scannerCode: 'typo',
          manualValue: null,
          personId: 'person-2',
          resolutionError: null,
        }),
      }),
    );
  });

  it('saves unresolved offline submission corrections for another admin pass', async () => {
    const submission = offlineSubmissionFixture({
      personId: null,
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      manualValue: 'typo@example.com',
      resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
    });
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.people.findMany.mockResolvedValue([]);
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      manualValue: 'still-typo@example.com',
      resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
    });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.updateOfflineEventAttendanceSubmission(
        'submission-1',
        { createdByMethod: 'MANUAL_INPUT', manualValue: 'still-typo@example.com' },
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'submission-1',
        personId: undefined,
        resolutionIssue: 'PERSON_NOT_FOUND',
      }),
    );
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: null,
          resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
        }),
      }),
    );
  });
});

function offlineSubmissionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'submission-1',
    clientId: 'queue-1',
    eventId: 'event-1',
    personId: 'person-1',
    status: 'PENDING',
    createdByMethod: AttendanceCreationMethod.SCANNER,
    scannerCode: 'user:user-1',
    manualValue: null,
    collectedAt: new Date('2026-05-21T12:00:00.000Z'),
    authorUserId: 'offline-user',
    submittedById: 'collector-user',
    collectedLatitude: -22.1,
    collectedLongitude: -51.4,
    collectedAccuracyMeters: 12,
    committedAt: null,
    committedById: null,
    rejectedAt: null,
    rejectedById: null,
    rejectionReason: null,
    stagedReason: null,
    resolutionError: null,
    event: { id: 'event-1', name: 'Evento' },
    person: { id: 'person-1', name: 'Pessoa' },
    ...overrides,
  };
}

function createFullPrisma() {
  return {
    $transaction: jest.fn(),
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    offlineEventAttendanceSubmission: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    majorEvent: {
      findFirst: jest.fn(),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    people: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
  };
}

function createTxMock() {
  return {
    eventAttendance: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    offlineEventAttendanceSubmission: {
      updateMany: jest.fn(),
    },
  };
}
