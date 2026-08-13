import { PublicationState, SportsBracketSide, SportsMatchState } from '@prisma/client';
import { sportsBracketMatchRecord } from '../testing/sports-backend.fixtures';

jest.mock('../sports-match-event-sync', () => ({
  syncSportsMatchEventName: jest.fn().mockResolvedValue(undefined),
}));

import { SportsBracketAdvancementAssignments } from './sports-bracket-advancement-assignments';

class AssignmentHarness extends SportsBracketAdvancementAssignments {
  readonly advanceBye = jest.fn().mockResolvedValue([]);

  assign(...args: Parameters<AssignmentHarness['assignRegistration']>) {
    return this.assignRegistration(...args);
  }

  clear(...args: Parameters<AssignmentHarness['clearSourceAssignment']>) {
    return this.clearSourceAssignment(...args);
  }

  settle(...args: Parameters<AssignmentHarness['settleStructuralByeIfReady']>) {
    return this.settleStructuralByeIfReady(...args);
  }
}

describe('SportsBracketAdvancementAssignments', () => {
  const rosters = { copyApprovedRosterForWinner: jest.fn() };
  let service: AssignmentHarness;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AssignmentHarness(rosters as never);
  });

  it.each([
    [SportsBracketSide.HOME, 'homeRegistrationId'],
    [SportsBracketSide.AWAY, 'awayRegistrationId'],
  ])('assigns an empty %s slot and returns a public invalidation', async (side, field) => {
    const current = sportsBracketMatchRecord({
      id: 'target-1',
      event: { deletedAt: null, publiclyVisible: true, publicationState: PublicationState.PUBLISHED },
    });
    const tx = transaction(current, [{ count: 1 }]);

    const result = await service.assign(tx as never, 'target-1', side, 'registration-1', 'admin-1', 'BRACKET_ADVANCEMENT');

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ [field]: null }),
        data: expect.objectContaining({ [field]: 'registration-1', updatedById: 'admin-1' }),
      }),
    );
    expect(result[0]).toMatchObject({ matchIds: ['target-1'], publicMatchIds: ['target-1'] });
  });

  it('accepts an idempotent assignment after a concurrent update', async () => {
    const current = sportsBracketMatchRecord({ homeRegistrationId: 'registration-1' });
    const tx = transaction(current, [{ count: 0 }]);

    await expect(
      service.assign(tx as never, 'match-1', SportsBracketSide.HOME, 'registration-1', 'admin-1', 'BRACKET_ADVANCEMENT'),
    ).resolves.toHaveLength(1);
  });

  it('rejects a concurrently occupied assignment', async () => {
    const current = sportsBracketMatchRecord({ awayRegistrationId: 'other-registration' });
    const tx = transaction(current, [{ count: 0 }]);

    await expect(
      service.assign(tx as never, 'match-1', SportsBracketSide.AWAY, 'registration-1', 'admin-1', 'BRACKET_ADVANCEMENT'),
    ).rejects.toThrow('A vaga da chave foi alterada');
  });

  it('ignores a source assignment that is empty or belongs to another source', async () => {
    const tx = transaction(sportsBracketMatchRecord({ homeRegistrationId: 'unrelated' }));

    await expect(
      service.clear(tx as never, 'source-1', 'match-1', SportsBracketSide.HOME, ['registration-1'], 'admin-1'),
    ).resolves.toEqual([]);
    expect(tx.sportsMatch.updateMany).not.toHaveBeenCalled();
  });

  it('requires a started target to be reset before clearing its source assignment', async () => {
    const tx = transaction(
      sportsBracketMatchRecord({
        awayRegistrationId: 'registration-1',
        canonicalState: SportsMatchState.LIVE,
      }),
    );

    await expect(
      service.clear(tx as never, 'source-1', 'match-1', SportsBracketSide.AWAY, ['registration-1'], 'admin-1'),
    ).rejects.toThrow('redefinir primeiro a partida seguinte');
  });

  it('clears a matching assignment and soft-deletes only rosters copied from its source', async () => {
    const tx = transaction(sportsBracketMatchRecord({ awayRegistrationId: 'registration-1' }), [{ count: 1 }]);

    const result = await service.clear(
      tx as never,
      'source-1',
      'match-1',
      SportsBracketSide.AWAY,
      ['registration-1'],
      'admin-1',
    );

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ awayRegistrationId: null }) }),
    );
    expect(tx.sportsMatchRoster.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ copiedFromRoster: { is: { matchId: 'source-1' } } }) }),
    );
    expect(result).toHaveLength(1);
  });

  it('rejects a concurrent change while clearing an assignment', async () => {
    const tx = transaction(sportsBracketMatchRecord({ homeRegistrationId: 'registration-1' }), [{ count: 0 }]);

    await expect(
      service.clear(tx as never, 'source-1', 'match-1', SportsBracketSide.HOME, ['registration-1'], 'admin-1'),
    ).rejects.toThrow('mudou durante a reconciliação');
  });

  it('settles a ready structural bye and recursively advances it', async () => {
    const match = sportsBracketMatchRecord({
      homeRegistrationId: 'registration-1',
      stage: { settings: { structuralByeSides: { 'match-1': SportsBracketSide.AWAY } } },
    });
    const tx = transaction(match, [{ count: 1 }]);

    const result = await service.settle(tx as never, match as never, 'admin-1');

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          canonicalState: SportsMatchState.FINISHED,
          winnerRegistrationId: 'registration-1',
        }),
      }),
    );
    expect(service.advanceBye).toHaveBeenCalledWith(tx, 'match-1', 'admin-1');
    expect(result).toHaveLength(1);
  });

  it.each([
    [{ settings: {} }, null, 'registration-1'],
    [{ settings: { structuralByeSides: { 'match-1': SportsBracketSide.HOME } } }, null, null],
    [
      { settings: { structuralByeSides: { 'match-1': SportsBracketSide.HOME } } },
      'unexpected-registration',
      'registration-1',
    ],
  ])('does not settle an inapplicable structural bye', async (stage, homeRegistrationId, awayRegistrationId) => {
    const match = sportsBracketMatchRecord({ stage, homeRegistrationId, awayRegistrationId });
    const tx = transaction(match);

    await expect(service.settle(tx as never, match as never, 'admin-1')).resolves.toEqual([]);
    expect(tx.sportsMatch.updateMany).not.toHaveBeenCalled();
  });

  it('returns no invalidation when the structural-bye settlement loses a race', async () => {
    const match = sportsBracketMatchRecord({
      awayRegistrationId: 'registration-1',
      stage: { settings: { structuralByeSides: { 'match-1': SportsBracketSide.HOME } } },
    });
    const tx = transaction(match, [{ count: 0 }]);

    await expect(service.settle(tx as never, match as never, 'admin-1')).resolves.toEqual([]);
    expect(service.advanceBye).not.toHaveBeenCalled();
  });

  function transaction(match: Record<string, unknown>, updates: Array<{ count: number }> = []) {
    return {
      sportsMatch: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(match),
        updateMany: jest.fn().mockImplementation(() => Promise.resolve(updates.shift() ?? { count: 0 })),
      },
      sportsMatchRoster: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
  }
});
