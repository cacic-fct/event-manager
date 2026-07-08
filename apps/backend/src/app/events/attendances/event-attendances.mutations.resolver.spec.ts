import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
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

  it('converts duplicate attendance creation errors into conflicts', async () => {
    const tx = createTxMock();
    tx.eventAttendance.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.createEventAttendance(
        { personId: 'person-1', eventId: 'event-1', attendedAt: new Date('2026-05-21T12:00:00.000Z') },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
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

  it('creates Aztec-code attendances after validating the event and active person', async () => {
    const { resolver: resolverWithDeps, frozenResources, auditLog } = createResolverWithDependencies(prisma, attendanceCategories);
    const tx = createTxMock();
    const attendance = {
      personId: 'person-1',
      eventId: 'event-1',
      person: { name: 'Ada Lovelace' },
    };
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.people.findFirst.mockResolvedValue({ id: 'person-1' });
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue(attendance);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolverWithDeps.createEventAttendanceFromAztecCode(
        'event-1',
        'user:user-1',
        { request: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toBe(attendance);

    expect(frozenResources.assertEventMutable).toHaveBeenCalledWith('event-1', { sub: 'collector-1' }, 'edit');
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'event-1',
          deletedAt: null,
        },
      }),
    );
    expect(prisma.people.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          deletedAt: null,
          mergedIntoId: null,
        },
      }),
    );
    expect(tx.eventAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event-1',
          personId: 'person-1',
          createdById: 'collector-1',
          committedById: 'collector-1',
          createdByMethod: AttendanceCreationMethod.SCANNER,
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityLabel: 'Ada Lovelace',
        summary: 'Presença registrada por leitura de código no painel administrativo.',
      }),
      tx,
    );
  });

  it('rejects Aztec-code attendances when the code, event, or person cannot be resolved', async () => {
    const { resolver: resolverWithDeps } = createResolverWithDependencies(prisma, attendanceCategories);

    await expect(
      resolverWithDeps.createEventAttendanceFromAztecCode('event-1', 'invalid', { req: { user: { sub: 'collector-1' } } } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.event.findFirst.mockResolvedValue(null);
    await expect(
      resolverWithDeps.createEventAttendanceFromAztecCode('event-missing', 'user:user-1', { req: { user: { sub: 'collector-1' } } } as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.people.findFirst.mockResolvedValue(null);
    await expect(
      resolverWithDeps.createEventAttendanceFromAztecCode('event-1', 'user:missing-user', { req: { user: { sub: 'collector-1' } } } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('converts duplicate Aztec-code attendance writes into conflicts', async () => {
    const { resolver: resolverWithDeps } = createResolverWithDependencies(prisma, attendanceCategories);
    const tx = createTxMock();
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.people.findFirst.mockResolvedValue({ id: 'person-1' });
    tx.eventAttendance.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolverWithDeps.createEventAttendanceFromAztecCode(
        'event-1',
        'user:user-1',
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates manual-input attendances for explicit merged people', async () => {
    const tx = createTxMock();
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue({ personId: 'active-person', eventId: 'event-1' });
    prisma.people.findUnique.mockResolvedValue({ id: 'old-person', mergedIntoId: 'active-person' });
    prisma.people.findFirst.mockResolvedValue({ id: 'active-person' });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.createEventAttendanceFromManualInput(
        {
          eventId: 'event-1',
          personId: 'old-person',
          value: 'ignored when person is explicit',
        },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ personId: 'active-person' }));

    expect(tx.eventAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: 'active-person',
          createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        }),
      }),
    );
    expect(prisma.people.findMany).not.toHaveBeenCalled();
  });

  it('rejects scanner-code attendance when the decoded person is missing', async () => {
    prisma.people.findFirst.mockResolvedValue(null);

    await expect(
      resolver.createEventAttendanceFromScannerCode(
        { eventId: 'event-1', code: 'user:missing-user' },
        { req: { user: { sub: 'collector-1' } } } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
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

  it('approves offline submissions in normalized batches', async () => {
    const { resolver: resolverWithDeps, authorizationPolicy, dashboardInsights } = createResolverWithDependencies(prisma, attendanceCategories);
    const firstSubmission = offlineSubmissionFixture({ id: 'submission-1', personId: 'person-1' });
    const secondSubmission = offlineSubmissionFixture({ id: 'submission-2', personId: 'person-2' });
    prisma.offlineEventAttendanceSubmission.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === 'submission-2' ? secondSubmission : firstSubmission),
    );
    prisma.people.findUnique
      .mockResolvedValueOnce({ id: 'person-1', mergedIntoId: null })
      .mockResolvedValueOnce({ id: 'person-2', mergedIntoId: null });
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({
        ...(where.id === 'submission-2' ? secondSubmission : firstSubmission),
        status: 'COMMITTED',
        committedAt: new Date('2026-05-21T13:00:00.000Z'),
        committedById: 'admin-user',
      }),
    );
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    tx.eventAttendance.findUnique.mockResolvedValue({ personId: 'person-1', eventId: 'event-1' });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolverWithDeps.approveOfflineEventAttendanceSubmissions(
        [' submission-1 ', 'submission-1', 'submission-2'],
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'submission-1', status: 'COMMITTED' }),
      expect.objectContaining({ id: 'submission-2', status: 'COMMITTED' }),
    ]);

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledTimes(2);
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledTimes(2);
    expect(dashboardInsights.invalidateCachedInsights).toHaveBeenCalledTimes(2);
  });

  it('rejects empty or oversized offline review batches', async () => {
    await expect(resolver.approveOfflineEventAttendanceSubmissions([' ', ''], {} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect(
      resolver.rejectOfflineEventAttendanceSubmissions(
        Array.from({ length: 1001 }, (_, index) => `submission-${index}`),
        null,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects pending offline submissions with trimmed reasons and audit entries', async () => {
    const { resolver: resolverWithDeps, frozenResources, authorizationPolicy, auditLog, dashboardInsights } =
      createResolverWithDependencies(prisma, attendanceCategories);
    const submission = offlineSubmissionFixture();
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      status: 'REJECTED',
      rejectedAt: new Date('2026-05-21T13:00:00.000Z'),
      rejectedById: 'admin-user',
      rejectionReason: 'sem documento',
    });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolverWithDeps.rejectOfflineEventAttendanceSubmission(
        'submission-1',
        '  sem documento  ',
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'submission-1', status: 'REJECTED' }));

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-user' },
      expect.any(Array),
      { eventId: 'event-1' },
    );
    expect(frozenResources.assertEventMutable).toHaveBeenCalledWith('event-1', { sub: 'admin-user' }, 'edit');
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectedById: 'admin-user',
          rejectionReason: 'sem documento',
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'offline:submission-1',
        after: {
          status: 'REJECTED',
          rejectionReason: 'sem documento',
        },
      }),
      tx,
    );
    expect(dashboardInsights.invalidateCachedInsights).toHaveBeenCalled();
  });

  it('rejects offline review when submissions are missing, already reviewed, or concurrently changed', async () => {
    const { resolver: resolverWithDeps } = createResolverWithDependencies(prisma, attendanceCategories);

    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValueOnce(null);
    await expect(
      resolverWithDeps.rejectOfflineEventAttendanceSubmission('missing-submission', null, { req: { user: { sub: 'admin-user' } } } as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValueOnce(
      offlineSubmissionFixture({ status: 'COMMITTED' }),
    );
    await expect(
      resolverWithDeps.rejectOfflineEventAttendanceSubmission('submission-1', null, { req: { user: { sub: 'admin-user' } } } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValueOnce(offlineSubmissionFixture());
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));
    await expect(
      resolverWithDeps.rejectOfflineEventAttendanceSubmission('submission-1', null, { req: { user: { sub: 'admin-user' } } } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects approval when the pending submission is concurrently reviewed', async () => {
    const { resolver: resolverWithDeps } = createResolverWithDependencies(prisma, attendanceCategories);
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(offlineSubmissionFixture());
    prisma.people.findUnique.mockResolvedValue({ id: 'person-1', mergedIntoId: null });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      resolverWithDeps.approveOfflineEventAttendanceSubmission('submission-1', { req: { user: { sub: 'admin-user' } } } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects approve and update when offline submissions are missing or already reviewed', async () => {
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValueOnce(null);
    await expect(resolver.approveOfflineEventAttendanceSubmission('missing-submission', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValueOnce(
      offlineSubmissionFixture({ status: 'REJECTED' }),
    );
    await expect(resolver.approveOfflineEventAttendanceSubmission('submission-1', {} as never)).rejects.toBeInstanceOf(
      ConflictException,
    );

    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValueOnce(null);
    await expect(
      resolver.updateOfflineEventAttendanceSubmission('missing-submission', { personId: 'person-1' }, {} as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValueOnce(
      offlineSubmissionFixture({ status: 'COMMITTED' }),
    );
    await expect(
      resolver.updateOfflineEventAttendanceSubmission('submission-1', { personId: 'person-1' }, {} as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps scanner corrections retryable when the code is invalid or has no active person', async () => {
    const submission = offlineSubmissionFixture({
      personId: null,
      createdByMethod: AttendanceCreationMethod.SCANNER,
      scannerCode: null,
      resolutionError: 'Código Aztec incompatível.',
    });
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      scannerCode: null,
      resolutionError: 'Código Aztec incompatível.',
    });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.updateOfflineEventAttendanceSubmission(
        'submission-1',
        { createdByMethod: 'SCANNER', scannerCode: 'bad-code' },
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ resolutionIssue: 'INVALID_SCANNER_CODE' }));

    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByMethod: AttendanceCreationMethod.SCANNER,
          scannerCode: null,
          personId: null,
          resolutionError: 'Código Aztec incompatível.',
        }),
      }),
    );

    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValueOnce(
      offlineSubmissionFixture({
        personId: null,
        createdByMethod: AttendanceCreationMethod.SCANNER,
        scannerCode: 'user:missing-user',
      }),
    );
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValueOnce({
      ...submission,
      scannerCode: 'missing-user',
      resolutionError: 'Person for user missing-user was not found.',
    });

    await expect(
      resolver.updateOfflineEventAttendanceSubmission(
        'submission-1',
        { createdByMethod: 'SCANNER', scannerCode: 'user:missing-user' },
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ resolutionIssue: 'PERSON_NOT_FOUND' }));
  });

  it('surfaces concurrent offline correction conflicts', async () => {
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(offlineSubmissionFixture());
    prisma.people.findUnique.mockResolvedValue({ id: 'person-1', mergedIntoId: null });
    prisma.people.findFirst.mockResolvedValue({ id: 'person-1' });
    const tx = createTxMock();
    tx.offlineEventAttendanceSubmission.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      resolver.updateOfflineEventAttendanceSubmission(
        'submission-1',
        { personId: 'person-1' },
        { req: { user: { sub: 'admin-user' } } } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
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
    prisma.people.findFirst.mockResolvedValue({ id: 'person-1' });
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

  it('keeps inferred offline corrections retryable when the merged person is deleted', async () => {
    const submission = offlineSubmissionFixture({
      personId: null,
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      manualValue: 'ada@exmaple.com',
      resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
    });
    prisma.offlineEventAttendanceSubmission.findUnique.mockResolvedValue(submission);
    prisma.people.findMany.mockResolvedValue([{ id: 'old-person', mergedIntoId: 'merged-person' }]);
    prisma.people.findUnique.mockResolvedValue({ id: 'merged-person', mergedIntoId: null });
    prisma.people.findFirst.mockResolvedValue(null);
    prisma.offlineEventAttendanceSubmission.findUniqueOrThrow.mockResolvedValue({
      ...submission,
      personId: null,
      manualValue: 'ada@example.com',
      resolutionError: 'Person merged-person was not found.',
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
        personId: undefined,
        resolutionIssue: 'PERSON_NOT_FOUND',
      }),
    );
    expect(tx.offlineEventAttendanceSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: null,
          resolutionError: 'Person merged-person was not found.',
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

function createResolverWithDependencies(
  prisma: ReturnType<typeof createFullPrisma>,
  attendanceCategories: { refreshForAttendance: jest.Mock },
) {
  const auditLog = {
    record: jest.fn(),
    buildCompositeEntityId: jest.fn((parts: readonly string[]) => parts.join(':')),
  };
  const frozenResources = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const dashboardInsights = {
    invalidateCachedInsights: jest.fn().mockResolvedValue(undefined),
  };
  const authorizationPolicy = {
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  };

  return {
    resolver: new EventAttendancesMutationsResolver(
      prisma as never,
      attendanceCategories as never,
      auditLog as never,
      frozenResources as never,
      dashboardInsights as never,
      authorizationPolicy as never,
    ),
    auditLog,
    frozenResources,
    dashboardInsights,
    authorizationPolicy,
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
