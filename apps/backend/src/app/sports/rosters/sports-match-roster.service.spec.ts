import { ConflictException } from '@nestjs/common';
import { SportsMatchActionType } from '@prisma/client';
import { SportsMatchRosterService } from './sports-match-roster.service';

describe('SportsMatchRosterService check-in idempotency', () => {
  const checkedInAt = new Date('2026-08-01T12:30:00.000Z');
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
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
    sportsMatch: {
      findFirst: jest.fn(),
    },
  };
  const attendanceCategories = {
    refreshForAttendance: jest.fn(),
  };
  const auditLog = {
    record: jest.fn(),
  };
  const realtime = {
    publish: jest.fn(),
    publishAutorouteInvalidations: jest.fn(),
    scope: jest.fn(),
  };
  const autorouting = {
    affectedPeopleForMatch: jest.fn(),
  };
  const defaultRedirect = {
    invalidatePeople: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    persistedAction = null;
    persistedCheckedInAt = null;
    matchState = 'SCHEDULED';
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    prisma.sportsMatch.findFirst.mockResolvedValue(null);
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
  });

  function createService(): SportsMatchRosterService {
    return new SportsMatchRosterService(
      prisma as never,
      attendanceCategories as never,
      auditLog as never,
      realtime as never,
      autorouting as never,
      defaultRedirect as never,
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
    ] as const;

    await expect(service.checkIn(...args)).resolves.toEqual(attendance);
    await expect(service.checkIn(...args)).resolves.toEqual(attendance);

    expect(tx.eventAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(tx.sportsMatchRosterEntry.update).toHaveBeenCalledTimes(1);
    expect(tx.sportsMatchAction.create).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(tx.sportsMatchAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'offline-check-in-1',
        type: SportsMatchActionType.CHECK_IN,
        offline: true,
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
});
