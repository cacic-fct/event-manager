import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  EventAttendanceStatus,
  PublicationState,
  SportsMatchState,
  SportsParticipantStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsEligibilityStatus,
  SportsRegistrationStatus,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { SportsMatchRosterService } from './sports-match-roster.service';

describe('SportsMatchRosterService', () => {
  const attendanceCategories = {
    refreshForAttendance: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = {
    scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const autorouting = {
    affectedPeopleForMatch: jest.fn().mockResolvedValue(['player-person-1']),
  };
  const defaultRedirect = {
    invalidatePeople: jest.fn().mockResolvedValue(undefined),
  };

  let tx: ReturnType<typeof createTransaction>;
  let prisma: {
    $transaction: jest.Mock;
    sportsMatch: { findFirst: jest.Mock };
  };
  let service: SportsMatchRosterService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    prisma = {
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      sportsMatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'match-authorized',
          revision: 2,
          category: {
            tournamentId: 'tournament-1',
          },
          event: {
            deletedAt: null,
            publiclyVisible: true,
            publicationState: PublicationState.PUBLISHED,
          },
        }),
      },
    };
    service = new SportsMatchRosterService(
      prisma as never,
      attendanceCategories as never,
      auditLog as never,
      realtime as never,
      autorouting as never,
      defaultRedirect as never,
    );
  });

  it('constrains attendance collection to the authorized match', async () => {
    const checkedInAt = new Date('2026-07-29T12:00:00.000Z');

    await service.checkIn(
      'match-authorized',
      'roster-entry-1',
      checkedInAt,
      'official-person-1',
      auditActor(),
    );

    expect(tx.sportsMatchRosterEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'roster-entry-1',
          deletedAt: null,
          status: SportsRosterEntryStatus.APPROVED,
          roster: {
            matchId: 'match-authorized',
            status: SportsRosterStatus.APPROVED,
            deletedAt: null,
          },
          registrationMember: {
            deletedAt: null,
            eligibility: SportsEligibilityStatus.ELIGIBLE,
            registration: {
              deletedAt: null,
              status: {
                in: [
                  SportsRegistrationStatus.APPROVED,
                  SportsRegistrationStatus.ACTIVE,
                ],
              },
            },
            teamMember: {
              deletedAt: null,
              status: SportsTeamMemberStatus.APPROVED,
              participant: {
                deletedAt: null,
                status: SportsParticipantStatus.ACTIVE,
              },
            },
          },
        },
      }),
    );
    expect(tx.eventAttendance.upsert).toHaveBeenCalledWith({
      where: {
        personId_eventId: {
          personId: 'player-person-1',
          eventId: 'event-1',
        },
      },
      create: expect.objectContaining({
        personId: 'player-person-1',
        eventId: 'event-1',
        attendedAt: checkedInAt,
        status: EventAttendanceStatus.PRESENT,
        createdById: 'official-person-1',
      }),
      update: expect.objectContaining({
        attendedAt: checkedInAt,
        status: EventAttendanceStatus.PRESENT,
        createdById: 'official-person-1',
      }),
    });
    expect(tx.sportsMatch.update).toHaveBeenCalledWith({
      where: { id: 'match-authorized' },
      data: {
        state: SportsMatchState.CHECK_IN,
        revision: { increment: 1 },
        updatedById: 'official-person-1',
      },
    });
    expect(realtime.publish).toHaveBeenCalledWith(
      'match:match-authorized',
      expect.objectContaining({
        type: 'PLAYER_CHECKED_IN',
        matchId: 'match-authorized',
      }),
    );
    expect(defaultRedirect.invalidatePeople).toHaveBeenCalledWith([
      'player-person-1',
    ]);
  });

  it('does not leak whether an entry exists on a different match', async () => {
    tx.sportsMatchRosterEntry.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.checkIn(
        'match-authorized',
        'entry-from-another-match',
        new Date('2026-07-29T12:00:00.000Z'),
        'official-person-1',
        auditActor(),
      ),
    ).rejects.toThrow(NotFoundException);

    expect(tx.eventAttendance.upsert).not.toHaveBeenCalled();
    expect(attendanceCategories.refreshForAttendance).not.toHaveBeenCalled();
  });

  it('blocks untrusted lineup changes after a match starts', async () => {
    tx.sportsMatch.findFirst.mockResolvedValueOnce({
      ...matchForRoster(),
      state: SportsMatchState.LIVE,
    });

    await expect(
      service.upsert(
        {
          matchId: 'match-authorized',
          registrationId: 'registration-home',
          entries: [
            {
              registrationMemberId: 'registration-member-1',
              role: SportsRosterRole.PLAYER,
            },
          ],
        },
        'captain-person-1',
        auditActor(),
        false,
      ),
    ).rejects.toThrow(ConflictException);

    expect(tx.sportsRegistrationMember.findMany).not.toHaveBeenCalled();
  });

  it('rejects stale lineup revisions before replacing entries', async () => {
    tx.sportsMatchRoster.findFirst.mockResolvedValueOnce({
      id: 'roster-1',
      revision: 3,
      status: SportsRosterStatus.SUBMITTED,
      entries: [],
    });

    await expect(
      service.upsert(
        {
          matchId: 'match-authorized',
          registrationId: 'registration-home',
          expectedRevision: 2,
          entries: [
            {
              registrationMemberId: 'registration-member-1',
              role: SportsRosterRole.PLAYER,
            },
          ],
        },
        'captain-person-1',
        auditActor(),
        false,
      ),
    ).rejects.toThrow(ConflictException);

    expect(tx.sportsMatchRoster.updateMany).not.toHaveBeenCalled();
    expect(tx.sportsMatchRosterEntry.updateMany).not.toHaveBeenCalled();
  });

  it('requires a roster revision before replacing an existing queued lineup', async () => {
    tx.sportsMatchRoster.findFirst.mockResolvedValueOnce({
      id: 'roster-1',
      revision: 3,
      status: SportsRosterStatus.SUBMITTED,
      entries: [],
    });

    await expect(
      service.upsert(
        {
          matchId: 'match-authorized',
          registrationId: 'registration-home',
          entries: [
            {
              registrationMemberId: 'registration-member-1',
              role: SportsRosterRole.PLAYER,
            },
          ],
        },
        'captain-person-1',
        auditActor(),
        false,
      ),
    ).rejects.toThrow(ConflictException);

    expect(tx.sportsMatchRoster.updateMany).not.toHaveBeenCalled();
  });
});

function createTransaction() {
  return {
    sportsMatch: {
      findFirst: jest.fn().mockResolvedValue(matchForRoster()),
      update: jest.fn().mockResolvedValue({
        id: 'match-authorized',
        state: SportsMatchState.CHECK_IN,
      }),
    },
    sportsRegistrationMember: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'registration-member-1',
          role: SportsRosterRole.PLAYER,
        },
      ]),
    },
    sportsMatchRoster: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    sportsMatchRosterEntry: {
      findFirst: jest.fn().mockResolvedValue(checkInEntry()),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    eventAttendance: {
      upsert: jest.fn().mockResolvedValue({
        id: 'attendance-1',
        status: EventAttendanceStatus.PRESENT,
      }),
    },
  };
}

function matchForRoster() {
  return {
    id: 'match-authorized',
    eventId: 'event-1',
    categoryId: 'category-1',
    state: SportsMatchState.SCHEDULED,
    homeRegistrationId: 'registration-home',
    awayRegistrationId: 'registration-away',
    category: {
      id: 'category-1',
      eventGroupId: 'event-group-1',
      maximumRosterSize: 12,
      tournament: { majorEventId: 'major-event-1' },
    },
  };
}

function checkInEntry() {
  return {
    id: 'roster-entry-1',
    registrationMember: {
      teamMember: {
        participant: {
          personId: 'player-person-1',
          status: SportsParticipantStatus.ACTIVE,
        },
      },
    },
    roster: {
      id: 'roster-1',
      matchId: 'match-authorized',
      match: matchForRoster(),
    },
  };
}

function auditActor() {
  return {
    id: 'official-person-1',
    name: 'Árbitro de Teste',
    type: 'USER',
  } as never;
}
