import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SportsMatchActionType, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import {
  sportsPublicMatchRecord,
  sportsPublicOfficialAssignmentRecord,
  sportsPublicRosterRecord,
  sportsPublicTeamRecord,
  sportsTestDate,
  sportsPublicTournamentRecord,
} from '../testing/sports-backend.fixtures';
import { SportsReadPublicService } from './sports-read-public.service';

describe('SportsReadPublicService', () => {
  const prisma = {
    sportsTournament: { findFirst: jest.fn() },
    sportsCategory: { findMany: jest.fn(), findUnique: jest.fn() },
    sportsTeam: { findMany: jest.fn() },
    sportsStage: { findMany: jest.fn() },
    sportsMatch: { findFirst: jest.fn(), findMany: jest.fn() },
    sportsStanding: { findMany: jest.fn() },
    sportsCategoryPlacement: { findMany: jest.fn() },
    sportsTournamentScoreEntry: { findMany: jest.fn() },
    sportsMatchRoster: { findMany: jest.fn() },
    sportsOfficialAssignment: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sportsCategory.findMany.mockResolvedValue([]);
    prisma.sportsTeam.findMany.mockResolvedValue([]);
    prisma.sportsStage.findMany.mockResolvedValue([]);
    prisma.sportsMatch.findMany.mockResolvedValue([]);
    prisma.sportsStanding.findMany.mockResolvedValue([]);
    prisma.sportsCategoryPlacement.findMany.mockResolvedValue([]);
    prisma.sportsTournamentScoreEntry.findMany.mockResolvedValue([]);
    prisma.sportsMatchRoster.findMany.mockResolvedValue([]);
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([]);
    prisma.sportsCategory.findUnique.mockResolvedValue({ tournamentId: 'tournament-1' });
  });

  it.each([
    {},
    { tournamentId: ' ', majorEventId: null },
    { tournamentId: 'tournament-1', majorEventId: 'major-event-1' },
  ])('requires exactly one nonblank public tournament target', async (input) => {
    await expect(new SportsReadPublicService(prisma as never).publicTournament(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.sportsTournament.findFirst).not.toHaveBeenCalled();
  });

  it('looks up a published tournament by trimmed major-event id and reports hidden or missing records', async () => {
    prisma.sportsTournament.findFirst.mockResolvedValue(null);

    await expect(
      new SportsReadPublicService(prisma as never).publicTournament({ majorEventId: '  major-event-1  ' }),
    ).rejects.toThrow(new NotFoundException('Sports tournament was not found.'));
    expect(prisma.sportsTournament.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          majorEventId: 'major-event-1',
          deletedAt: null,
          majorEvent: expect.objectContaining({ publicationState: 'PUBLISHED' }),
        }),
      }),
    );
  });

  it('returns a privacy-safe match and skips roster persistence before a final state', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue(sportsPublicMatchRecord());

    const result = await new SportsReadPublicService(prisma as never).publicMatch('match-1');

    expect(result.id).toBe('match-1');
    expect(result.state).toBe(SportsMatchState.SCHEDULED);
    expect(result.rosters).toEqual([]);
    expect(prisma.sportsMatchRoster.findMany).not.toHaveBeenCalled();
    expect(prisma.sportsMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'match-1',
          deletedAt: null,
          category: expect.objectContaining({ tournament: expect.any(Object) }),
          event: expect.objectContaining({ publiclyVisible: true }),
        }),
      }),
    );
  });

  it('does not expose an unpublished or missing match', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue(null);

    await expect(new SportsReadPublicService(prisma as never).publicMatch('private-match')).rejects.toThrow(
      new NotFoundException('Sports match private-match was not found.'),
    );
    expect(prisma.sportsCategory.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to an empty official list when a match category disappears during loading', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue(sportsPublicMatchRecord());
    prisma.sportsCategory.findUnique.mockResolvedValue(null);

    const result = await new SportsReadPublicService(prisma as never).publicMatch('match-1');

    expect(result.officials).toEqual([]);
    expect(prisma.sportsOfficialAssignment.findMany).not.toHaveBeenCalled();
  });

  it('reveals anonymized approved rosters and scoped officials after a match is final', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue(
      sportsPublicMatchRecord({
        actions: [
          {
            type: SportsMatchActionType.FINALIZE,
            payload: {
              winnerRegistrationId: 'registration-home',
              loserRegistrationId: 'registration-away',
              lossReason: 'SCORE',
            },
            authoredAt: sportsTestDate(-60_000),
            reviewStatus: SportsReviewStatus.APPROVED,
          },
        ],
      }),
    );
    prisma.sportsMatchRoster.findMany.mockResolvedValue([sportsPublicRosterRecord()]);
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([sportsPublicOfficialAssignmentRecord()]);

    const result = await new SportsReadPublicService(prisma as never).publicMatch('match-1');

    expect(result.state).toBe(SportsMatchState.FINISHED);
    expect(result.rosters).toEqual([
      expect.objectContaining({ entries: [expect.objectContaining({ name: 'Ana Souza', role: 'PLAYER' })] }),
    ]);
    expect(result.officials).toEqual([{ name: 'Carlos S.', role: 'REFEREE' }]);
  });

  it('builds category brackets, standings, placements, aggregate scores, and fallback emoji from shared records', async () => {
    prisma.sportsTournament.findFirst.mockResolvedValue(sportsPublicTournamentRecord());
    prisma.sportsCategory.findMany.mockResolvedValue([
      {
        id: 'category-1',
        name: 'Futsal',
        sport: 'FUTSAL',
        customSportName: null,
        division: 'Aberto',
        format: 'SINGLE_ELIMINATION',
        rulesText: 'Dois tempos',
        eventGroup: { emoji: '' },
      },
      {
        id: 'category-empty',
        name: 'Xadrez',
        sport: 'CHESS',
        customSportName: null,
        division: null,
        format: 'SWISS',
        rulesText: null,
        eventGroup: { emoji: '♟️' },
      },
    ]);
    const blue = sportsPublicTeamRecord({ id: 'team-blue', name: 'Azul' });
    const green = sportsPublicTeamRecord({ id: 'team-green', name: 'Verde' });
    const yellow = sportsPublicTeamRecord({ id: 'team-yellow', name: 'Amarela' });
    prisma.sportsTeam.findMany.mockResolvedValue([blue, green, yellow]);
    prisma.sportsStage.findMany.mockResolvedValue([
      { id: 'stage-1', categoryId: 'category-1', name: 'Final', type: 'FINAL', displayOrder: 1 },
    ]);
    prisma.sportsMatch.findMany.mockResolvedValue([
      sportsPublicMatchRecord({
        actions: [
          {
            type: SportsMatchActionType.FINALIZE,
            payload: {
              winnerRegistrationId: 'registration-home',
              loserRegistrationId: 'registration-away',
              lossReason: 'SCORE',
            },
            authoredAt: sportsTestDate(-60_000),
            reviewStatus: SportsReviewStatus.APPROVED,
          },
        ],
      }),
      sportsPublicMatchRecord({ id: 'match-2', eventId: 'event-2', stageId: 'stage-1' }),
    ]);
    prisma.sportsMatchRoster.findMany.mockResolvedValue([sportsPublicRosterRecord()]);
    prisma.sportsStanding.findMany.mockResolvedValue([
      {
        stage: { categoryId: 'category-1' },
        registrationId: 'registration-blue',
        registration: { team: blue },
        played: 2,
        wins: 2,
        draws: 0,
        losses: 0,
        scoreFor: 5,
        scoreAgainst: 1,
        points: 6,
        rank: 1,
      },
    ]);
    prisma.sportsCategoryPlacement.findMany.mockResolvedValue([
      { categoryId: 'category-1', registration: { team: blue }, placement: 1, pointsAwarded: 10 },
    ]);
    prisma.sportsTournamentScoreEntry.findMany.mockResolvedValue([
      { teamId: 'team-green', team: green, points: 4 },
      { teamId: 'team-yellow', team: yellow, points: 4 },
      { teamId: 'team-blue', team: blue, points: 6 },
      { teamId: 'team-blue', team: blue, points: 3 },
    ]);

    const result = await new SportsReadPublicService(prisma as never).publicTournament({
      tournamentId: ' tournament-1 ',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'tournament-1',
        paymentTiers: [{ id: 'student', name: 'Estudante', value: 2500 }],
        teams: [
          expect.objectContaining({ id: 'team-blue' }),
          expect.objectContaining({ id: 'team-green' }),
          expect.objectContaining({ id: 'team-yellow' }),
        ],
        overallScores: [
          expect.objectContaining({ team: expect.objectContaining({ id: 'team-blue' }), points: 9 }),
          expect.objectContaining({ team: expect.objectContaining({ id: 'team-yellow' }), points: 4 }),
          expect.objectContaining({ team: expect.objectContaining({ id: 'team-green' }), points: 4 }),
        ],
      }),
    );
    expect(result.categories[0]).toEqual(
      expect.objectContaining({
        emoji: '🏅',
        standings: [expect.objectContaining({ points: 6, rank: 1 })],
        placements: [expect.objectContaining({ placement: 1, pointsAwarded: 10 })],
        brackets: [expect.objectContaining({ id: 'stage-1', matches: expect.arrayContaining([
          expect.objectContaining({ id: 'match-1' }),
          expect.objectContaining({ id: 'match-2', rosters: [] }),
        ]) })],
        matches: expect.arrayContaining([
          expect.objectContaining({
            id: 'match-1',
            state: SportsMatchState.FINISHED,
            rosters: [
              expect.objectContaining({
                entries: [expect.objectContaining({ name: 'Ana Souza', role: 'PLAYER' })],
              }),
            ],
          }),
          expect.objectContaining({ id: 'match-2', state: SportsMatchState.SCHEDULED, rosters: [] }),
        ]),
      }),
    );
    expect(prisma.sportsMatchRoster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ matchId: { in: ['match-1'] } }) }),
    );
    expect(result.categories[1]).toEqual(
      expect.objectContaining({ emoji: '♟️', standings: [], placements: [], brackets: [], matches: [] }),
    );
  });

  it('coalesces concurrent refreshes for the same tournament', async () => {
    const tournament = sportsPublicTournamentRecord();
    prisma.sportsTournament.findFirst.mockResolvedValue(tournament);
    let releaseCategories: ((value: unknown[]) => void) | undefined;
    prisma.sportsCategory.findMany.mockReturnValue(
      new Promise((resolve) => {
        releaseCategories = resolve;
      }),
    );
    const service = new SportsReadPublicService(prisma as never);

    const first = service.publicTournament({ tournamentId: 'tournament-1' });
    await Promise.resolve();
    const second = service.publicTournament({ tournamentId: 'tournament-1' });
    await Promise.resolve();
    await Promise.resolve();
    releaseCategories?.([]);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult).toBe(firstResult);
    expect(prisma.sportsCategory.findMany).toHaveBeenCalledTimes(1);
  });

  it('rehydrates live tournament metadata around a cached projection', async () => {
    const tournament = sportsPublicTournamentRecord({ selfSubscriptionEnabled: false });
    prisma.sportsTournament.findFirst.mockResolvedValue(tournament);
    const cached = {
      id: 'tournament-1',
      majorEventId: 'stale-major-event',
      name: 'Nome antigo',
      emoji: '❌',
      description: null,
      startDate: new Date(0),
      endDate: new Date(0),
      selfSubscriptionEnabled: true,
      selfSubscriptionAllowNoTeam: true,
      selfSubscriptionAllowNoCategory: true,
      requiresImageLicenseAgreement: false,
      isPaymentRequired: false,
      paymentTiers: [],
      teams: [],
      categories: [],
      matches: [],
      overallScores: [],
    };
    const redis = {
      mget: jest.fn().mockResolvedValue([JSON.stringify({ version: '2', tournament: cached }), '2']),
    };

    const result = await new SportsReadPublicService(prisma as never, redis as never).publicTournament({
      tournamentId: 'tournament-1',
    });

    expect(result.name).toBe('Jogos Universitários');
    expect(result.majorEventId).toBe('major-event-1');
    expect(result.selfSubscriptionEnabled).toBe(false);
    expect(result.startDate).toEqual((tournament.majorEvent as { startDate: Date }).startDate);
    expect(prisma.sportsCategory.findMany).not.toHaveBeenCalled();
  });
});
