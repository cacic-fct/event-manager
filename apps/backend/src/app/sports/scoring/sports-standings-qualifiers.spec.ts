import { ConflictException } from '@nestjs/common';
import { SportsMatchState, SportsReviewStatus } from '@prisma/client';
import {
  sportsGroupStageRecord,
  sportsQualifierEliminationStageRecord,
  sportsQualifierMatchRecord,
} from '../testing/sports-backend.fixtures';

jest.mock('../sports-match-event-sync', () => ({
  syncSportsMatchEventName: jest.fn().mockResolvedValue(undefined),
}));

import { syncSportsMatchEventName } from '../sports-match-event-sync';
import { SportsStandingsQualifiers } from './sports-standings-qualifiers';

class TestSportsStandingsQualifiers extends SportsStandingsQualifiers {
  refresh(tx: unknown, categoryId = 'category-1', actorId = 'actor-1') {
    return this.refreshGroupQualifiers(tx as never, categoryId, actorId);
  }

  registration(slot: Record<string, unknown>, standings: ReadonlyMap<string, string>) {
    return this.registrationForGroupSlot(slot, standings);
  }
}

describe('SportsStandingsQualifiers', () => {
  const advancement = { advanceBye: jest.fn() };
  const auditLog = { record: jest.fn() };
  let service: TestSportsStandingsQualifiers;

  beforeEach(() => {
    jest.clearAllMocks();
    advancement.advanceBye.mockResolvedValue([]);
    service = new TestSportsStandingsQualifiers(advancement as never, auditLog as never);
  });

  it('resolves only valid group-position slots', () => {
    const standings = new Map([['A:1', 'registration-a1']]);

    expect(service.registration({ type: 'GROUP_POSITION', groupKey: 'A', groupPosition: 1 }, standings)).toBe(
      'registration-a1',
    );
    expect(service.registration({ type: 'GROUP_POSITION', groupKey: 'A', groupPosition: 2 }, standings)).toBeNull();
    expect(service.registration({ type: 'BYE' }, standings)).toBeNull();
  });

  it('does nothing when no group or elimination stages exist', async () => {
    const tx = transaction([]);

    await expect(service.refresh(tx)).resolves.toEqual([]);

    expect(tx.sportsMatch.findFirst).not.toHaveBeenCalled();
  });

  it('does nothing when groups are complete but there is no elimination stage', async () => {
    const tx = transaction([sportsGroupStageRecord()]);

    await expect(service.refresh(tx)).resolves.toEqual([]);

    expect(tx.sportsMatch.findFirst).not.toHaveBeenCalled();
  });

  it('assigns completed group standings and publishes a merged invalidation', async () => {
    const match = sportsQualifierMatchRecord();
    const tx = transaction([sportsGroupStageRecord(), sportsQualifierEliminationStageRecord()], match);

    await expect(service.refresh(tx)).resolves.toEqual([
      {
        kind: 'GROUP_QUALIFIERS_ASSIGNED',
        tournamentId: 'tournament-1',
        categoryId: 'category-1',
        stageIds: ['elimination-stage'],
        matchIds: ['elimination-match-1'],
        publicMatchIds: ['elimination-match-1'],
      },
    ]);

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          homeRegistrationId: 'registration-a1',
          awayRegistrationId: 'registration-a2',
          updatedById: 'actor-1',
        }),
      }),
    );
    expect(syncSportsMatchEventName).toHaveBeenCalledWith(tx, 'elimination-match-1', 'actor-1');
  });

  it('reconciles previously assigned group qualifiers after standings change', async () => {
    const group = sportsGroupStageRecord({
      standings: [
        { registrationId: 'registration-a1', rank: 2 },
        { registrationId: 'registration-a2', rank: 1 },
      ],
    });
    const assigned = sportsQualifierMatchRecord({
      homeRegistrationId: 'registration-a1',
      awayRegistrationId: 'registration-a2',
    });
    const tx = transaction([group, sportsQualifierEliminationStageRecord({ matches: [assigned] })], assigned);

    await expect(service.refresh(tx)).resolves.toEqual([
      expect.objectContaining({ matchIds: ['elimination-match-1'] }),
    ]);

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          homeRegistrationId: 'registration-a1',
          awayRegistrationId: 'registration-a2',
        }),
        data: expect.objectContaining({
          homeRegistrationId: 'registration-a2',
          awayRegistrationId: 'registration-a1',
        }),
      }),
    );
  });

  it('advances a BYE after assigning the available qualifier', async () => {
    const elimination = sportsQualifierEliminationStageRecord({
      settings: {
        qualifierSlotsByMatch: {
          'elimination-match-1': {
            home: { type: 'BYE' },
            away: { type: 'GROUP_POSITION', groupKey: 'A', groupPosition: 1 },
          },
        },
      },
    });
    const tx = transaction([sportsGroupStageRecord(), elimination], sportsQualifierMatchRecord());
    tx.sportsMatch.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    advancement.advanceBye.mockResolvedValue([
      {
        kind: 'BRACKET_ADVANCEMENT',
        tournamentId: 'tournament-1',
        categoryId: 'category-1',
        stageIds: ['next-stage'],
        matchIds: ['next-match'],
        publicMatchIds: [],
      },
    ]);

    const invalidations = await service.refresh(tx);

    expect(tx.sportsMatch.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          canonicalState: SportsMatchState.FINISHED,
          reviewStatus: SportsReviewStatus.APPROVED,
          winnerRegistrationId: 'registration-a1',
        }),
      }),
    );
    expect(advancement.advanceBye).toHaveBeenCalledWith(tx, 'elimination-match-1', 'actor-1');
    expect(invalidations).toHaveLength(2);
  });

  it('skips absent, started, already assigned, or concurrently changed qualifier matches', async () => {
    const stages = [sportsGroupStageRecord(), sportsQualifierEliminationStageRecord()];
    const cases = [
      null,
      sportsQualifierMatchRecord({ canonicalState: SportsMatchState.LIVE }),
      sportsQualifierMatchRecord({ homeRegistrationId: 'registration-a1', awayRegistrationId: 'registration-a2' }),
      sportsQualifierMatchRecord(),
    ];

    for (const [index, match] of cases.entries()) {
      const tx = transaction(stages, match);
      if (index === cases.length - 1) {
        tx.sportsMatch.updateMany.mockResolvedValue({ count: 0 });
      }
      await expect(service.refresh(tx)).resolves.toEqual([]);
    }
  });

  it('clears assigned group qualifiers when a group result becomes incomplete', async () => {
    const incompleteGroup = sportsGroupStageRecord({
      matches: [
        {
          id: 'group-match-a1',
          canonicalState: SportsMatchState.FINISHED,
          reviewStatus: SportsReviewStatus.PENDING,
        },
      ],
    });
    const assigned = sportsQualifierMatchRecord({
      homeRegistrationId: 'registration-a1',
      awayRegistrationId: 'external-registration',
    });
    const elimination = sportsQualifierEliminationStageRecord({ matches: [assigned] });
    const tx = transaction([incompleteGroup, elimination]);
    tx.sportsMatch.findUniqueOrThrow.mockResolvedValue(assigned);

    const invalidations = await service.refresh(tx);

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ homeRegistrationId: null }) }),
    );
    expect(tx.sportsMatch.updateMany.mock.calls[0][0].data).not.toHaveProperty('awayRegistrationId');
    expect(invalidations[0]).toMatchObject({ kind: 'GROUP_QUALIFIERS_ASSIGNED' });
  });

  it('rejects clearing an already-started elimination match', async () => {
    const group = sportsGroupStageRecord({
      matches: [{ canonicalState: SportsMatchState.LIVE, reviewStatus: SportsReviewStatus.NOT_REQUIRED }],
    });
    const assigned = sportsQualifierMatchRecord({
      canonicalState: SportsMatchState.LIVE,
      homeRegistrationId: 'registration-a1',
    });
    const tx = transaction([group, sportsQualifierEliminationStageRecord({ matches: [assigned] })]);

    await expect(service.refresh(tx)).rejects.toThrow(
      new ConflictException('Redefina a eliminatória iniciada antes de corrigir a fase de grupos.'),
    );
  });

  it('rejects a concurrent change while clearing qualifiers', async () => {
    const group = sportsGroupStageRecord({
      matches: [{ canonicalState: SportsMatchState.FINISHED, reviewStatus: SportsReviewStatus.PENDING }],
    });
    const assigned = sportsQualifierMatchRecord({ homeRegistrationId: 'registration-a1' });
    const tx = transaction([group, sportsQualifierEliminationStageRecord({ matches: [assigned] })]);
    tx.sportsMatch.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refresh(tx)).rejects.toThrow(
      new ConflictException('A chave eliminatória mudou durante a reconciliação.'),
    );
  });

  it('ignores elimination matches outside qualifier slots or without group assignments while clearing', async () => {
    const group = sportsGroupStageRecord({
      matches: [{ canonicalState: SportsMatchState.FINISHED, reviewStatus: SportsReviewStatus.PENDING }],
    });
    const elimination = sportsQualifierEliminationStageRecord({
      matches: [
        sportsQualifierMatchRecord({ id: 'unrelated-match', homeRegistrationId: 'registration-a1' }),
        sportsQualifierMatchRecord({
          homeRegistrationId: 'external-home',
          awayRegistrationId: 'external-away',
        }),
      ],
    });
    const tx = transaction([group, elimination]);

    await expect(service.refresh(tx)).resolves.toEqual([]);

    expect(tx.sportsMatch.updateMany).not.toHaveBeenCalled();
  });
});

function transaction(stages: unknown[], match: unknown = null) {
  return {
    sportsStage: {
      findMany: jest.fn().mockResolvedValue(stages),
    },
    sportsMatch: {
      findFirst: jest.fn().mockResolvedValue(match),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}
