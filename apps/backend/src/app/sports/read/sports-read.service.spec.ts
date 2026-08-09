import { ForbiddenException } from '@nestjs/common';
import { SportsReadAdminService } from './sports-read-admin.service';
import { SportsReadService } from './sports-read.service';

describe('SportsReadService admin tournament list', () => {
  const authorizationPolicy = {
    accessibleEventTargets: jest.fn(),
    assertPermissions: jest.fn(),
  };
  const prisma = {
    sportsTournament: {
      findMany: jest.fn(),
    },
    sportsMatch: {
      findFirst: jest.fn(),
    },
    sportsMatchAction: {
      findMany: jest.fn(),
    },
    sportsRegistrationMember: {
      findMany: jest.fn(),
    },
    sportsMatchRoster: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not enumerate tournaments when the actor has no readable sports scope', async () => {
    authorizationPolicy.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(),
      eventGroupIds: new Set(),
      majorEventIds: new Set(),
    });
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);

    await expect(service.adminTournamentList(undefined, {})).resolves.toEqual([]);
    expect(prisma.sportsTournament.findMany).not.toHaveBeenCalled();
  });

  it('returns queue counts while preserving a scoped tournament filter', async () => {
    authorizationPolicy.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['event-1']),
      eventGroupIds: new Set(['group-1']),
      majorEventIds: new Set(['major-1']),
    });
    prisma.sportsTournament.findMany.mockResolvedValue([
      {
        id: 'tournament-1',
        majorEventId: 'major-1',
        status: 'ACTIVE',
        scoringMode: 'BOTH',
        selfSubscriptionEnabled: true,
        allowPlayerMultipleTeams: false,
        revision: 3,
        finishedAt: null,
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        createdById: 'admin-1',
        updatedAt: new Date('2026-08-01T11:00:00.000Z'),
        updatedById: 'admin-1',
        deletedAt: null,
        majorEvent: {
          id: 'major-1',
          name: 'Jogos Universitários',
          emoji: '🏆',
          startDate: new Date('2026-09-01T10:00:00.000Z'),
          endDate: new Date('2026-09-08T22:00:00.000Z'),
          isPaymentRequired: true,
        },
        _count: {
          categories: 4,
          teams: 12,
          playerApplications: 5,
        },
        categories: [{ _count: { matches: 2, registrations: 3 } }, { _count: { matches: 1, registrations: 0 } }],
        teams: [{ _count: { changeRequests: 4 } }],
      },
    ]);
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);

    const result = await service.adminTournamentList(undefined, {
      query: ' universitários ',
      skip: 5,
      take: 10,
    });

    expect(prisma.sportsTournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 10,
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ majorEventId: { in: ['major-1'] } }]),
          majorEvent: {
            deletedAt: null,
            name: { contains: 'universitários', mode: 'insensitive' },
          },
        }),
      }),
    );
    expect(result[0]).toMatchObject({
      categoryCount: 4,
      teamCount: 12,
      pendingApplicationCount: 5,
      pendingReviewCount: 10,
      majorEvent: { id: 'major-1', name: 'Jogos Universitários' },
      tournament: { id: 'tournament-1', revision: 3 },
    });
  });

  it('lists pending actions across the tournament within read and review scopes', async () => {
    authorizationPolicy.assertPermissions.mockResolvedValue(undefined);
    authorizationPolicy.accessibleEventTargets
      .mockResolvedValueOnce({
        eventIds: new Set(['event-1']),
        eventGroupIds: new Set(),
        majorEventIds: new Set(),
      })
      .mockResolvedValueOnce({
        eventIds: new Set(),
        eventGroupIds: new Set(['group-1']),
        majorEventIds: new Set(),
      });
    prisma.sportsMatchAction.findMany.mockResolvedValue([
      {
        id: 'action-1',
        matchId: 'match-1',
        clientId: 'client-1',
        payloadHash: 'hash-1',
        baseRevision: 4,
        sequence: 5,
        type: 'SCORE_DELTA',
        payload: { side: 'HOME', amount: 1 },
        reviewStatus: 'PENDING',
        scorerRosterEntryId: null,
        actorPersonId: null,
        actorUserId: null,
        actorRole: 'OFFICIAL',
        authoredAt: new Date('2026-08-09T12:00:00.000Z'),
        submittedAt: new Date('2026-08-09T12:01:00.000Z'),
        offline: true,
        reviewedAt: null,
        reviewedById: null,
        reviewMessage: null,
        createdAt: new Date('2026-08-09T12:01:00.000Z'),
        updatedAt: new Date('2026-08-09T12:01:00.000Z'),
        match: {
          id: 'match-1',
          eventId: 'event-1',
          categoryId: 'category-1',
          stageId: null,
          venueId: null,
          homeRegistrationId: 'registration-home',
          awayRegistrationId: 'registration-away',
          state: 'LIVE',
          canonicalState: 'LIVE',
          reviewStatus: 'PENDING',
          scoreboard: { home: 1, away: 0, periods: [], activePeriodNumber: null },
          canonicalScoreboard: { home: 1, away: 0, periods: [], activePeriodNumber: null },
          winnerRegistrationId: null,
          loserRegistrationId: null,
          lossReason: null,
          lossReasonDetail: null,
          drawWillReschedule: null,
          notes: null,
          occurrences: [],
          livestreamProvider: null,
          livestreamUrl: null,
          timerStartedAt: null,
          timerPausedAt: null,
          elapsedBeforePauseMs: 0,
          roundNumber: 1,
          bracketPosition: 1,
          groupKey: null,
          winnerAdvancesToId: null,
          winnerAdvancesToSide: null,
          loserAdvancesToId: null,
          loserAdvancesToSide: null,
          replayOfMatchId: null,
          revision: 6,
          operationSequence: 5,
          createdAt: new Date('2026-08-09T10:00:00.000Z'),
          createdById: 'admin-1',
          updatedAt: new Date('2026-08-09T12:01:00.000Z'),
          updatedById: 'admin-1',
          deletedAt: null,
          event: {
            id: 'event-1',
            name: 'Atlética A × Atlética B',
            startDate: new Date('2026-08-09T11:00:00.000Z'),
            endDate: new Date('2026-08-09T12:30:00.000Z'),
          },
          category: { id: 'category-1', name: 'Futsal masculino' },
          homeRegistration: { team: { name: 'Atlética A' } },
          awayRegistration: { team: { name: 'Atlética B' } },
        },
      },
    ]);
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);

    const result = await service.adminMatchActionReviewQueue({} as never, 'tournament-1');

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      {},
      ['sports-tournament#read'],
      { sportsTournamentId: 'tournament-1' },
    );
    expect(prisma.sportsMatchAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviewStatus: 'PENDING',
          match: expect.objectContaining({
            category: { deletedAt: null, tournamentId: 'tournament-1' },
            AND: [
              { OR: [{ eventId: { in: ['event-1'] } }] },
              { OR: [{ category: { eventGroupId: { in: ['group-1'] } } }] },
            ],
          }),
        }),
        orderBy: [{ authoredAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(result).toMatchObject([
      {
        action: { id: 'action-1', matchId: 'match-1', reviewStatus: 'PENDING' },
        match: { id: 'match-1', eventId: 'event-1' },
        categoryName: 'Futsal masculino',
        homeTeamName: 'Atlética A',
        awayTeamName: 'Atlética B',
      },
    ]);
  });

  it('returns only approved operational roster entries with redacted player names', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      revision: 7,
      state: 'CHECK_IN',
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
      rosters: [
        {
          id: 'roster-home',
          registrationId: 'registration-home',
          revision: 3,
          status: 'APPROVED',
          registration: {
            team: {
              id: 'team-home',
              name: 'Atlética A',
              institution: 'Universidade A',
              logoSha256: null,
            },
          },
          entries: [
            {
              id: 'entry-safe-1',
              role: 'PLAYER',
              status: 'APPROVED',
              checkedInAt: new Date('2026-08-01T12:00:00.000Z'),
              registrationMember: {
                teamMember: {
                  participant: {
                    person: { name: 'Ana Maria de Souza' },
                  },
                },
              },
            },
          ],
        },
      ],
    });
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);

    const result = await service.currentUserMatchOperations('match-1');

    expect(prisma.sportsMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'match-1', deletedAt: null },
        select: expect.objectContaining({
          rosters: expect.objectContaining({
            where: expect.objectContaining({ status: 'APPROVED' }),
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      matchId: 'match-1',
      revision: 7,
      homeRegistrationId: 'registration-home',
      rosters: [
        {
          id: 'roster-home',
          registrationId: 'registration-home',
          entries: [
            {
              id: 'entry-safe-1',
              name: 'Ana Souza',
              role: 'PLAYER',
              status: 'APPROVED',
            },
          ],
        },
      ],
    });
  });

  it('limits lineup reads to eligible members in the selected match registration', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      revision: 9,
      categoryId: 'category-1',
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
    });
    prisma.sportsRegistrationMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        role: 'CAPTAIN',
        teamMember: {
          participant: {
            person: { name: 'João Pedro dos Santos' },
          },
        },
      },
    ]);
    prisma.sportsMatchRoster.findFirst.mockResolvedValue({
      id: 'roster-1',
      revision: 4,
      status: 'SUBMITTED',
      entries: [
        {
          id: 'entry-1',
          registrationMemberId: 'member-1',
          role: 'CAPTAIN',
          status: 'SUBMITTED',
          checkedInAt: null,
        },
      ],
    });
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);

    const result = await service.currentUserLineup('match-1', 'registration-home');

    expect(prisma.sportsMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'match-1',
          OR: [{ homeRegistrationId: 'registration-home' }, { awayRegistrationId: 'registration-home' }],
        }),
      }),
    );
    expect(prisma.sportsRegistrationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          registrationId: 'registration-home',
          categoryId: 'category-1',
          eligibility: 'ELIGIBLE',
        }),
      }),
    );
    expect(result).toMatchObject({
      matchId: 'match-1',
      matchRevision: 9,
      registrationId: 'registration-home',
      eligibleMembers: [
        {
          registrationMemberId: 'member-1',
          name: 'João Santos',
          role: 'CAPTAIN',
        },
      ],
      roster: {
        id: 'roster-1',
        revision: 4,
      },
    });
  });
});

describe('SportsReadAdminService team privacy', () => {
  it('does not return team representatives to a category-scoped reader', async () => {
    const authorizationPolicy = {
      assertPermissions: jest.fn().mockImplementation(
        async (
          _user: unknown,
          _permissions: unknown,
          context: { sportsTournamentId?: string; sportsCategoryId?: string; sportsTeamId?: string },
        ) => {
          if (context.sportsTournamentId) {
            throw new ForbiddenException();
          }
          if (!context.sportsTeamId && !context.sportsCategoryId) {
            throw new ForbiddenException();
          }
        },
      ),
    };
    const prisma = {
      sportsTeam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'team-1',
          tournamentId: 'tournament-1',
          name: 'Equipe',
          institution: null,
          status: 'ACTIVE',
          logoObjectKey: null,
          logoSha256: null,
          logoMimeType: null,
          logoSizeBytes: null,
          revision: 1,
          fieldRevisions: {},
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
          createdById: 'admin-1',
          updatedAt: new Date('2026-08-01T10:00:00.000Z'),
          updatedById: 'admin-1',
          deletedAt: null,
        }),
      },
      sportsTeamRepresentative: {
        findMany: jest.fn(),
      },
      sportsRegistration: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'registration-1',
            teamId: 'team-1',
            categoryId: 'category-1',
            status: 'ACTIVE',
            seed: null,
            formAnswers: null,
            formSchemaSnapshot: null,
            revision: 1,
            createdAt: new Date('2026-08-01T10:00:00.000Z'),
            createdById: 'admin-1',
            updatedAt: new Date('2026-08-01T10:00:00.000Z'),
            updatedById: 'admin-1',
            deletedAt: null,
          },
        ]),
      },
      sportsTeamMember: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      sportsTeamChangeRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new SportsReadAdminService(prisma as never, authorizationPolicy as never);

    const result = await service.adminTeam({} as never, 'team-1');

    expect(result.representatives).toEqual([]);
    expect(prisma.sportsTeamRepresentative.findMany).not.toHaveBeenCalled();
    expect(result.registrations).toHaveLength(1);
  });
});
