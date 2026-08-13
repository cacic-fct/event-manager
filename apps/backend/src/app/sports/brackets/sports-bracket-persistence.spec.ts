import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SportsFormat, SportsMatchState, SportsReviewStatus, SportsStageType } from '@prisma/client';
import {
  sportsBracketParticipants,
  sportsBracketPersistenceCategory,
} from '../testing/sports-backend.fixtures';
import { SportsBracketBasicPersistence } from './sports-bracket-basic-persistence';

class TestSportsBracketPersistence extends SportsBracketBasicPersistence {
  readonly backedMatches: Array<Record<string, unknown>> = [];

  doubleElimination(tx: unknown, participantCount = 4, randomizeUnseeded = false) {
    const participants = sportsBracketParticipants(participantCount);
    return this.persistDoubleElimination(
      tx as never,
      sportsBracketPersistenceCategory() as never,
      { participants, randomizeUnseeded, randomSeed: randomizeUnseeded ? ' stable-seed ' : null },
      teamNames(participants),
      'actor-1',
    );
  }

  groupElimination(tx: unknown, participantCount = 4, bracketRules: Record<string, unknown> = {}) {
    const participants = sportsBracketParticipants(participantCount);
    return this.persistGroupStageElimination(
      tx as never,
      sportsBracketPersistenceCategory({ bracketRules }) as never,
      participants,
      teamNames(participants),
      'actor-1',
    );
  }

  singleElimination(tx: unknown, participantCount = 4, randomizeUnseeded = false) {
    const participants = sportsBracketParticipants(participantCount);
    return this.persistSingleElimination(
      tx as never,
      sportsBracketPersistenceCategory() as never,
      { participants, randomizeUnseeded, randomSeed: randomizeUnseeded ? ' seeded ' : null },
      teamNames(participants),
      'actor-1',
    );
  }

  roundRobin(tx: unknown, participantCount = 4, doubleRoundRobin = false) {
    const participants = sportsBracketParticipants(participantCount);
    return this.persistRoundRobin(
      tx as never,
      sportsBracketPersistenceCategory({ standingsRules: { doubleRoundRobin } }) as never,
      participants.map((participant) => participant.registrationId),
      teamNames(participants),
      'actor-1',
    );
  }

  swiss(
    tx: unknown,
    participantCount = 4,
    bracketRules: Record<string, unknown> = {},
    omitLastSeed = false,
  ) {
    const participants = sportsBracketParticipants(participantCount);
    const persistedParticipants = omitLastSeed
      ? participants.map((participant, index) =>
          index === participants.length - 1 ? { registrationId: participant.registrationId } : participant,
        )
      : participants;
    return this.persistInitialSwissRound(
      tx as never,
      sportsBracketPersistenceCategory({ bracketRules, standingsRules: { byePoints: 2 } }) as never,
      persistedParticipants,
      teamNames(persistedParticipants),
      'actor-1',
    );
  }

  protected override async createBackedMatch(
    _tx: unknown,
    input: {
      stageId: string;
      name: string;
      homeRegistrationId: string | null;
      awayRegistrationId: string | null;
      roundNumber: number;
      bracketPosition: number;
      automaticWinnerRegistrationId: string | null;
    },
  ) {
    const match = { id: `match-${this.backedMatches.length + 1}`, ...input };
    this.backedMatches.push(match);
    return match;
  }
}

describe('sports bracket persistence', () => {
  const advancement = { advanceBye: jest.fn().mockResolvedValue([]) };
  const frozen = { assertEventGroupMutable: jest.fn() };
  const realtime = { publishStructuralInvalidations: jest.fn() };
  const eventEffects = { syncEvents: jest.fn() };
  let tx: ReturnType<typeof transaction>;
  let service: TestSportsBracketPersistence;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = transaction();
    service = new TestSportsBracketPersistence(
      { $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) } as never,
      advancement as never,
      {} as never,
      realtime as never,
      frozen as never,
      eventEffects as never,
    );
  });

  it('persists double-elimination stages, routes, final reset, and structural byes', async () => {
    const stageIds = await service.doubleElimination(tx, 3, true);

    expect(stageIds).toEqual(['stage-1', 'stage-2', 'stage-3']);
    expect(tx.sportsStage.create).toHaveBeenCalledTimes(3);
    expect(tx.sportsStage.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          type: SportsStageType.WINNERS_BRACKET,
          settings: expect.objectContaining({ randomSeed: 'stable-seed' }),
        }),
      }),
    );
    expect(service.backedMatches.some((match) => match['automaticWinnerRegistrationId'] !== null)).toBe(true);
    expect(tx.sportsMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ winnerAdvancesToSide: 'HOME', loserAdvancesToSide: 'AWAY' }),
      }),
    );
    expect(tx.sportsStage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stage-3' },
        data: expect.objectContaining({
          settings: expect.objectContaining({
            resetRule: expect.objectContaining({ sourceMatchId: expect.any(String), resetMatchId: expect.any(String) }),
          }),
        }),
      }),
    );
    expect(advancement.advanceBye).toHaveBeenCalled();
  });

  it('persists manually seeded double elimination without randomization', async () => {
    await service.doubleElimination(tx, 4);

    expect(tx.sportsStage.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ settings: expect.objectContaining({ randomSeed: null }) }) }),
    );
  });

  it('persists group standings, round-robin matches, qualifier slots, and elimination routes', async () => {
    const stageIds = await service.groupElimination(tx, 6, {
      groupCount: 2,
      qualifiersPerGroup: 2,
      doubleRoundRobin: true,
    });

    expect(stageIds).toEqual(['stage-1', 'stage-2', 'stage-3']);
    expect(tx.sportsStanding.createMany).toHaveBeenCalledTimes(2);
    expect(tx.sportsStage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: SportsStageType.ELIMINATION, name: 'Eliminatórias' }),
      }),
    );
    expect(tx.sportsStage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          settings: expect.objectContaining({
            format: SportsFormat.GROUP_STAGE_ELIMINATION,
            qualifierSlotsByMatch: expect.any(Object),
          }),
        },
      }),
    );
    expect(tx.sportsMatch.update).toHaveBeenCalled();
  });

  it('rejects more qualifiers than the smallest group can provide', async () => {
    await expect(
      service.groupElimination(tx, 5, { groupCount: 2, qualifiersPerGroup: 3 }),
    ).rejects.toThrow(
      new BadRequestException('A quantidade de classificados por grupo não pode superar o menor grupo.'),
    );

    expect(tx.sportsStage.create).not.toHaveBeenCalled();
  });

  it('persists a single-elimination bracket and advances structural byes', async () => {
    await expect(service.singleElimination(tx, 3)).resolves.toBe('stage-1');

    expect(tx.sportsStage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SportsStageType.ELIMINATION,
          settings: expect.objectContaining({ format: SportsFormat.SINGLE_ELIMINATION, randomSeed: null }),
        }),
      }),
    );
    expect(tx.sportsMatch.update).toHaveBeenCalled();
    expect(advancement.advanceBye).toHaveBeenCalled();
  });

  it('persists randomized single elimination with a trimmed stable seed', async () => {
    await service.singleElimination(tx, 4, true);

    expect(tx.sportsStage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ settings: expect.objectContaining({ randomSeed: 'seeded' }) }) }),
    );
  });

  it.each([false, true])('persists round robin standings and matches (double=%s)', async (doubleRoundRobin) => {
    await expect(service.roundRobin(tx, 4, doubleRoundRobin)).resolves.toBe('stage-1');

    expect(tx.sportsStanding.createMany).toHaveBeenCalledWith({
      data: sportsBracketParticipants(4).map((participant) => ({
        stageId: 'stage-1',
        registrationId: participant.registrationId,
      })),
    });
    expect(service.backedMatches).toHaveLength(doubleRoundRobin ? 12 : 6);
  });

  it('persists the initial Swiss round and records an odd-participant bye', async () => {
    await expect(service.swiss(tx, 3, { maximumRounds: 4 })).resolves.toBe('stage-1');

    expect(tx.sportsStage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: SportsStageType.SWISS, settings: { format: SportsFormat.SWISS, maximumRounds: 4 } }),
      }),
    );
    expect(tx.sportsStanding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ points: { increment: 2 }, tiebreakData: expect.objectContaining({ byeCount: 1 }) }),
      }),
    );
  });

  it('persists an even Swiss round without manufacturing a bye', async () => {
    await service.swiss(tx, 4, {}, true);

    expect(tx.sportsStanding.update).not.toHaveBeenCalled();
    expect(service.backedMatches).toHaveLength(2);
    expect(tx.sportsStanding.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ tiebreakData: { byeCount: 0, seed: null } })]),
      }),
    );
  });

  it('generates the next Swiss round after the current round is approved', async () => {
    tx.sportsCategory.findFirst.mockResolvedValue(swissCategory());
    tx.sportsMatch.findMany.mockResolvedValue([
      {
        id: 'generated-match-1',
        eventId: 'generated-event-1',
        event: { deletedAt: null, publiclyVisible: true, publicationState: 'PUBLISHED' },
      },
      {
        id: 'generated-match-2',
        eventId: 'generated-event-2',
        event: { deletedAt: null, publiclyVisible: false, publicationState: 'DRAFT' },
      },
    ]);

    await expect(service.generateNextSwissRound('category-1', { sub: 'actor-1' } as never)).resolves.toHaveLength(2);

    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('event-group-1', expect.anything(), 'edit');
    expect(tx.sportsStage.update).toHaveBeenCalledWith({
      where: { id: 'stage-swiss' },
      data: { generationRevision: { increment: 1 }, updatedById: 'actor-1' },
    });
    expect(eventEffects.syncEvents).toHaveBeenCalledWith(['generated-event-1', 'generated-event-2']);
    expect(realtime.publishStructuralInvalidations).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'SWISS_ROUND_GENERATED',
        matchIds: ['generated-match-1', 'generated-match-2'],
        publicMatchIds: ['generated-match-1'],
      }),
    ]);
  });

  it('rejects generating a Swiss round without an authenticated actor or stage', async () => {
    await expect(service.generateNextSwissRound('category-1', {} as never)).rejects.toBeInstanceOf(BadRequestException);
    tx.sportsCategory.findFirst.mockResolvedValue(null);
    await expect(service.generateNextSwissRound('category-1', { sub: 'actor-1' } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects generating while the current Swiss round is unfinished', async () => {
    const category = swissCategory();
    category.stages[0].matches[0].reviewStatus = SportsReviewStatus.PENDING;
    tx.sportsCategory.findFirst.mockResolvedValue(category);

    await expect(service.generateNextSwissRound('category-1', { sub: 'actor-1' } as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects generating beyond the configured maximum Swiss rounds', async () => {
    tx.sportsCategory.findFirst.mockResolvedValue(swissCategory({ maximumRounds: 1 }));

    await expect(service.generateNextSwissRound('category-1', { sub: 'actor-1' } as never)).rejects.toThrow(
      'A etapa atingiu o número máximo de rodadas.',
    );
  });
});

function transaction() {
  let stageSequence = 0;
  return {
    sportsStage: {
      create: jest.fn(async () => ({ id: `stage-${++stageSequence}` })),
      update: jest.fn(),
    },
    sportsStanding: {
      createMany: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'standing-bye', tiebreakData: { byeCount: 0 } }),
      update: jest.fn(),
    },
    sportsMatch: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    sportsCategory: { findFirst: jest.fn() },
  };
}

function teamNames(participants: Array<{ registrationId: string }>): Map<string, string> {
  return new Map(participants.map((participant, index) => [participant.registrationId, `Equipe ${index + 1}`]));
}

function swissCategory(settings: Record<string, unknown> = { maximumRounds: 3 }) {
  const base = sportsBracketPersistenceCategory();
  const participants = sportsBracketParticipants(4);
  return {
    ...base,
    tournament: { ...(base['tournament'] as object), id: 'tournament-1' },
    stages: [
      {
        id: 'stage-swiss',
        settings,
        standings: participants.map((participant, index) => ({
          registrationId: participant.registrationId,
          points: 3 - index,
          scoreFor: 2,
          scoreAgainst: index,
          tiebreakData: { buchholz: 4 - index, seed: participant.seed, byeCount: 0 },
          registration: { team: { name: `Equipe ${index + 1}` } },
        })),
        matches: [
          {
            roundNumber: 1,
            reviewStatus: SportsReviewStatus.APPROVED,
            canonicalState: SportsMatchState.FINISHED,
            drawWillReschedule: false,
            homeRegistrationId: 'registration-1',
            awayRegistrationId: 'registration-2',
          },
          {
            roundNumber: null,
            reviewStatus: SportsReviewStatus.APPROVED,
            canonicalState: SportsMatchState.FINISHED,
            drawWillReschedule: false,
            homeRegistrationId: null,
            awayRegistrationId: 'registration-3',
          },
          {
            roundNumber: 1,
            reviewStatus: SportsReviewStatus.APPROVED,
            canonicalState: SportsMatchState.DRAW,
            drawWillReschedule: true,
            homeRegistrationId: 'registration-3',
            awayRegistrationId: 'registration-4',
          },
        ],
      },
    ],
  };
}
