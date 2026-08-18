import { NotFoundException } from '@nestjs/common';
import {
  sportsCurrentUserTournamentFixture,
  sportsPublicTeamRecord,
  sportsTestDate,
} from '../testing/sports-backend.fixtures';
import { SportsReadCurrentUserService } from './sports-read-current-user.service';
import { SportsReadRepresentativeService } from './sports-read-representative.service';

describe('SportsReadCurrentUserService', () => {
  const prisma = {
    sportsTeamMember: { findMany: jest.fn() },
    sportsMatchRosterEntry: { findMany: jest.fn() },
    majorEventSubscription: { findFirst: jest.fn() },
    sportsCategory: { findMany: jest.fn() },
    sportsMatch: { findFirst: jest.fn() },
    sportsOfficialAssignment: { findMany: jest.fn() },
    sportsRegistrationMember: { findMany: jest.fn() },
    sportsMatchRoster: { findFirst: jest.fn() },
  };
  const authorization = { assertPermissions: jest.fn() };
  const publicReader = {
    publicTournament: jest.fn(),
    mapPublicTeam: jest.fn((team) => ({ id: team.id, name: team.name })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sportsTeamMember.findMany.mockResolvedValue([]);
    prisma.sportsMatchRosterEntry.findMany.mockResolvedValue([]);
    prisma.majorEventSubscription.findFirst.mockResolvedValue(null);
    prisma.sportsCategory.findMany.mockResolvedValue([]);
    prisma.sportsRegistrationMember.findMany.mockResolvedValue([]);
    prisma.sportsMatchRoster.findFirst.mockResolvedValue(null);
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([]);
  });

  it('orders player matches before team matches and unrelated matches while preserving relative schedules', async () => {
    const tournament = sportsCurrentUserTournamentFixture();
    publicReader.publicTournament.mockResolvedValue(tournament);
    prisma.sportsTeamMember.findMany.mockResolvedValue([{ teamId: 'team-member' }]);
    prisma.sportsMatchRosterEntry.findMany.mockResolvedValue([{ roster: { matchId: 'player-match' } }]);
    prisma.majorEventSubscription.findFirst.mockResolvedValue({ imageLicenseAgreementAccepted: true });

    const result = await service().currentUserTournament({ tournamentId: 'tournament-1' }, 'person-1');

    expect(result.orderedMatches.map((match) => match.id)).toEqual(['player-match', 'team-match', 'unrelated-earlier']);
    expect(result.imageLicenseAgreementAccepted).toBe(true);
    expect(publicReader.publicTournament).toHaveBeenCalledWith({ tournamentId: 'tournament-1' });
    expect(prisma.sportsTeamMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ participant: { personId: 'person-1', deletedAt: null } }),
      }),
    );
  });

  it('uses schedule and id ordering within the same relationship priority and defaults agreement to false', async () => {
    const tournament = sportsCurrentUserTournamentFixture();
    const sameTime = sportsTestDate(2 * 60 * 60_000);
    tournament.matches = tournament.matches.map((match) => ({
      ...match,
      schedule: { ...match.schedule, startDate: sameTime },
    }));
    publicReader.publicTournament.mockResolvedValue(tournament);

    const result = await service().currentUserTournament({ majorEventId: 'major-event-1' }, 'person-1');

    expect(result.orderedMatches.map((match) => match.id)).toEqual(['player-match', 'team-match', 'unrelated-earlier']);
    expect(result.imageLicenseAgreementAccepted).toBe(false);
  });

  it('filters self-subscription categories to active registrations of the selected team', async () => {
    const tournament = {
      ...sportsCurrentUserTournamentFixture(),
      categories: [
        { id: 'category-available' },
        { id: 'category-unregistered' },
        { id: 'category-finished' },
      ],
    };
    publicReader.publicTournament.mockResolvedValue(tournament);
    prisma.sportsCategory.findMany.mockResolvedValue([{ id: 'category-available' }]);

    const result = await service().currentUserTournament({ tournamentId: 'tournament-1' }, 'person-1', 'team-1');

    expect(result.tournament.categories).toEqual([{ id: 'category-available' }]);
    expect(prisma.sportsCategory.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tournamentId: 'tournament-1',
        deletedAt: null,
        status: { in: ['REGISTRATION_OPEN', 'ACTIVE'] },
        registrations: {
          some: expect.objectContaining({
            teamId: 'team-1',
            deletedAt: null,
            status: { in: ['APPROVED', 'WAITING_PAYMENT', 'ACTIVE'] },
          }),
        },
      }),
      select: { id: true },
    });
  });

  it('maps current-user operations with anonymized names and JSON role metadata', async () => {
    const checkedInAt = sportsTestDate(-60_000);
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      revision: 3,
      state: 'CHECK_IN',
      eventId: 'event-1',
      categoryId: 'category-1',
      category: { id: 'category-1', tournament: { id: 'tournament-1' } },
      notes: 'Observação operacional',
      occurrences: [{ type: 'WARNING' }],
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
      rosters: [
        {
          id: 'roster-1',
          registrationId: 'registration-home',
          revision: 2,
          status: 'APPROVED',
          registration: { team: sportsPublicTeamRecord() },
          entries: [
            {
              id: 'entry-1',
              role: 'PLAYER',
              status: 'APPROVED',
              checkedInAt,
              shirtNumber: '10',
              roleMetadata: { position: 'GOALKEEPER' },
              registrationMember: {
                teamMember: {
                  participant: { personId: 'person-athlete-1', person: { name: 'Ana Beatriz de Souza' } },
                },
              },
            },
          ],
        },
      ],
    });
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([
      {
        id: 'official-assignment-1',
        matchId: 'match-1',
        categoryId: null,
        role: 'REFEREE',
        assignedAt: sportsTestDate(-120_000),
        person: {
          id: 'person-official-1',
          name: 'Mariana Clara dos Santos',
          attendances: [{ status: 'PRESENT', attendedAt: checkedInAt }],
        },
      },
    ]);

    const result = await service().currentUserMatchOperations('match-1');

    expect(result.occurrencesJson).toBe('[{"type":"WARNING"}]');
    expect(result.officials).toEqual([
      {
        id: 'official-assignment-1',
        attendanceSyncKey: expect.any(String),
        name: 'Mariana S.',
        role: 'REFEREE',
        checkedInAt,
      },
    ]);
    expect(result.rosters[0]).toEqual(
      expect.objectContaining({
        team: expect.objectContaining({ id: 'team-home' }),
        entries: [
          expect.objectContaining({
            name: 'Ana Souza',
            checkedInAt,
            roleMetadataJson: '{"position":"GOALKEEPER"}',
          }),
        ],
      }),
    );
  });

  it('reports a missing current-user operations match', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue(null);
    await expect(service().currentUserMatchOperations('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses the latest match-scoped official check-in action for removal', async () => {
    const checkedInAt = sportsTestDate(-60_000);
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      revision: 5,
      state: 'LIVE',
      eventId: 'event-1',
      categoryId: 'category-1',
      category: { id: 'category-1', tournament: { id: 'tournament-1' } },
      notes: null,
      occurrences: [],
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
      actions: [
        {
          payload: {
            kind: 'OFFICIAL_CHECK_IN',
            officialAssignmentId: 'official-assignment-1',
            personId: 'person-official-1',
            checkedInAt: checkedInAt.toISOString(),
            present: true,
          },
        },
        {
          payload: {
            kind: 'OFFICIAL_CHECK_IN',
            officialAssignmentId: 'official-assignment-1',
            personId: 'person-official-1',
            checkedInAt: sportsTestDate().toISOString(),
            present: false,
          },
        },
      ],
      rosters: [],
    });
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([
      {
        id: 'official-assignment-1',
        matchId: 'match-1',
        categoryId: null,
        role: 'REFEREE',
        assignedAt: sportsTestDate(-120_000),
        person: {
          id: 'person-official-1',
          name: 'Mariana Clara dos Santos',
          attendances: [{ status: 'PRESENT', attendedAt: checkedInAt }],
        },
      },
    ]);

    const result = await service().currentUserMatchOperations('match-1');

    expect(result.officials).toEqual([
      {
        id: 'official-assignment-1',
        attendanceSyncKey: expect.any(String),
        name: 'Mariana S.',
        role: 'REFEREE',
        checkedInAt: null,
      },
    ]);
  });

  it('synchronizes an athlete and official check-in for the same person', async () => {
    const checkedInAt = sportsTestDate(-60_000);
    const sharedPerson = {
      id: 'person-shared',
      name: 'Ana Beatriz de Souza',
      attendances: [],
    };
    const baseMatch = {
      id: 'match-1',
      revision: 5,
      state: 'CHECK_IN',
      eventId: 'event-1',
      categoryId: 'category-1',
      category: { id: 'category-1', tournament: { id: 'tournament-1' } },
      notes: null,
      occurrences: [],
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
      rosters: [
        {
          id: 'roster-1',
          registrationId: 'registration-home',
          revision: 2,
          status: 'APPROVED',
          registration: { team: sportsPublicTeamRecord() },
          entries: [
            {
              id: 'entry-shared',
              role: 'PLAYER',
              status: 'APPROVED',
              checkedInAt: null,
              shirtNumber: '10',
              roleMetadata: null,
              registrationMember: {
                teamMember: { participant: { personId: sharedPerson.id, person: { name: sharedPerson.name } } },
              },
            },
          ],
        },
      ],
    };
    prisma.sportsMatch.findFirst
      .mockResolvedValueOnce({
        ...baseMatch,
        actions: [
          {
            payload: {
              kind: 'OFFICIAL_CHECK_IN',
              officialAssignmentId: 'official-assignment-shared',
              personId: sharedPerson.id,
              checkedInAt: checkedInAt.toISOString(),
              present: true,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        ...baseMatch,
        rosters: baseMatch.rosters.map((roster) => ({
          ...roster,
          entries: roster.entries.map((entry) => ({ ...entry, checkedInAt })),
        })),
        actions: [
          {
            payload: {
              kind: 'ROSTER_ENTRY_CHECK_IN',
              rosterEntryId: 'entry-shared',
              checkedInAt: sportsTestDate().toISOString(),
              present: false,
            },
          },
        ],
      });
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([
      {
        id: 'official-assignment-shared',
        matchId: 'match-1',
        categoryId: null,
        role: 'REFEREE',
        assignedAt: sportsTestDate(-120_000),
        person: sharedPerson,
      },
    ]);

    const registered = await service().currentUserMatchOperations('match-1');
    expect(registered.rosters[0].entries[0].checkedInAt).toEqual(checkedInAt);
    expect(registered.officials[0].checkedInAt).toEqual(checkedInAt);
    expect(registered.rosters[0].entries[0].attendanceSyncKey).toBe(registered.officials[0].attendanceSyncKey);

    const removed = await service().currentUserMatchOperations('match-1');
    expect(removed.rosters[0].entries[0].checkedInAt).toBeNull();
    expect(removed.officials[0].checkedInAt).toBeNull();
  });

  it('delegates representative workspace reads to the dedicated privacy reader', async () => {
    const delegated = jest
      .spyOn(SportsReadRepresentativeService.prototype, 'representativeTeamWorkspace')
      .mockResolvedValueOnce({ team: { id: 'team-1' } } as never);

    await expect(service().representativeTeamWorkspace('team-1', 'person-1')).resolves.toEqual({
      team: { id: 'team-1' },
    });
    expect(delegated).toHaveBeenCalledWith('team-1', 'person-1');
  });

  it('maps eligible lineup members and an existing roster without exposing full names', async () => {
    const checkedInAt = sportsTestDate(-30_000);
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      revision: 4,
      categoryId: 'category-1',
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
    });
    prisma.sportsRegistrationMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        role: 'CAPTAIN',
        teamMember: { participant: { person: { name: 'Carlos Eduardo Lima' } } },
      },
    ]);
    prisma.sportsMatchRoster.findFirst.mockResolvedValue({
      id: 'roster-1',
      revision: 2,
      status: 'SUBMITTED',
      entries: [
        {
          id: 'entry-1',
          registrationMemberId: 'member-1',
          role: 'CAPTAIN',
          status: 'APPROVED',
          checkedInAt,
          shirtNumber: '7',
          roleMetadata: null,
        },
      ],
    });

    const result = await service().currentUserLineup('match-1', 'registration-home');

    expect(result.eligibleMembers).toEqual([
      {
        registrationMemberId: 'member-1',
        name: 'Carlos Lima',
        role: 'CAPTAIN',
        shirtNumber: '7',
      },
    ]);
    expect(result.roster?.entries[0]).toEqual(expect.objectContaining({ roleMetadataJson: null, checkedInAt }));
  });

  it('falls back to the category assignment shirt number when the roster entry is unset', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      revision: 4,
      categoryId: 'category-1',
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
    });
    prisma.sportsRegistrationMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        role: 'PLAYER',
        shirtNumber: '12',
        teamMember: { participant: { person: { name: 'Carlos Eduardo Lima' } } },
      },
    ]);
    prisma.sportsMatchRoster.findFirst.mockResolvedValue({
      id: 'roster-1',
      revision: 2,
      status: 'SUBMITTED',
      entries: [
        {
          id: 'entry-1',
          registrationMemberId: 'member-1',
          role: 'PLAYER',
          status: 'APPROVED',
          checkedInAt: null,
          shirtNumber: null,
          roleMetadata: null,
        },
      ],
    });

    const result = await service().currentUserLineup('match-1', 'registration-home');

    expect(result.eligibleMembers).toEqual([
      {
        registrationMemberId: 'member-1',
        name: 'Carlos Lima',
        role: 'PLAYER',
        shirtNumber: '12',
      },
    ]);
  });

  it('reports a lineup registration that does not participate and preserves an absent roster as null', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'match-1',
      revision: 1,
      categoryId: 'category-1',
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
    });
    const reader = service();

    await expect(reader.currentUserLineup('match-1', 'registration-other')).rejects.toBeInstanceOf(NotFoundException);
    await expect(reader.currentUserLineup('match-1', 'registration-home')).resolves.toEqual(
      expect.objectContaining({ roster: null, eligibleMembers: [] }),
    );
  });

  function service(): SportsReadCurrentUserService {
    return new SportsReadCurrentUserService(prisma as never, authorization as never, publicReader as never);
  }
});
