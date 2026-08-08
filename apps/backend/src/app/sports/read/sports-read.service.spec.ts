import { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException } from '@nestjs/common';
import {
  SportsLossReason,
  SportsFormat,
  SportsMatchActionType,
  SportsMatchState,
  SportsOfficialRole,
  SportsReviewStatus,
  SportsRosterRole,
  SportsPreset,
  SportsStageType,
} from '@prisma/client';
import { SportsReadService } from './sports-read.service';

describe('SportsReadService', () => {
  const teamA = { id: 'team-a', name: 'Equipe A', institution: null };
  const teamB = { id: 'team-b', name: 'Equipe B', institution: null };

  it('checks the authoritative tournament scope before returning admin review data', async () => {
    const authorizationPolicy = {
      assertPermissions: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      sportsTournament: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tournament-1',
          majorEventId: 'major-event-1',
          majorEvent: {},
          status: 'DRAFT',
          scoringMode: 'PER_SPORT',
          selfSubscriptionEnabled: false,
          allowPlayerMultipleTeams: false,
          revision: 1,
          finishedAt: null,
          createdAt: new Date(),
          createdById: null,
          updatedAt: new Date(),
          updatedById: null,
          deletedAt: null,
        }),
      },
      sportsCategory: { findMany: jest.fn().mockResolvedValue([]) },
      sportsTeam: { findMany: jest.fn().mockResolvedValue([]) },
      sportsTournamentScoreEntry: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);
    const user = { sub: 'admin-1' };

    await service.adminTournament(user as never, 'tournament-1');

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.SportsTournament.Read],
      { sportsTournamentId: 'tournament-1' },
    );
  });

  it('redacts people and withholds review data from team-read-only administrators', async () => {
    const changeRequestFindMany = jest.fn();
    const authorizationPolicy = {
      assertPermissions: jest.fn(
        async (_user: unknown, permissions: Permission[]) => {
          if (permissions.includes(Permission.SportsTeam.Review)) {
            throw new ForbiddenException();
          }
        },
      ),
    };
    const service = new SportsReadService(
      {
        sportsTeam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'team-a',
            tournamentId: 'tournament-1',
            name: 'Equipe A',
            institution: null,
            status: 'ACTIVE',
            logoSha256: null,
            fieldRevisions: {},
          }),
        },
        sportsTeamMember: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'member-1',
              teamId: 'team-a',
              participantId: 'participant-1',
              status: 'APPROVED',
              revision: 2,
              participant: {
                person: {
                  id: 'person-1',
                  name: 'Maria da Silva Santos',
                  email: 'private@example.com',
                  identityDocument: 'secret',
                },
              },
            },
          ]),
        },
        sportsTeamRepresentative: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'representative-1',
              teamId: 'team-a',
              personId: 'person-2',
              person: {
                id: 'person-2',
                name: 'João de Souza Oliveira',
                phone: 'private',
              },
              active: true,
              assignedAt: new Date(),
              revokedAt: null,
            },
          ]),
        },
        sportsRegistration: { findMany: jest.fn().mockResolvedValue([]) },
        sportsTeamChangeRequest: { findMany: changeRequestFindMany },
      } as never,
      authorizationPolicy as never,
    );

    const result = await service.adminTeam({ sub: 'admin-1' } as never, 'team-a');

    expect(result.members[0].person).toEqual({
      id: 'person-1',
      name: 'Maria Santos',
    });
    expect(result.representatives[0].person).toEqual({
      id: 'person-2',
      name: 'João Oliveira',
    });
    expect(result.changeRequests).toEqual([]);
    expect(changeRequestFindMany).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('returns safe member and category-role deltas to representatives', async () => {
    const service = new SportsReadService(
      {
        sportsTeam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'team-a',
            name: 'Equipe A',
            institution: null,
            logoSha256: null,
            revision: 4,
            changeRequests: [
              {
                id: 'request-1',
                type: 'MEMBER_UPDATE',
                status: 'PENDING',
                requestRevision: 2,
                baseRevision: 4,
                delta: {
                  memberChanges: [
                    {
                      teamMemberId: 'member-1',
                      expectedRevision: 2,
                      status: 'SUSPENDED',
                    },
                  ],
                  categoryRoleChanges: [
                    {
                      registrationId: 'registration-1',
                      teamMemberId: 'member-1',
                      role: 'CAPTAIN',
                      expectedRegistrationRevision: 3,
                    },
                  ],
                  logo: {
                    objectKey: 'private/object/key',
                    sha256: 'abc',
                    mimeType: 'image/png',
                    sizeBytes: 100,
                  },
                },
                reviewMessage: null,
                identityClaims: [],
                updatedAt: new Date(),
              },
            ],
          }),
        },
      } as never,
      {} as never,
    );

    const result = await service.representativeTeamWorkspace(
      'team-a',
      'person-1',
    );
    const delta = JSON.parse(result.queuedChanges[0].deltaJson);

    expect(delta.memberChanges).toHaveLength(1);
    expect(delta.categoryRoleChanges).toHaveLength(1);
    expect(delta.logo).toEqual({
      sha256: 'abc',
      mimeType: 'image/png',
      sizeBytes: 100,
    });
    expect(result.queuedChanges[0].deltaJson).not.toContain('objectKey');
  });

  it('projects pending live data but never exposes a rejected final result or its roster', async () => {
    const rosterFindMany = jest.fn();
    const service = new SportsReadService(
      {
        sportsMatch: {
          findFirst: jest.fn().mockResolvedValue(
            matchRecord([
              {
                type: SportsMatchActionType.START,
                payload: {},
                authoredAt: new Date('2026-07-29T10:00:00.000Z'),
                reviewStatus: SportsReviewStatus.APPROVED,
              },
              {
                type: SportsMatchActionType.SCORE_DELTA,
                payload: { side: 'HOME', amount: 1 },
                authoredAt: new Date('2026-07-29T10:01:00.000Z'),
                reviewStatus: SportsReviewStatus.PENDING,
              },
              {
                type: SportsMatchActionType.FINALIZE,
                payload: {
                  draw: false,
                  winnerRegistrationId: 'registration-a',
                  loserRegistrationId: 'registration-b',
                  lossReason: SportsLossReason.SCORE,
                },
                authoredAt: new Date('2026-07-29T11:00:00.000Z'),
                reviewStatus: SportsReviewStatus.REJECTED,
              },
            ]),
          ),
        },
        sportsMatchRoster: {
          findMany: rosterFindMany,
        },
        sportsCategory: {
          findUnique: jest.fn().mockResolvedValue({ tournamentId: 'tournament-1' }),
        },
        sportsOfficialAssignment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {} as never,
    );

    const result = await service.publicMatch('match-1');

    expect(result.state).toBe(SportsMatchState.LIVE);
    expect(result.scoreboard).toMatchObject({ homeScore: 1, awayScore: 0 });
    expect(result.timerStartedAt).toEqual(
      new Date('2026-07-29T10:00:00.000Z'),
    );
    expect(result.timerPausedAt).toBeNull();
    expect(result.elapsedBeforePauseMs).toBe(0);
    expect(result.winner).toBeNull();
    expect(result.loser).toBeNull();
    expect(result.rosters).toEqual([]);
    expect(rosterFindMany).not.toHaveBeenCalled();
  });

  it('reveals only approved post-match roster entries and redacts player and official names', async () => {
    const service = new SportsReadService(
      {
        sportsMatch: {
          findFirst: jest.fn().mockResolvedValue(
            matchRecord([
              {
                type: SportsMatchActionType.FINALIZE,
                payload: {
                  draw: false,
                  winnerRegistrationId: 'registration-a',
                  loserRegistrationId: 'registration-b',
                  lossReason: SportsLossReason.SCORE,
                  scoreboard: {
                    home: 3,
                    away: 1,
                    periods: [],
                    activePeriodNumber: null,
                  },
                },
                authoredAt: new Date('2026-07-29T11:00:00.000Z'),
                reviewStatus: SportsReviewStatus.PENDING,
              },
            ]),
          ),
        },
        sportsMatchRoster: {
          findMany: jest.fn().mockResolvedValue([
            {
              matchId: 'match-1',
              registration: { team: teamA },
              entries: [
                {
                  role: SportsRosterRole.PLAYER,
                  registrationMember: {
                    teamMember: {
                      participant: {
                        person: {
                          id: 'person-secret',
                          name: 'Maria da Silva Santos',
                          email: 'maria@example.com',
                        },
                      },
                    },
                  },
                },
              ],
            },
          ]),
        },
        sportsCategory: {
          findUnique: jest.fn().mockResolvedValue({ tournamentId: 'tournament-1' }),
        },
        sportsOfficialAssignment: {
          findMany: jest.fn().mockResolvedValue([
            {
              tournamentId: 'tournament-1',
              categoryId: 'category-1',
              matchId: 'match-1',
              role: SportsOfficialRole.REFEREE,
              person: {
                id: 'official-secret',
                name: 'João de Souza Oliveira',
                email: 'joao@example.com',
              },
            },
          ]),
        },
      } as never,
      {} as never,
    );

    const result = await service.publicMatch('match-1');

    expect(result.state).toBe(SportsMatchState.FINISHED);
    expect(result.winner?.id).toBe(teamA.id);
    expect(result.rosters).toEqual([
      {
        team: { ...teamA, logoUrl: null },
        entries: [{ name: 'Maria Santos', role: SportsRosterRole.PLAYER }],
      },
    ]);
    expect(result.officials).toEqual([
      { name: 'João O.', role: SportsOfficialRole.REFEREE },
    ]);
    expect(JSON.stringify({ rosters: result.rosters, officials: result.officials })).not.toContain(
      'example.com',
    );
    expect(JSON.stringify({ rosters: result.rosters, officials: result.officials })).not.toContain(
      'person-secret',
    );
  });

  it('orders current-user matches by player participation, then team membership, then all others', async () => {
    const prisma = {
      sportsTeamMember: {
        findMany: jest.fn().mockResolvedValue([{ teamId: 'team-a' }]),
      },
      sportsMatchRosterEntry: {
        findMany: jest.fn().mockResolvedValue([{ roster: { matchId: 'player-match' } }]),
      },
    };
    const service = new SportsReadService(prisma as never, {} as never);
    jest.spyOn(service, 'publicTournament').mockResolvedValue({
      id: 'tournament-1',
      majorEventId: 'major-event-1',
      name: 'Jogos',
      emoji: '🏆',
      description: null,
      startDate: new Date('2026-07-29T00:00:00.000Z'),
      endDate: new Date('2026-07-30T00:00:00.000Z'),
      teams: [],
      categories: [],
      overallScores: [],
      matches: [
        publicMatch('other-match', teamB, null, '2026-07-29T08:00:00.000Z'),
        publicMatch('team-match', teamA, teamB, '2026-07-29T09:00:00.000Z'),
        publicMatch('player-match', teamB, teamA, '2026-07-29T10:00:00.000Z'),
      ],
    });

    const result = await service.currentUserTournament(
      { tournamentId: 'tournament-1' },
      'person-1',
    );

    expect(result.orderedMatches.map((match) => match.id)).toEqual([
      'player-match',
      'team-match',
      'other-match',
    ]);
  });

  it('builds tournament categories, standings, placements, brackets, matches, and overall scores in batches', async () => {
    const finalMatch = matchRecord([
      {
        type: SportsMatchActionType.FINALIZE,
        payload: {
          draw: false,
          winnerRegistrationId: 'registration-a',
          loserRegistrationId: 'registration-b',
          lossReason: SportsLossReason.SCORE,
        },
        authoredAt: new Date('2026-07-29T11:00:00.000Z'),
        reviewStatus: SportsReviewStatus.PENDING,
      },
    ]);
    const tournament = {
      id: 'tournament-1',
      majorEventId: 'major-event-1',
      majorEvent: {
        name: 'Jogos',
        emoji: '🏆',
        description: null,
        startDate: new Date('2026-07-29T00:00:00.000Z'),
        endDate: new Date('2026-07-30T00:00:00.000Z'),
      },
    };
    const prisma = {
      sportsTournament: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(tournament)
          .mockResolvedValue({
            ...tournament,
            majorEvent: {
              ...tournament.majorEvent,
              name: 'Jogos atualizados',
              startDate: new Date('2026-07-29T01:00:00.000Z'),
            },
          }),
      },
      sportsCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-1',
            name: 'Futsal',
            sport: SportsPreset.FUTSAL,
            customSportName: null,
            division: 'Aberto',
            format: SportsFormat.SINGLE_ELIMINATION,
            rulesText: null,
          },
        ]),
      },
      sportsTeam: {
        findMany: jest.fn().mockResolvedValue([teamA, teamB]),
      },
      sportsStage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'stage-1',
            categoryId: 'category-1',
            name: 'Final',
            type: SportsStageType.FINAL,
            displayOrder: 1,
          },
        ]),
      },
      sportsMatch: {
        findMany: jest.fn().mockResolvedValue([finalMatch]),
      },
      sportsStanding: {
        findMany: jest.fn().mockResolvedValue([
          {
            stage: { categoryId: 'category-1' },
            registrationId: 'registration-a',
            registration: { team: teamA },
            played: 1,
            wins: 1,
            draws: 0,
            losses: 0,
            scoreFor: 3,
            scoreAgainst: 1,
            points: 3,
            rank: 1,
          },
        ]),
      },
      sportsCategoryPlacement: {
        findMany: jest.fn().mockResolvedValue([
          {
            categoryId: 'category-1',
            registration: { team: teamA },
            placement: 1,
            pointsAwarded: 10,
          },
        ]),
      },
      sportsTournamentScoreEntry: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: teamA.id, team: teamA, points: 10 },
          { teamId: teamA.id, team: teamA, points: 2 },
        ]),
      },
      sportsMatchRoster: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      sportsOfficialAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const cache = new Map<string, string>();
    const redis = {
      get: jest.fn((key: string) => Promise.resolve(cache.get(key) ?? null)),
      mget: jest.fn((...keys: string[]) =>
        Promise.resolve(keys.map((key) => cache.get(key) ?? null)),
      ),
      eval: jest.fn(
        (
          _script: string,
          _keyCount: number,
          cacheKey: string,
          versionKey: string,
          expectedVersion: string,
          serialized: string,
        ) => {
          if ((cache.get(versionKey) ?? '0') !== expectedVersion) {
            return Promise.resolve(0);
          }
          cache.set(cacheKey, serialized);
          return Promise.resolve(1);
        },
      ),
    };
    const service = new SportsReadService(
      prisma as never,
      {} as never,
      redis as never,
    );

    const result = await service.publicTournament({ majorEventId: 'major-event-1' });
    const cachedResult = await service.publicTournament({
      majorEventId: 'major-event-1',
    });

    expect(result.categories[0]).toMatchObject({
      id: 'category-1',
      standings: [{ team: expect.objectContaining({ id: teamA.id }), rank: 1 }],
      placements: [{ team: expect.objectContaining({ id: teamA.id }), placement: 1 }],
      brackets: [{ id: 'stage-1', matches: [{ id: 'match-1' }] }],
      matches: [{ id: 'match-1' }],
    });
    expect(result.overallScores).toEqual([
      { team: { ...teamA, logoUrl: null }, points: 12 },
    ]);
    expect(prisma.sportsMatch.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sportsStanding.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sportsCategoryPlacement.findMany).toHaveBeenCalledTimes(1);
    expect(cachedResult.startDate).toBeInstanceOf(Date);
    expect(cachedResult.startDate).toEqual(
      new Date('2026-07-29T01:00:00.000Z'),
    );
    expect(cachedResult.name).toBe('Jogos atualizados');
    expect(cachedResult.endDate).toBeInstanceOf(Date);
    expect(cachedResult.matches[0].schedule.startDate).toBeInstanceOf(Date);
    expect(
      cachedResult.categories[0].brackets[0].matches[0].schedule.endDate,
    ).toBeInstanceOf(Date);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('SET'"),
      2,
      'sports:public-tournament:v1:tournament-1',
      'sports:public-tournament-version:v1:tournament-1',
      '0',
      expect.any(String),
      '45',
    );
  });

  it('never serves an individual live match from the tournament aggregate cache', async () => {
    const matchFindFirst = jest
      .fn()
      .mockResolvedValue(matchRecord([]));
    const redis = {
      get: jest.fn(),
      mget: jest.fn(),
      eval: jest.fn(),
    };
    const service = new SportsReadService(
      {
        sportsMatch: { findFirst: matchFindFirst },
        sportsMatchRoster: { findMany: jest.fn().mockResolvedValue([]) },
        sportsCategory: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ tournamentId: 'tournament-1' }),
        },
        sportsOfficialAssignment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {} as never,
      redis as never,
    );

    await service.publicMatch('match-1');
    await service.publicMatch('match-1');

    expect(matchFindFirst).toHaveBeenCalledTimes(2);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.mget).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });
});

function matchRecord(actions: unknown[]) {
  return {
    id: 'match-1',
    eventId: 'event-1',
    categoryId: 'category-1',
    stageId: 'stage-1',
    homeRegistrationId: 'registration-a',
    homeRegistration: { team: teamFixture('team-a', 'Equipe A') },
    awayRegistrationId: 'registration-b',
    awayRegistration: { team: teamFixture('team-b', 'Equipe B') },
    winnerRegistrationId: null,
    winnerRegistration: null,
    loserRegistrationId: null,
    loserRegistration: null,
    roundNumber: 1,
    bracketPosition: 1,
    groupKey: null,
    event: {
      startDate: new Date('2026-07-29T10:00:00.000Z'),
      endDate: new Date('2026-07-29T11:00:00.000Z'),
      locationDescription: 'Ginásio',
      latitude: -22.123,
      longitude: -47.456,
    },
    venue: {
      name: 'Quadra principal',
      courtLabel: 'Quadra 1',
    },
    category: {
      maximumPeriods: null,
      periodLabel: null,
    },
    rosters: [],
    actions,
  };
}

function teamFixture(id: string, name: string) {
  return { id, name, institution: null };
}

function publicMatch(
  id: string,
  homeTeam: ReturnType<typeof teamFixture> | null,
  awayTeam: ReturnType<typeof teamFixture> | null,
  startDate: string,
) {
  return {
    id,
    eventId: `event-${id}`,
    categoryId: 'category-1',
    stageId: null,
    homeTeam: homeTeam ? { ...homeTeam, logoUrl: null } : null,
    awayTeam: awayTeam ? { ...awayTeam, logoUrl: null } : null,
    state: SportsMatchState.SCHEDULED,
    scoreboard: { homeScore: 0, awayScore: 0, periods: [], activePeriod: null },
    winner: null,
    loser: null,
    lossReason: null,
    lossReasonDetail: null,
    drawWillReschedule: null,
    timerStartedAt: null,
    timerPausedAt: null,
    elapsedBeforePauseMs: 0,
    roundNumber: null,
    bracketPosition: null,
    groupKey: null,
    schedule: {
      startDate: new Date(startDate),
      endDate: new Date(new Date(startDate).getTime() + 60 * 60 * 1000),
      locationDescription: null,
      latitude: null,
      longitude: null,
      venueName: null,
      courtLabel: null,
    },
    rosters: [],
    officials: [],
  };
}
