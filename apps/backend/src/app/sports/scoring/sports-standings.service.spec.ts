import { SportsFormat, SportsMatchState, SportsReviewStatus, SportsScoringMode, SportsStageType } from '@prisma/client';

jest.mock('../brackets/sports-bracket-advancement.service', () => ({
  SportsBracketAdvancementService: class SportsBracketAdvancementService {},
}));

import { SportsStandingsService } from './sports-standings.service';

describe('SportsStandingsService', () => {
  const advancement = {
    advanceBye: jest.fn(),
  };
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  let service: SportsStandingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SportsStandingsService(advancement as never, auditLog as never);
  });

  it('creates exactly one durable Event-backed replay for an approved rescheduled draw', async () => {
    const source = match({
      canonicalState: SportsMatchState.DRAW,
      state: SportsMatchState.DRAW,
      drawWillReschedule: true,
      winnerRegistrationId: null,
      loserRegistrationId: null,
    });
    const tx = transaction(source);

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');
    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.event.upsert).toHaveBeenCalledTimes(2);
    expect(tx.sportsMatch.upsert).toHaveBeenCalledTimes(2);
    expect(tx.event.upsert.mock.calls[0][0].where).toEqual(tx.event.upsert.mock.calls[1][0].where);
    expect(tx.sportsMatch.upsert.mock.calls[0][0]).toMatchObject({
      where: { replayOfMatchId: source.id },
      create: {
        replayOfMatchId: source.id,
        state: SportsMatchState.SCHEDULED,
        canonicalState: SportsMatchState.SCHEDULED,
        reviewStatus: SportsReviewStatus.NOT_REQUIRED,
        winnerAdvancesToId: 'next-match',
      },
    });
    expect(tx.sportsCategoryPlacement.upsert).not.toHaveBeenCalled();
  });

  it('never creates a replay or placement from an unapproved result', async () => {
    const source = match({
      canonicalState: SportsMatchState.DRAW,
      state: SportsMatchState.DRAW,
      drawWillReschedule: true,
      reviewStatus: SportsReviewStatus.PENDING,
    });
    const tx = transaction(source);

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.event.upsert).not.toHaveBeenCalled();
    expect(tx.sportsMatch.upsert).not.toHaveBeenCalled();
    expect(tx.sportsCategoryPlacement.upsert).not.toHaveBeenCalled();
  });

  it('does not mistake an ordinary round-robin result for final placements', async () => {
    const source = match({
      stage: { type: SportsStageType.GROUP, settings: {} },
      winnerAdvancesToId: null,
    });
    const tx = transaction(source);

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsCategoryPlacement.findMany).not.toHaveBeenCalled();
    expect(tx.sportsCategoryPlacement.upsert).not.toHaveBeenCalled();
  });

  it('confirms round-robin placements from canonical rankings only after the stage is complete', async () => {
    const source = match({
      stageId: 'round-robin-stage',
      stage: { type: SportsStageType.GROUP, settings: {} },
      winnerAdvancesToId: null,
    });
    const tx = transaction(source);
    tx.sportsStage.findUniqueOrThrow
      .mockResolvedValueOnce({
        category: { standingsRules: {} },
        standings: [
          { registrationId: 'home', tiebreakData: {} },
          { registrationId: 'away', tiebreakData: {} },
        ],
        matches: [
          {
            homeRegistrationId: 'home',
            awayRegistrationId: 'away',
            canonicalState: SportsMatchState.FINISHED,
            canonicalScoreboard: { home: 1, away: 2 },
            winnerRegistrationId: 'away',
          },
        ],
      })
      .mockResolvedValueOnce({
        settings: {},
        standings: [
          { registrationId: 'away', rank: 1 },
          { registrationId: 'home', rank: 2 },
        ],
        matches: [
          {
            id: 'round-1-match-1',
            roundNumber: 1,
            bracketPosition: 1,
            canonicalState: SportsMatchState.FINISHED,
            reviewStatus: SportsReviewStatus.APPROVED,
          },
        ],
      });

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsCategoryPlacement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          registrationId: 'away',
          placement: 1,
        }),
      }),
    );
  });

  it('confirms the original grand final only when the winners-bracket entrant wins', async () => {
    const source = match({
      id: 'grand-final',
      category: category(SportsFormat.DOUBLE_ELIMINATION),
      stage: {
        type: SportsStageType.FINAL,
        settings: {
          resetRule: {
            sourceMatchId: 'grand-final',
            resetMatchId: 'grand-final-reset',
          },
        },
      },
      winnerRegistrationId: 'home',
      loserRegistrationId: 'away',
      winnerAdvancesToId: 'grand-final-reset',
    });
    const tx = transaction(source);

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsCategoryPlacement.upsert).toHaveBeenCalledTimes(2);
    expect(tx.sportsCategoryPlacement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceMatchId: 'grand-final',
          registrationId: 'home',
          placement: 1,
        }),
      }),
    );
  });

  it('defers placements when the losers-bracket entrant forces the reset', async () => {
    const source = match({
      id: 'grand-final',
      category: category(SportsFormat.DOUBLE_ELIMINATION),
      stage: {
        type: SportsStageType.FINAL,
        settings: {
          resetRule: {
            sourceMatchId: 'grand-final',
            resetMatchId: 'grand-final-reset',
          },
        },
      },
      winnerRegistrationId: 'away',
      loserRegistrationId: 'home',
      winnerAdvancesToId: 'grand-final-reset',
    });
    const tx = transaction(source);

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsCategoryPlacement.upsert).not.toHaveBeenCalled();
  });

  it('does not duplicate unchanged placements or overall score entries on replayed processing', async () => {
    const source = match({
      id: 'final-match',
      category: category(SportsFormat.SINGLE_ELIMINATION),
      stage: { type: SportsStageType.ELIMINATION, settings: {} },
      winnerAdvancesToId: null,
    });
    const tx = transaction(source);
    tx.sportsCategoryPlacement.findMany.mockResolvedValue([
      {
        registrationId: 'home',
        sourceMatchId: 'final-match',
        placement: 1,
        pointsAwarded: null,
        confirmedAt: new Date(),
      },
      {
        registrationId: 'away',
        sourceMatchId: 'final-match',
        placement: 2,
        pointsAwarded: null,
        confirmedAt: new Date(),
      },
    ]);

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsCategoryPlacement.upsert).not.toHaveBeenCalled();
    expect(tx.sportsTournamentScoreEntry.updateMany).not.toHaveBeenCalled();
    expect(tx.sportsTournamentScoreEntry.createMany).not.toHaveBeenCalled();
  });

  it('registers approved match-result points once and audits the automatic entries', async () => {
    const scoringCategory = {
      ...category(),
      overallScoringRules: {
        mode: 'MATCH_RESULT',
        match: { win: 3, draw: 1, loss: 0 },
        placement: {},
      },
      tournament: {
        scoringMode: SportsScoringMode.OVERALL,
        majorEventId: 'major-1',
      },
    };
    const source = match({ category: scoringCategory });
    const tx = transaction(source);
    tx.sportsRegistration.findMany.mockResolvedValue([
      { id: 'home', teamId: 'team-home' },
      { id: 'away', teamId: 'team-away' },
    ]);
    tx.sportsTournamentScoreEntry.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'score-home',
        tournamentId: 'tournament-1',
        categoryId: 'category-1',
        teamId: 'team-home',
        sourceMatchId: source.id,
        source: 'MATCH',
        points: 3,
        reason: 'Vitória na partida',
        revision: 1,
      },
    ]);
    tx.sportsTournamentScoreEntry.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: `score-${data.teamId}`,
      revision: 1,
      categoryId: 'category-1',
    }));

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');
    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsTournamentScoreEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.sportsTournamentScoreEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamId: 'team-home', points: 3, source: 'MATCH' }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'CREATE',
        entityType: 'SPORTS_TOURNAMENT_SCORE',
        metadata: { triggeredById: 'admin-1', trigger: 'MATCH_RESULT_APPROVAL' },
      }),
      tx,
    );
  });

  it('registers configured final-placement points in the overall scoreboard', async () => {
    const scoringCategory = {
      ...category(SportsFormat.SINGLE_ELIMINATION),
      overallScoringRules: {
        mode: 'FINAL_PLACEMENT',
        match: { win: 3, draw: 1, loss: 0 },
        placement: { '1': 10, '2': 6 },
      },
      tournament: {
        scoringMode: SportsScoringMode.OVERALL,
        majorEventId: 'major-1',
      },
    };
    const source = match({
      category: scoringCategory,
      stage: { type: SportsStageType.ELIMINATION, settings: {} },
      winnerAdvancesToId: null,
    });
    const tx = transaction(source);
    tx.sportsRegistration.findMany.mockResolvedValue([
      { id: 'home', teamId: 'team-home' },
      { id: 'away', teamId: 'team-away' },
    ]);
    tx.sportsTournamentScoreEntry.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'score-first',
          tournamentId: 'tournament-1',
          categoryId: 'category-1',
          teamId: 'team-home',
          sourceMatchId: source.id,
          source: 'PLACEMENT',
          points: 10,
          reason: '1º lugar',
          revision: 1,
        },
        {
          id: 'score-second',
          tournamentId: 'tournament-1',
          categoryId: 'category-1',
          teamId: 'team-away',
          sourceMatchId: source.id,
          source: 'PLACEMENT',
          points: 6,
          reason: '2º lugar',
          revision: 1,
        },
      ]);

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsTournamentScoreEntry.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ teamId: 'team-home', points: 10, source: 'PLACEMENT' }),
        expect.objectContaining({ teamId: 'team-away', points: 6, source: 'PLACEMENT' }),
      ]),
    });
    expect(auditLog.record).toHaveBeenCalledTimes(2);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'CREATE', entityType: 'SPORTS_TOURNAMENT_SCORE' }),
      tx,
    );
  });

  it('does not create overall placement score entries in per-sport scoring mode', async () => {
    const source = match({
      category: {
        ...category(SportsFormat.SINGLE_ELIMINATION),
        overallScoringRules: {
          mode: 'FINAL_PLACEMENT',
          match: { win: 3, draw: 1, loss: 0 },
          placement: { '1': 10, '2': 6 },
        },
        tournament: {
          scoringMode: SportsScoringMode.PER_SPORT,
          majorEventId: 'major-1',
        },
      },
      stage: { type: SportsStageType.ELIMINATION, settings: {} },
      winnerAdvancesToId: null,
    });
    const tx = transaction(source);
    tx.sportsRegistration.findMany.mockResolvedValue([
      { id: 'home', teamId: 'team-home' },
      { id: 'away', teamId: 'team-away' },
    ]);
    tx.sportsTournamentScoreEntry.findMany.mockResolvedValue([]);

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsTournamentScoreEntry.createMany).not.toHaveBeenCalled();
  });

  it('preserves Swiss bye and seed metadata while recomputing canonical standings', async () => {
    const source = match({
      stageId: 'swiss-stage',
      stage: { type: SportsStageType.SWISS, settings: {} },
      category: category(SportsFormat.SWISS),
      winnerAdvancesToId: null,
    });
    const tx = transaction(source);
    tx.sportsStage.findUniqueOrThrow.mockResolvedValue({
      category: { standingsRules: { byePoints: 2 } },
      standings: [
        {
          registrationId: 'home',
          tiebreakData: { byeCount: 1, seed: 4 },
        },
      ],
      matches: [],
    });

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsStage.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          matches: expect.objectContaining({
            where: expect.objectContaining({
              NOT: {
                canonicalState: SportsMatchState.DRAW,
                drawWillReschedule: true,
              },
            }),
          }),
        }),
      }),
    );
    expect(tx.sportsStanding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          played: 1,
          wins: 1,
          points: 2,
          tiebreakData: expect.objectContaining({
            byeCount: 1,
            seed: 4,
          }),
        }),
      }),
    );
  });

  it('uses the shared standings default for a Swiss bye when rules omit bye points', async () => {
    const source = match({
      stageId: 'swiss-stage',
      stage: { type: SportsStageType.SWISS, settings: {} },
      category: category(SportsFormat.SWISS),
      winnerAdvancesToId: null,
    });
    const tx = transaction(source);
    tx.sportsStage.findUniqueOrThrow.mockResolvedValue({
      category: { standingsRules: {} },
      standings: [
        {
          registrationId: 'home',
          tiebreakData: { byeCount: 1, seed: 4 },
        },
      ],
      matches: [],
    });

    await service.refreshAfterApprovedOutcome(tx as never, source.id, 'admin-1');

    expect(tx.sportsStanding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          points: 3,
          tiebreakData: expect.objectContaining({ byeCount: 1, seed: 4 }),
        }),
      }),
    );
  });

  function transaction(source: ReturnType<typeof match>) {
    return {
      event: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      sportsMatch: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(source),
        upsert: jest.fn().mockResolvedValue({
          id: 'replay-match',
          categoryId: source.categoryId,
          category: { tournamentId: source.category.tournamentId },
          stageId: source.stageId,
          event: {
            deletedAt: null,
            isPubliclyListed: false,
            publicationState: 'DRAFT',
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sportsStage: {
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      sportsStanding: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      sportsCategoryPlacement: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      sportsRegistration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      sportsTournamentScoreEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  }

  function category(format = SportsFormat.ROUND_ROBIN) {
    return {
      format,
      bracketRules: {},
      overallScoringRules: {},
      tournamentId: 'tournament-1',
      tournament: {
        scoringMode: SportsScoringMode.PER_SPORT,
        majorEventId: 'major-1',
      },
    };
  }

  function match(
    overrides: Partial<{
      id: string;
      replayOfMatchId: string | null;
      state: SportsMatchState;
      canonicalState: SportsMatchState;
      reviewStatus: SportsReviewStatus;
      drawWillReschedule: boolean | null;
      stageId: string | null;
      stage: { type: SportsStageType; settings: object } | null;
      category: ReturnType<typeof category>;
      winnerRegistrationId: string | null;
      loserRegistrationId: string | null;
      winnerAdvancesToId: string | null;
    }> = {},
  ) {
    return {
      id: 'match-1',
      replayOfMatchId: null,
      event: {
        name: 'Equipe A × Equipe B',
        emoji: '🏆',
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        endDate: new Date('2026-08-01T11:00:00.000Z'),
        majorEventId: 'major-1',
        eventGroupId: 'group-1',
        latitude: null,
        longitude: null,
        locationDescription: 'Ginásio',
      },
      categoryId: 'category-1',
      category: category(),
      stageId: null,
      stage: { type: SportsStageType.GROUP, settings: {} },
      venueId: 'venue-1',
      state: SportsMatchState.FINISHED,
      canonicalState: SportsMatchState.FINISHED,
      reviewStatus: SportsReviewStatus.APPROVED,
      drawWillReschedule: false,
      homeRegistrationId: 'home',
      awayRegistrationId: 'away',
      winnerRegistrationId: 'home',
      loserRegistrationId: 'away',
      roundNumber: 1,
      bracketPosition: 1,
      groupKey: null,
      winnerAdvancesToId: 'next-match',
      winnerAdvancesToSide: 'HOME' as const,
      loserAdvancesToId: null,
      loserAdvancesToSide: null,
      ...overrides,
    };
  }
});
