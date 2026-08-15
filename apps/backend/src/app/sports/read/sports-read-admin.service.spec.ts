import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { sportsAdminOfficialAssignmentRecord, sportsAdminReadRecords, sportsTestDate } from '../testing/sports-backend.fixtures';
import { SportsReadAdminService } from './sports-read-admin.service';
import { SportsReadAdminListService } from './sports-read-admin-list.service';

describe('SportsReadAdminService', () => {
  const user = { sub: 'admin-1' };
  const prisma = {
    sportsTournament: { findFirst: jest.fn() },
    sportsCategory: { findFirst: jest.fn(), findMany: jest.fn() },
    sportsTeam: { findFirst: jest.fn(), findMany: jest.fn() },
    sportsTournamentScoreEntry: { findMany: jest.fn() },
    sportsVenue: { findMany: jest.fn() },
    sportsStage: { findMany: jest.fn() },
    sportsStanding: { findMany: jest.fn() },
    sportsCategoryPlacement: { findMany: jest.fn() },
    sportsRegistration: { findFirst: jest.fn(), findMany: jest.fn() },
    sportsRegistrationMember: { findMany: jest.fn() },
    sportsMatchRoster: { findMany: jest.fn() },
    sportsMatch: { findFirst: jest.fn(), findMany: jest.fn() },
    sportsMatchAction: { findMany: jest.fn() },
    sportsOfficialAssignment: { findMany: jest.fn() },
    sportsTeamRepresentative: { findMany: jest.fn() },
    sportsTeamMember: { findMany: jest.fn() },
    sportsTeamChangeRequest: { findMany: jest.fn() },
    sportsTournamentParticipant: { findMany: jest.fn() },
  };
  const authorization = {
    assertPermissions: jest.fn(),
    accessibleEventTargets: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authorization.assertPermissions.mockResolvedValue(undefined);
    prisma.sportsRegistrationMember.findMany.mockResolvedValue([]);
    prisma.sportsMatchRoster.findMany.mockResolvedValue([]);
    prisma.sportsMatchAction.findMany.mockResolvedValue([]);
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([]);
    prisma.sportsTournamentScoreEntry.findMany.mockResolvedValue([]);
    prisma.sportsVenue.findMany.mockResolvedValue([]);
    prisma.sportsStage.findMany.mockResolvedValue([]);
    prisma.sportsStanding.findMany.mockResolvedValue([]);
    prisma.sportsCategoryPlacement.findMany.mockResolvedValue([]);
    prisma.sportsTeamRepresentative.findMany.mockResolvedValue([]);
    prisma.sportsTeamMember.findMany.mockResolvedValue([]);
    prisma.sportsTeamChangeRequest.findMany.mockResolvedValue([]);
    prisma.sportsTournamentParticipant.findMany.mockResolvedValue([]);
  });

  it('maps a fully readable tournament and applies unrestricted visibility filters', async () => {
    const records = sportsAdminReadRecords();
    authorization.accessibleEventTargets.mockResolvedValue(null);
    prisma.sportsTournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.sportsCategory.findMany.mockResolvedValue([records.category]);
    prisma.sportsTeam.findMany.mockResolvedValue([
      {
        ...records.team,
        registrations: [
          {
            id: 'registration-1',
            categoryId: 'category-1',
            status: 'APPROVED',
            category: { name: 'Futsal', eventGroup: { emoji: '' } },
          },
        ],
      },
    ]);
    prisma.sportsTournamentScoreEntry.findMany.mockResolvedValue([{ id: 'score-1' }]);
    prisma.sportsVenue.findMany.mockResolvedValue([{ id: 'venue-1' }]);
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([{ id: 'official-1' }]);
    const service = new SportsReadAdminService(prisma as never, authorization as never);

    const result = await service.adminTournament(user as never, 'tournament-1');

    expect(result.categories[0]?.emoji).toBe('🏅');
    expect(result.teamSummaries[0]?.registrations[0]?.categoryEmoji).toBe('🏅');
    expect(result.scoreEntries).toEqual([{ id: 'score-1' }]);
    expect(result.officials).toEqual([{ id: 'official-1' }]);
    expect(prisma.sportsTournament.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tournament-1', deletedAt: null } }),
    );
  });

  it('keeps official names visible while omitting contact fields without person read permission', async () => {
    const official = {
      ...sportsAdminOfficialAssignmentRecord(),
      person: {
        id: 'person-1',
        name: 'Árbitra Ana',
        email: 'ana@example.com',
        phone: '+55 18 99999-0000',
      },
    };
    authorization.accessibleEventTargets.mockResolvedValue(null);
    authorization.assertPermissions.mockImplementation(
      async (_user: unknown, permissions: string[]) => {
        if (permissions.includes(Permission.Person.Read)) {
          throw new ForbiddenException();
        }
      },
    );
    prisma.sportsTournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.sportsCategory.findMany.mockResolvedValue([]);
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([official]);

    const result = await new SportsReadAdminService(prisma as never, authorization as never).adminTournament(
      user as never,
      'tournament-1',
    );

    expect(result.officials[0]?.person).toEqual({ id: 'person-1', name: 'Árbitra Ana' });
    expect(prisma.sportsOfficialAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { person: { select: { id: true, name: true } } } }),
    );
  });

  it('keeps an unregistered draft team visible in a scoped tournament workspace', async () => {
    const records = sportsAdminReadRecords();
    const scopedTargets = {
      eventIds: new Set<string>(),
      eventGroupIds: new Set<string>(),
      majorEventIds: new Set(['major-event-1']),
    };
    authorization.accessibleEventTargets.mockResolvedValue(scopedTargets);
    prisma.sportsTournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.sportsCategory.findMany.mockResolvedValue([records.category]);
    prisma.sportsTeam.findMany.mockResolvedValue([
      {
        ...records.team,
        status: 'DRAFT',
        registrations: [],
      },
    ]);

    const result = await new SportsReadAdminService(prisma as never, authorization as never).adminTournament(
      user as never,
      'tournament-1',
    );

    expect(result.teams[0]?.status).toBe('DRAFT');
    expect(prisma.sportsTeam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tournamentId: 'tournament-1',
          deletedAt: null,
          OR: [{ tournament: { majorEventId: { in: ['major-event-1'] } } }],
        },
      }),
    );
  });

  it('includes direct participants and their actual team/category relationships', async () => {
    authorization.accessibleEventTargets.mockResolvedValue(null);
    prisma.sportsTournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.sportsCategory.findMany.mockResolvedValue([]);
    prisma.sportsTeam.findMany.mockResolvedValue([]);
    prisma.sportsTournamentParticipant.findMany.mockResolvedValue([
      {
        id: 'participant-1',
        source: 'TEAM_ASSIGNMENT',
        status: 'ACTIVE',
        paymentStatus: 'NOT_REQUIRED',
        person: { id: 'person-1', name: 'Pessoa Atleta' },
        teamMemberships: [
          {
            id: 'member-1',
            status: 'APPROVED',
            team: { id: 'team-1', name: 'Equipe Azul' },
            categoryAssignments: [
              {
                registration: {
                  category: { id: 'category-1', name: 'Futsal', division: 'Livre' },
                },
              },
            ],
          },
        ],
      },
    ]);

    const result = await new SportsReadAdminService(prisma as never, authorization as never).adminTournament(
      user as never,
      'tournament-1',
    );

    expect(result.participants).toEqual([
      expect.objectContaining({
        id: 'participant-1',
        person: { id: 'person-1', name: 'Pessoa Atleta' },
        teams: [
          expect.objectContaining({
            memberId: 'member-1',
            teamName: 'Equipe Azul',
            categories: [{ id: 'category-1', name: 'Futsal', division: 'Livre' }],
          }),
        ],
      }),
    ]);
  });

  it('delegates tournament listing to the dedicated filtered list reader', async () => {
    const delegated = jest
      .spyOn(SportsReadAdminListService.prototype, 'adminTournamentList')
      .mockResolvedValueOnce([{ id: 'tournament-1' }] as never);
    const service = new SportsReadAdminService(prisma as never, authorization as never);

    await expect(service.adminTournamentList(user as never)).resolves.toEqual([{ id: 'tournament-1' }]);
    expect(delegated).toHaveBeenCalledWith(user);
  });

  it('reports an event-scoped tournament hidden by visibility rules as not found', async () => {
    authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['event-1']),
      eventGroupIds: new Set(),
      majorEventIds: new Set(),
    });
    prisma.sportsTournament.findFirst.mockResolvedValue(null);
    prisma.sportsCategory.findMany.mockResolvedValue([]);

    await expect(
      new SportsReadAdminService(prisma as never, authorization as never).adminTournament(user as never, 'hidden'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sportsTournament.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [expect.objectContaining({ categories: expect.objectContaining({ some: expect.any(Object) }) })],
        }),
      }),
    );
  });

  it('propagates unexpected permission infrastructure failures', async () => {
    authorization.accessibleEventTargets.mockResolvedValue(null);
    authorization.assertPermissions.mockRejectedValue(new Error('policy unavailable'));
    prisma.sportsTournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.sportsCategory.findMany.mockResolvedValue([]);

    await expect(
      new SportsReadAdminService(prisma as never, authorization as never).adminTournament(
        user as never,
        'tournament-1',
      ),
    ).rejects.toThrow('policy unavailable');
  });

  it('returns only the always-readable tournament sections when scoped resources are forbidden', async () => {
    authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(),
      eventGroupIds: new Set(),
      majorEventIds: new Set(['major-event-1']),
    });
    authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    prisma.sportsTournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.sportsCategory.findMany.mockResolvedValue([]);
    prisma.sportsVenue.findMany.mockResolvedValue([{ id: 'venue-1' }]);
    const result = await new SportsReadAdminService(prisma as never, authorization as never).adminTournament(
      user as never,
      'tournament-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        categories: [],
        teams: [],
        scoreEntries: [],
        officials: [],
        venues: [{ id: 'venue-1' }],
      }),
    );
    expect(prisma.sportsTeam.findMany).not.toHaveBeenCalled();
  });

  it('maps readable category sections and hides permission-gated sections', async () => {
    const records = sportsAdminReadRecords();
    authorization.accessibleEventTargets.mockResolvedValue(null);
    authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    prisma.sportsCategory.findFirst.mockResolvedValue(records.category);
    prisma.sportsStage.findMany.mockResolvedValue([{ id: 'stage-1', settings: {} }]);
    const result = await new SportsReadAdminService(prisma as never, authorization as never).adminCategory(
      user as never,
      'category-1',
    );

    expect(result.category.id).toBe('category-1');
    expect(result.stages[0]?.settingsJson).toBe('{}');
    expect(result.registrations).toEqual([]);
    expect(result.matches).toEqual([]);
    expect(result.standings).toEqual([]);
    expect(result.placements).toEqual([]);
    expect(result.officials).toEqual([]);
  });

  it('maps every allowed category section from shared read records', async () => {
    const records = sportsAdminReadRecords();
    authorization.accessibleEventTargets.mockResolvedValue(null);
    prisma.sportsCategory.findFirst.mockResolvedValue(records.category);
    prisma.sportsRegistration.findMany.mockResolvedValue([records.registration]);
    prisma.sportsStage.findMany.mockResolvedValue([{ id: 'stage-1', settings: { rounds: 2 } }]);
    prisma.sportsMatch.findMany.mockResolvedValue([records.match]);
    prisma.sportsStanding.findMany.mockResolvedValue([{ id: 'standing-1', tiebreakData: { goals: 3 } }]);
    prisma.sportsCategoryPlacement.findMany.mockResolvedValue([{ id: 'placement-1', placement: 1 }]);
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([{ id: 'official-1' }]);

    const result = await new SportsReadAdminService(prisma as never, authorization as never).adminCategory(
      user as never,
      'category-1',
    );

    expect(result.registrations[0]?.formAnswersJson).toBe('{"captain":true}');
    expect(result.stages[0]?.settingsJson).toBe('{"rounds":2}');
    expect(result.matches[0]?.scoreboard.homeScore).toBe(2);
    expect(result.standings[0]?.tiebreakDataJson).toBe('{"goals":3}');
    expect(result.placements).toEqual([{ id: 'placement-1', placement: 1 }]);
    expect(result.officials).toEqual([{ id: 'official-1' }]);
  });

  it('reports a category hidden by visibility scopes as not found', async () => {
    authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(),
      eventGroupIds: new Set(),
      majorEventIds: new Set(),
    });
    prisma.sportsCategory.findFirst.mockResolvedValue(null);

    await expect(
      new SportsReadAdminService(prisma as never, authorization as never).adminCategory(user as never, 'hidden'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('authorizes registration reads, maps privacy-safe members and roster metadata, and rejects missing records', async () => {
    const records = sportsAdminReadRecords();
    prisma.sportsRegistration.findFirst.mockResolvedValueOnce(records.registration).mockResolvedValueOnce(null);
    prisma.sportsRegistrationMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        registrationId: 'registration-1',
        categoryId: 'category-1',
        teamMemberId: 'team-member-1',
        role: 'PLAYER',
        eligibility: 'ELIGIBLE',
        category: { athleteIdentifierMode: 'NAME' },
        teamMember: { participant: { person: { id: 'person-1', name: 'Ana Beatriz de Souza' } } },
      },
    ]);
    prisma.sportsMatchRoster.findMany.mockResolvedValue([
      { id: 'roster-1', entries: [{ id: 'entry-1', roleMetadata: { position: 'GOALKEEPER' } }] },
    ]);
    const service = new SportsReadAdminService(prisma as never, authorization as never);

    const result = await service.adminRegistration(user as never, 'registration-1');
    expect(result.members[0]?.person.name).toBe('Ana Souza');
    expect(result.rosters[0]?.entries[0]?.roleMetadataJson).toBe('{"position":"GOALKEEPER"}');
    expect(authorization.assertPermissions).toHaveBeenCalledWith(user, [expect.any(String)], {
      sportsRegistrationId: 'registration-1',
    });

    await expect(service.adminRegistration(user as never, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exposes team members without registration links as administrative lineup candidates', async () => {
    const records = sportsAdminReadRecords();
    prisma.sportsRegistration.findFirst.mockResolvedValue(records.registration);
    prisma.sportsRegistrationMember.findMany.mockResolvedValue([]);
    prisma.sportsTeamMember.findMany.mockResolvedValue([
      {
        id: 'team-member-1',
        participant: {
          status: 'ACTIVE',
          person: { id: 'person-1', name: 'Ana Beatriz de Souza' },
        },
      },
    ]);
    const service = new SportsReadAdminService(prisma as never, authorization as never);

    const result = await service.adminRegistration(user as never, 'registration-1');

    expect(result.members).toEqual([]);
    expect(result.lineupMembers).toEqual([
      {
        id: 'team-member-1',
        registrationMemberId: null,
        teamMemberId: 'team-member-1',
        role: 'PLAYER',
        eligibility: 'ELIGIBLE',
        person: { id: 'person-1', name: 'Ana Souza' },
      },
    ]);
  });

  it('filters team registrations by readable categories and maps members, representatives, and reviews', async () => {
    const records = sportsAdminReadRecords();
    authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(),
      eventGroupIds: new Set(['event-group-1']),
      majorEventIds: new Set(),
    });
    prisma.sportsTeam.findFirst.mockResolvedValue(records.team);
    prisma.sportsRegistration.findMany.mockResolvedValue([records.registration]);
    prisma.sportsTeamRepresentative.findMany.mockResolvedValue([
      {
        id: 'representative-1',
        teamId: 'team-1',
        personId: 'person-1',
        person: { id: 'person-1', name: 'Carlos Eduardo Lima' },
        active: true,
        assignedAt: sportsTestDate(-60_000),
        revokedAt: null,
      },
    ]);
    prisma.sportsTeamMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        teamId: 'team-1',
        participantId: 'participant-1',
        status: 'APPROVED',
        revision: 1,
        participant: { person: { id: 'person-2', name: 'Ana Beatriz de Souza' } },
        categoryAssignments: [
          {
            id: 'assignment-1',
            registrationId: 'registration-1',
            categoryId: 'category-1',
            category: { name: 'Futsal', eventGroup: { emoji: '⚽' } },
          },
        ],
      },
    ]);
    prisma.sportsTeamChangeRequest.findMany.mockResolvedValue([
      { id: 'change-1', baseFieldRevisions: {}, delta: {}, resolvedDelta: null },
    ]);

    const result = await new SportsReadAdminService(prisma as never, authorization as never).adminTeam(
      user as never,
      'team-1',
    );

    expect(result.members[0]?.person.name).toBe('Ana Souza');
    expect(result.representatives[0]?.person.name).toBe('Carlos Lima');
    expect(result.registrations).toHaveLength(1);
    expect(result.changeRequests[0]?.deltaJson).toBe('{}');
    expect(prisma.sportsTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [expect.objectContaining({ registrations: expect.objectContaining({ some: expect.any(Object) }) })],
        }),
      }),
    );
  });

  it('reports a team hidden by its accessible-event scope as not found', async () => {
    authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['event-1']),
      eventGroupIds: new Set(),
      majorEventIds: new Set(),
    });
    prisma.sportsTeam.findFirst.mockResolvedValue(null);
    prisma.sportsRegistration.findMany.mockResolvedValue([]);

    await expect(
      new SportsReadAdminService(prisma as never, authorization as never).adminTeam(user as never, 'hidden-team'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sportsTeamMember.findMany).not.toHaveBeenCalled();
  });

  it('reads an unregistered team in a major-event team scope', async () => {
    const records = sportsAdminReadRecords();
    authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set<string>(),
      eventGroupIds: new Set<string>(),
      majorEventIds: new Set(['major-event-1']),
    });
    prisma.sportsTeam.findFirst.mockResolvedValue({ ...records.team, status: 'DRAFT' });
    prisma.sportsRegistration.findMany.mockResolvedValue([]);

    const result = await new SportsReadAdminService(prisma as never, authorization as never).adminTeam(
      user as never,
      'team-1',
    );

    expect(result.team.status).toBe('DRAFT');
    expect(prisma.sportsTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'team-1',
          deletedAt: null,
          OR: [{ tournament: { majorEventId: { in: ['major-event-1'] } } }],
        },
      }),
    );
  });

  it('filters members at query time when only some team categories are readable', async () => {
    const records = sportsAdminReadRecords();
    authorization.accessibleEventTargets.mockResolvedValue(null);
    authorization.assertPermissions.mockImplementation(
      async (_user: unknown, _permissions: unknown, context: Record<string, string>) => {
        if (context['sportsCategoryId'] === 'category-hidden') {
          throw new ForbiddenException();
        }
      },
    );
    prisma.sportsTeam.findFirst.mockResolvedValue(records.team);
    prisma.sportsRegistration.findMany.mockResolvedValue([
      records.registration,
      { ...records.registration, id: 'registration-hidden', categoryId: 'category-hidden' },
    ]);
    prisma.sportsTeamMember.findMany.mockResolvedValue([]);

    const result = await new SportsReadAdminService(prisma as never, authorization as never).adminTeam(
      user as never,
      'team-1',
    );

    expect(result.registrations.map((registration) => registration.id)).toEqual(['registration-1']);
    expect(prisma.sportsTeamMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryAssignments: {
            some: { categoryId: { in: ['category-1'] }, deletedAt: null },
          },
        }),
      }),
    );
  });

  it('propagates authorization failures before reading match review data', async () => {
    authorization.assertPermissions.mockRejectedValueOnce(new ForbiddenException());
    const service = new SportsReadAdminService(prisma as never, authorization as never);

    await expect(service.adminMatchReview(user as never, 'match-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sportsMatch.findFirst).not.toHaveBeenCalled();
  });

  it('maps a complete match review and reports a deleted match as not found', async () => {
    const records = sportsAdminReadRecords();
    prisma.sportsMatch.findFirst.mockResolvedValueOnce(records.match).mockResolvedValueOnce(null);
    prisma.sportsMatchAction.findMany.mockResolvedValue([{ id: 'action-1', payload: { amount: 1 } }]);
    prisma.sportsMatchRoster.findMany.mockResolvedValue([
      { id: 'roster-1', entries: [{ id: 'entry-1', roleMetadata: null }] },
    ]);
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([{ id: 'official-1' }]);
    const service = new SportsReadAdminService(prisma as never, authorization as never);

    const result = await service.adminMatchReview(user as never, 'match-1');
    expect(result.match.scoreboard.homeScore).toBe(2);
    expect(result.actions[0]?.payloadJson).toBe('{"amount":1}');
    expect(result.rosters[0]?.entries[0]?.roleMetadataJson).toBeNull();
    expect(result.officials).toEqual([{ id: 'official-1' }]);

    await expect(service.adminMatchReview(user as never, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns no pending review actions when either read or review grants have no targets', async () => {
    const emptyTargets = { eventIds: new Set(), eventGroupIds: new Set(), majorEventIds: new Set() };
    authorization.accessibleEventTargets.mockResolvedValueOnce(emptyTargets).mockResolvedValueOnce(null);
    const service = new SportsReadAdminService(prisma as never, authorization as never);

    await expect(service.adminMatchActionReviewQueue(user as never, 'tournament-1')).resolves.toEqual([]);
    expect(prisma.sportsMatchAction.findMany).not.toHaveBeenCalled();
  });

  it('intersects read and review scopes and maps pending review queue context', async () => {
    const records = sportsAdminReadRecords();
    const readTargets = { eventIds: new Set(['event-1']), eventGroupIds: new Set(), majorEventIds: new Set() };
    const reviewTargets = {
      eventIds: new Set(),
      eventGroupIds: new Set(['event-group-1']),
      majorEventIds: new Set(['major-event-1']),
    };
    authorization.accessibleEventTargets.mockResolvedValueOnce(readTargets).mockResolvedValueOnce(reviewTargets);
    prisma.sportsMatchAction.findMany.mockResolvedValue([
      {
        id: 'action-1',
        payload: { amount: 1 },
        match: {
          ...records.match,
          category: { id: 'category-1', name: 'Futsal' },
          homeRegistration: { team: { name: 'Azul' } },
          awayRegistration: null,
        },
      },
    ]);
    const service = new SportsReadAdminService(prisma as never, authorization as never);

    const result = await service.adminMatchActionReviewQueue(user as never, 'tournament-1');

    expect(result).toEqual([
      expect.objectContaining({ categoryName: 'Futsal', homeTeamName: 'Azul', awayTeamName: null }),
    ]);
    expect(prisma.sportsMatchAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviewStatus: 'PENDING',
          match: expect.objectContaining({ AND: [expect.any(Object), expect.any(Object)] }),
        }),
      }),
    );
  });

  it('treats null read and review targets as unrestricted in the pending queue', async () => {
    authorization.accessibleEventTargets.mockResolvedValue(null);
    prisma.sportsMatchAction.findMany.mockResolvedValue([]);

    await expect(
      new SportsReadAdminService(prisma as never, authorization as never).adminMatchActionReviewQueue(
        user as never,
        'tournament-1',
      ),
    ).resolves.toEqual([]);
    expect(prisma.sportsMatchAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ match: expect.objectContaining({ AND: [{}, {}] }) }),
      }),
    );
  });
});
