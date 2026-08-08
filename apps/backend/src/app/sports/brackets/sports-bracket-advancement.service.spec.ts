import { SportsBracketSide, SportsMatchState, SportsReviewStatus } from '@prisma/client';

jest.mock('../rosters/sports-match-roster.service', () => ({
  SportsMatchRosterService: class SportsMatchRosterService {},
}));
jest.mock('../sports-match-event-sync', () => ({
  syncSportsMatchEventName: jest.fn().mockResolvedValue(undefined),
}));

import { SportsBracketAdvancementService } from './sports-bracket-advancement.service';

describe('SportsBracketAdvancementService', () => {
  const rosters = {
    copyApprovedRosterForWinner: jest.fn(),
  };
  let service: SportsBracketAdvancementService;

  beforeEach(() => {
    jest.clearAllMocks();
    rosters.copyApprovedRosterForWinner.mockResolvedValue(undefined);
    service = new SportsBracketAdvancementService(rosters as never);
  });

  it('does not advance a draw, even when it will be rescheduled', async () => {
    const tx = transaction([
      {
        ...sourceMatch(),
        canonicalState: SportsMatchState.DRAW,
        drawWillReschedule: true,
        winnerRegistrationId: null,
        loserRegistrationId: null,
      },
    ]);

    await service.advanceApprovedOutcome(tx as never, 'match-1', 'admin-1');

    expect(tx.sportsMatch.updateMany).not.toHaveBeenCalled();
    expect(rosters.copyApprovedRosterForWinner).not.toHaveBeenCalled();
  });

  it('cancels the unused reset match when the winners-bracket entrant wins', async () => {
    const tx = transaction([grandFinal('home'), resetMatch({}, 'grand-final-reset')], [{ count: 1 }]);

    await service.advanceApprovedOutcome(tx as never, 'original-grand-final', 'admin-1');

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'grand-final-reset',
        state: SportsMatchState.SCHEDULED,
        operationSequence: 0,
      }),
      data: expect.objectContaining({
        state: SportsMatchState.CANCELED,
        canonicalState: SportsMatchState.CANCELED,
        reviewStatus: SportsReviewStatus.APPROVED,
      }),
    });
    expect(rosters.copyApprovedRosterForWinner).not.toHaveBeenCalled();
  });

  it('routes both entrants to one reset match when the losers-bracket entrant wins', async () => {
    const tx = transaction(
      [
        grandFinal('away', 'original-grand-final'),
        { id: 'original-grand-final', replayOfMatchId: null },
        resetMatch({}, 'grand-final-reset'),
      ],
      [{ count: 1 }],
    );

    await service.advanceApprovedOutcome(tx as never, 'grand-final-replay', 'admin-1');

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'grand-final-reset',
          homeRegistrationId: null,
          awayRegistrationId: null,
        }),
        data: expect.objectContaining({
          state: SportsMatchState.SCHEDULED,
          canonicalState: SportsMatchState.SCHEDULED,
          homeRegistrationId: 'away',
          awayRegistrationId: 'home',
        }),
      }),
    );
    expect(rosters.copyApprovedRosterForWinner).toHaveBeenCalledWith(
      tx,
      'grand-final-replay',
      'grand-final-reset',
      'away',
      'admin-1',
    );
  });

  it('clears a populated untouched reset match when a corrected grand final decides the championship', async () => {
    const tx = transaction(
      [
        grandFinal('home'),
        resetMatch(
          {
            homeRegistrationId: 'away',
            awayRegistrationId: 'home',
          },
          'grand-final-reset',
        ),
      ],
      [{ count: 1 }],
    );

    await service.advanceApprovedOutcome(tx as never, 'original-grand-final', 'admin-1');

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'grand-final-reset',
        homeRegistrationId: 'away',
        awayRegistrationId: 'home',
        operationSequence: 0,
      }),
      data: expect.objectContaining({
        state: SportsMatchState.CANCELED,
        canonicalState: SportsMatchState.CANCELED,
        homeRegistrationId: null,
        awayRegistrationId: null,
      }),
    });
    expect(tx.sportsMatchRoster.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        matchId: 'grand-final-reset',
        copiedFromRoster: { is: { matchId: 'original-grand-final' } },
      }),
      data: expect.objectContaining({ updatedById: 'admin-1' }),
    });
  });

  it('reopens and reseeds a system-canceled reset match after the corrected grand final requires it', async () => {
    const tx = transaction(
      [
        grandFinal('away'),
        {
          ...resetMatch({}, 'grand-final-reset'),
          state: SportsMatchState.CANCELED,
          canonicalState: SportsMatchState.CANCELED,
          reviewStatus: SportsReviewStatus.APPROVED,
        },
      ],
      [{ count: 1 }],
    );

    await service.advanceApprovedOutcome(tx as never, 'original-grand-final', 'admin-1');

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'grand-final-reset',
        state: SportsMatchState.CANCELED,
        canonicalState: SportsMatchState.CANCELED,
      }),
      data: expect.objectContaining({
        state: SportsMatchState.SCHEDULED,
        canonicalState: SportsMatchState.SCHEDULED,
        reviewStatus: SportsReviewStatus.NOT_REQUIRED,
        homeRegistrationId: 'away',
        awayRegistrationId: 'home',
      }),
    });
    expect(rosters.copyApprovedRosterForWinner).toHaveBeenCalledWith(
      tx,
      'original-grand-final',
      'grand-final-reset',
      'away',
      'admin-1',
    );
  });

  it('requires explicit rollback when the reset match already has live evidence', async () => {
    const tx = transaction([
      grandFinal('home'),
      {
        ...resetMatch(
          {
            homeRegistrationId: 'away',
            awayRegistrationId: 'home',
          },
          'grand-final-reset',
        ),
        state: SportsMatchState.LIVE,
        canonicalState: SportsMatchState.LIVE,
        operationSequence: 2,
      },
    ]);

    await expect(service.advanceApprovedOutcome(tx as never, 'original-grand-final', 'admin-1')).rejects.toThrow(
      'A partida de desempate já possui check-in, placar ou resultado. Redefina-a explicitamente antes de corrigir a grande final.',
    );
    expect(tx.sportsMatch.updateMany).not.toHaveBeenCalled();
  });

  it('settles and recursively advances a dynamic registration opposite a structural bye', async () => {
    const source = {
      ...sourceMatch(),
      awayRegistrationId: null,
      winnerAdvancesToId: 'target',
      winnerAdvancesToSide: SportsBracketSide.HOME,
      winnerAdvancesTo: resetMatch(),
    };
    const tx = transaction(
      [
        source,
        {
          ...resetMatch({ homeRegistrationId: 'home' }),
          revision: 2,
          stage: {
            settings: {
              structuralByeSides: { target: SportsBracketSide.AWAY },
            },
          },
        },
        {
          ...resetMatch({ homeRegistrationId: 'home' }),
          state: SportsMatchState.FINISHED,
          canonicalState: SportsMatchState.FINISHED,
          reviewStatus: SportsReviewStatus.APPROVED,
          winnerRegistrationId: 'home',
        },
      ],
      [{ count: 1 }, { count: 1 }],
    );

    await service.advanceBye(tx as never, 'source-bye', 'admin-1');

    expect(tx.sportsMatch.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'target',
          revision: 2,
          state: SportsMatchState.SCHEDULED,
        }),
        data: expect.objectContaining({
          state: SportsMatchState.FINISHED,
          canonicalState: SportsMatchState.FINISHED,
          winnerRegistrationId: 'home',
        }),
      }),
    );
  });

  function transaction(matches: unknown[], updates: Array<{ count: number }> = []) {
    return {
      sportsMatch: {
        findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(matches.shift())),
        updateMany: jest.fn().mockImplementation(() => Promise.resolve(updates.shift() ?? { count: 0 })),
      },
      sportsMatchRoster: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  function sourceMatch() {
    return {
      id: 'source-bye',
      replayOfMatchId: null,
      state: SportsMatchState.FINISHED,
      canonicalState: SportsMatchState.FINISHED,
      reviewStatus: SportsReviewStatus.APPROVED,
      homeRegistrationId: 'home',
      awayRegistrationId: 'away',
      winnerRegistrationId: 'home',
      loserRegistrationId: 'away',
      winnerAdvancesToId: null,
      winnerAdvancesToSide: null,
      winnerAdvancesTo: null,
      loserAdvancesToId: null,
      loserAdvancesToSide: null,
      loserAdvancesTo: null,
      stage: { settings: {} },
    };
  }

  function grandFinal(winnerRegistrationId: 'home' | 'away', replayOfMatchId: string | null = null) {
    return {
      ...sourceMatch(),
      id: replayOfMatchId ? 'grand-final-replay' : 'original-grand-final',
      replayOfMatchId,
      winnerRegistrationId,
      loserRegistrationId: winnerRegistrationId === 'home' ? 'away' : 'home',
      winnerAdvancesToId: 'grand-final-reset',
      winnerAdvancesToSide: SportsBracketSide.HOME,
      winnerAdvancesTo: resetMatch({}, 'grand-final-reset'),
      loserAdvancesToId: 'grand-final-reset',
      loserAdvancesToSide: SportsBracketSide.AWAY,
      loserAdvancesTo: resetMatch({}, 'grand-final-reset'),
      stage: {
        settings: {
          resetRule: {
            sourceMatchId: 'original-grand-final',
            resetMatchId: 'grand-final-reset',
          },
        },
      },
    };
  }

  function resetMatch(
    slots: {
      homeRegistrationId?: string | null;
      awayRegistrationId?: string | null;
    } = {},
    id = 'target',
  ) {
    return {
      id,
      replayOfMatchId: null,
      categoryId: 'category-1',
      category: { tournamentId: 'tournament-1' },
      stageId: 'stage-1',
      event: {
        deletedAt: null,
        publiclyVisible: false,
        publicationState: 'DRAFT',
      },
      state: SportsMatchState.SCHEDULED,
      canonicalState: SportsMatchState.SCHEDULED,
      reviewStatus: SportsReviewStatus.NOT_REQUIRED,
      homeRegistrationId: slots.homeRegistrationId ?? null,
      awayRegistrationId: slots.awayRegistrationId ?? null,
      winnerRegistrationId: null,
      loserRegistrationId: null,
      winnerAdvancesToId: null,
      winnerAdvancesToSide: null,
      winnerAdvancesTo: null,
      stage: { settings: {} },
      revision: 1,
      operationSequence: 0,
    };
  }
});
