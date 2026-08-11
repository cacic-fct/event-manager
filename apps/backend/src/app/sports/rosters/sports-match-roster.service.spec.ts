import { BadRequestException, ConflictException } from '@nestjs/common';
import { AttendanceCreationMethod, SportsMatchActionType } from '@prisma/client';
import { issueSportsOfflineCollectorCredential } from '../security/sports-offline-collector-credential';
import { SportsMatchRosterService } from './sports-match-roster.service';

describe('SportsMatchRosterService check-in idempotency', () => {
  const checkedInAt = new Date('2026-08-01T12:30:00.000Z');
  const collectorCredential = issueSportsOfflineCollectorCredential({
    matchId: 'match-1',
    collectorPersonId: 'collector-person-1',
    collectorUserId: 'collector-user-1',
    collectorRole: 'REFEREE',
    collectorKind: 'OFFICIAL',
    issuedAt: new Date('2026-08-01T12:00:00.000Z'),
  }).credential;
  const collectorInput = {
    collectorPersonId: 'collector-person-1',
    collectorCredential,
  } as const;
  let persistedAction: Record<string, unknown> | null;
  let persistedCheckedInAt: Date | null;
  let matchState: 'SCHEDULED' | 'LIVE';

  const attendance = {
    id: 'attendance-1',
    personId: 'person-player',
    eventId: 'event-1',
    status: 'PRESENT',
  };
  const tx = {
    sportsMatchAction: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    sportsMatchRosterEntry: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    eventAttendance: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    sportsMatch: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    people: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
    sportsMatch: {
      findFirst: jest.fn(),
    },
    sportsMatchRosterEntry: {
      findFirst: jest.fn(),
    },
    people: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  const attendanceCategories = {
    refreshForAttendance: jest.fn(),
  };
  const auditLog = {
    record: jest.fn(),
  };
  const mutationEvents = {
    publishRosterMutation: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    persistedAction = null;
    persistedCheckedInAt = null;
    matchState = 'SCHEDULED';
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    prisma.sportsMatch.findFirst.mockResolvedValue(null);
    prisma.people.findUnique.mockResolvedValue({ id: 'collector-person-1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'collector-user-1' });
    tx.people.findUnique.mockResolvedValue({ id: 'collector-person-1' });
    tx.user.findUnique.mockResolvedValue({ id: 'collector-user-1' });
    tx.sportsMatchAction.findUnique.mockImplementation(async () => persistedAction);
    tx.sportsMatchAction.create.mockImplementation(async ({ data }) => {
      persistedAction = { id: 'action-1', ...data };
      return persistedAction;
    });
    tx.sportsMatchRosterEntry.findFirst.mockImplementation(async () => ({
      id: 'roster-entry-1',
      checkedInAt: persistedCheckedInAt,
      registrationMember: {
        teamMember: {
          participant: {
            personId: 'person-player',
            status: 'ACTIVE',
          },
        },
      },
      roster: {
        id: 'roster-1',
        match: {
          id: 'match-1',
          eventId: 'event-1',
          state: matchState,
          revision: 5,
          operationSequence: 2,
          category: {
            eventGroupId: 'event-group-1',
            tournament: { majorEventId: 'major-event-1' },
          },
        },
      },
    }));
    tx.eventAttendance.upsert.mockResolvedValue(attendance);
    tx.eventAttendance.delete.mockResolvedValue(attendance);
    tx.eventAttendance.findUnique.mockResolvedValue(attendance);
    tx.sportsMatchRosterEntry.update.mockImplementation(async ({ data }) => {
      persistedCheckedInAt = data.checkedInAt;
      return { id: 'roster-entry-1' };
    });
    tx.sportsMatch.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsMatch.findFirst.mockResolvedValue({
      revision: 5,
      operationSequence: 2,
      state: 'SCHEDULED',
    });
  });

  function createService(): SportsMatchRosterService {
    return new SportsMatchRosterService(
      prisma as never,
      attendanceCategories as never,
      auditLog as never,
      mutationEvents as never,
    );
  }

  it('replays an identical offline check-in without duplicating attendance or audit work', async () => {
    const service = createService();
    const args = [
      'match-1',
      'roster-entry-1',
      checkedInAt,
      'offline-check-in-1',
      true,
      true,
      'official-person-1',
      'official-user-1',
      'REFEREE',
      { id: 'official-person-1', name: 'Árbitro', type: 'USER' } as never,
      collectorInput,
    ] as const;

    await expect(service.checkIn(...args)).resolves.toEqual(attendance);
    await expect(service.checkIn(...args)).resolves.toEqual(attendance);

    expect(tx.eventAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(tx.eventAttendance.upsert).toHaveBeenCalledWith({
      where: { personId_eventId: { personId: 'person-player', eventId: 'event-1' } },
      create: expect.objectContaining({
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        createdById: 'collector-user-1',
        committedById: 'official-user-1',
      }),
      update: expect.objectContaining({ committedById: 'official-user-1' }),
    });
    expect(tx.sportsMatchRosterEntry.update).toHaveBeenCalledTimes(1);
    expect(tx.sportsMatchAction.create).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(tx.sportsMatchAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'offline-check-in-1',
        type: SportsMatchActionType.CHECK_IN,
        offline: true,
        actorPersonId: 'collector-person-1',
        actorUserId: 'collector-user-1',
        reviewedById: 'official-user-1',
        payload: {
          kind: 'ROSTER_ENTRY_CHECK_IN',
          rosterEntryId: 'roster-entry-1',
          checkedInAt: checkedInAt.toISOString(),
          present: true,
        },
      }),
    });
  });

  it('rejects reusing a client id for a different roster entry', async () => {
    const service = createService();
    await service.checkIn(
      'match-1',
      'roster-entry-1',
      checkedInAt,
      'offline-check-in-1',
      true,
      true,
      'official-person-1',
      'official-user-1',
      'REFEREE',
      { id: 'official-person-1', name: 'Árbitro', type: 'USER' } as never,
      collectorInput,
    );

    await expect(
      service.checkIn(
        'match-1',
        'another-roster-entry',
        checkedInAt,
        'offline-check-in-1',
        true,
        true,
        'official-person-1',
        'official-user-1',
        'REFEREE',
        { id: 'official-person-1', name: 'Árbitro', type: 'USER' } as never,
        collectorInput,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.eventAttendance.upsert).toHaveBeenCalledTimes(1);
  });

  it('clears an accidental roster check-in without deleting shared attendance', async () => {
    const service = createService();
    persistedCheckedInAt = checkedInAt;
    tx.eventAttendance.findUnique.mockResolvedValue(attendance);
    const args = [
      'match-1',
      'roster-entry-1',
      checkedInAt,
      'offline-check-in-removal-1',
      true,
      false,
      'official-person-1',
      'official-user-1',
      'REFEREE',
      { id: 'official-person-1', name: 'Árbitro', type: 'USER' } as never,
      collectorInput,
    ] as const;

    await expect(service.checkIn(...args)).resolves.toEqual(attendance);
    await expect(service.checkIn(...args)).resolves.toEqual(attendance);

    expect(tx.eventAttendance.delete).not.toHaveBeenCalled();
    expect(tx.sportsMatchRosterEntry.update).toHaveBeenCalledWith({
      where: { id: 'roster-entry-1' },
      data: {
        checkedInAt: null,
        checkedInById: null,
        updatedById: 'official-person-1',
      },
    });
    expect(tx.sportsMatchAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({ present: false }),
      }),
    });
  });

  it('allows an official to correct athlete check-in while the match is live', async () => {
    matchState = 'LIVE';
    await expect(
      createService().checkIn(
        'match-1',
        'roster-entry-1',
        checkedInAt,
        'live-correction-1',
        false,
        true,
        'official-person-1',
        'official-user-1',
        'REFEREE',
        { id: 'official-person-1', name: 'Árbitro', type: 'USER' } as never,
      ),
    ).resolves.toEqual(attendance);
  });

  it('replays an identical non-roster scanner check-in without duplicating attendance or audit work', async () => {
    const service = createService();
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      eventId: 'event-1',
      revision: 5,
      state: 'SCHEDULED',
      event: {
        deletedAt: null,
        publiclyVisible: true,
        publicationState: 'PUBLISHED',
      },
      category: {
        eventGroupId: 'event-group-1',
        tournament: { majorEventId: 'major-event-1' },
      },
    });
    prisma.people.findFirst.mockResolvedValue({ id: 'person-visitor' });
    prisma.sportsMatchRosterEntry.findFirst.mockResolvedValue(null);
    tx.eventAttendance.upsert.mockResolvedValue({
      ...attendance,
      personId: 'person-visitor',
    });
    tx.eventAttendance.findUnique.mockResolvedValue({
      ...attendance,
      personId: 'person-visitor',
    });
    const args = [
      'match-1',
      'user:user-visitor',
      checkedInAt,
      'offline-scanner-1',
      true,
      'official-person-1',
      'official-user-1',
      'REFEREE',
      { id: 'official-person-1', name: 'Árbitro', type: 'USER' } as never,
      collectorInput,
    ] as const;

    await service.checkInFromScanner(...args);
    await service.checkInFromScanner(...args);

    expect(tx.eventAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(tx.eventAttendance.upsert).toHaveBeenCalledWith({
      where: { personId_eventId: { personId: 'person-visitor', eventId: 'event-1' } },
      create: expect.objectContaining({
        createdByMethod: AttendanceCreationMethod.SCANNER,
        createdById: 'collector-user-1',
        committedById: 'official-user-1',
      }),
      update: expect.objectContaining({ committedById: 'official-user-1' }),
    });
    expect(tx.sportsMatchAction.create).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          collector: expect.objectContaining({
            personId: 'collector-person-1',
            userId: 'collector-user-1',
          }),
          uploader: expect.objectContaining({
            personId: 'official-person-1',
            userId: 'official-user-1',
          }),
          crossUserHandoff: true,
        }),
      }),
      tx,
    );
    expect(JSON.stringify(auditLog.record.mock.calls)).not.toContain('user:user-visitor');
  });

  it('rejects an offline check-in without signed collector provenance', async () => {
    await expect(
      createService().checkIn(
        'match-1',
        'roster-entry-1',
        checkedInAt,
        'offline-no-proof-1',
        true,
        true,
        'official-person-1',
        'official-user-1',
        'REFEREE',
        { id: 'official-person-1', name: 'Árbitro', type: 'USER' } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.sportsMatchAction.create).not.toHaveBeenCalled();
  });

  it('rejects collector proof issued for another match', async () => {
    const otherMatchProof = issueSportsOfflineCollectorCredential({
      matchId: 'match-2',
      collectorPersonId: 'collector-person-1',
      collectorUserId: 'collector-user-1',
      collectorRole: 'REFEREE',
      collectorKind: 'OFFICIAL',
    });

    await expect(
      createService().checkIn(
        'match-1',
        'roster-entry-1',
        checkedInAt,
        'offline-wrong-proof-match-1',
        true,
        true,
        'official-person-1',
        'official-user-1',
        'REFEREE',
        { id: 'official-person-1', name: 'Uploader', type: 'USER' } as never,
        {
          collectorPersonId: otherMatchProof.collectorPersonId,
          collectorCredential: otherMatchProof.credential,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.sportsMatchAction.create).not.toHaveBeenCalled();
  });

  it('accepts durable proof after the collector person was merged and its user link changed', async () => {
    tx.people.findUnique.mockResolvedValue({ id: 'collector-person-1' });
    tx.user.findUnique.mockResolvedValue({ id: 'collector-user-1' });

    await expect(
      createService().checkIn(
        'match-1',
        'roster-entry-1',
        checkedInAt,
        'offline-historical-collector-1',
        true,
        true,
        'official-person-1',
        'official-user-1',
        'REFEREE',
        { id: 'official-person-1', name: 'Uploader', type: 'USER' } as never,
        collectorInput,
      ),
    ).resolves.toEqual(attendance);

    expect(tx.people.findUnique).toHaveBeenCalledWith({
      where: { id: 'collector-person-1' },
      select: { id: true },
    });
  });

  it('records scanner provenance when the scanned person is a roster athlete', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      eventId: 'event-1',
      revision: 5,
      state: 'SCHEDULED',
      category: {
        eventGroupId: 'event-group-1',
        tournament: { majorEventId: 'major-event-1' },
      },
    });
    prisma.people.findFirst.mockResolvedValue({ id: 'person-player' });
    prisma.sportsMatchRosterEntry.findFirst.mockResolvedValue({ id: 'roster-entry-1' });

    await createService().checkInFromScanner(
      'match-1',
      'user:user-player',
      checkedInAt,
      'scanner-roster-athlete-1',
      false,
      'official-person-1',
      'official-user-1',
      'REFEREE',
      { id: 'official-person-1', name: 'Árbitro', type: 'USER' } as never,
    );

    expect(tx.eventAttendance.upsert).toHaveBeenCalledWith({
      where: { personId_eventId: { personId: 'person-player', eventId: 'event-1' } },
      create: expect.objectContaining({
        createdByMethod: AttendanceCreationMethod.SCANNER,
        createdById: 'official-user-1',
        committedById: 'official-user-1',
      }),
      update: expect.objectContaining({ committedById: 'official-user-1' }),
    });
  });
});
