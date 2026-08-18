import { BadRequestException } from '@nestjs/common';
import { SportsMatchActionType, SportsReviewStatus } from '@prisma/client';
import { sportsMatchRecord, sportsProjectionAction, sportsTestDate } from '../testing/sports-backend.fixtures';
import { SportsMatchOperationActorValidation } from './sports-match-operation-actor-validation';

class TestActorValidation extends SportsMatchOperationActorValidation {
  scorer(tx: unknown, match: unknown, rosterEntryId: string, payload: unknown) {
    return this.validateScorer(tx as never, match as never, rosterEntryId, payload as never);
  }
  occurrence(tx: unknown, match: unknown, payload: Record<string, unknown>) {
    return this.validateOccurrence(tx as never, match as never, payload);
  }
  actor(type: SportsMatchActionType, kind: 'ADMIN' | 'OFFICIAL' | 'LINEUP_MANAGER') {
    return this.assertActorMaySubmit(type, kind);
  }
  review(actions: Array<{ reviewStatus: SportsReviewStatus; type: SportsMatchActionType }>) {
    return this.resolveMatchReviewStatus(actions as never);
  }
  dates(payload: Record<string, unknown>) {
    return this.readRescheduleDates(payload);
  }
}

describe('SportsMatchOperationActorValidation', () => {
  const service = new TestActorValidation({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const tx = { sportsMatchRosterEntry: { findFirst: jest.fn() } };
  const match = sportsMatchRecord();

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['HOME', 'registration-home'],
    ['AWAY', 'registration-away'],
    ['UNKNOWN', undefined],
  ])('validates a scorer against the selected match side', async (side, registrationId) => {
    tx.sportsMatchRosterEntry.findFirst.mockResolvedValue({ id: 'entry-1' });

    await service.scorer(tx, match, 'entry-1', { side });

    expect(tx.sportsMatchRosterEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'entry-1',
          roster: expect.objectContaining({ matchId: 'match-1', registrationId }),
        }),
      }),
    );
  });

  it('rejects a scorer outside the approved roster', async () => {
    tx.sportsMatchRosterEntry.findFirst.mockResolvedValue(null);

    await expect(service.scorer(tx, match, 'entry-1', { side: 'HOME' })).rejects.toThrow(
      'O autor do ponto não pertence à escalação aprovada.',
    );
  });

  it('accepts a match occurrence without a person and validates an optional roster entry', async () => {
    await expect(service.occurrence(tx, match, { registrationId: ' registration-home ' })).resolves.toBeUndefined();
    expect(tx.sportsMatchRosterEntry.findFirst).not.toHaveBeenCalled();

    tx.sportsMatchRosterEntry.findFirst.mockResolvedValue({ id: 'entry-1' });
    await service.occurrence(tx, match, { rosterEntryId: ' entry-1 ' });
    expect(tx.sportsMatchRosterEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'entry-1' }) }),
    );
  });

  it('rejects occurrence teams and people outside the match', async () => {
    await expect(service.occurrence(tx, match, { registrationId: 'other' })).rejects.toThrow(
      'A equipe da ocorrência não participa desta partida.',
    );
    tx.sportsMatchRosterEntry.findFirst.mockResolvedValue(null);
    await expect(service.occurrence(tx, match, { rosterEntryId: 'entry-1' })).rejects.toThrow(
      'A pessoa da ocorrência não pertence à escalação da partida.',
    );
  });

  it('limits lineup managers to pre-match forfeits', () => {
    expect(() => service.actor(SportsMatchActionType.START, 'LINEUP_MANAGER')).toThrow(BadRequestException);
    expect(() => service.actor(SportsMatchActionType.FORFEIT, 'LINEUP_MANAGER')).not.toThrow();
    expect(() => service.actor(SportsMatchActionType.START, 'OFFICIAL')).not.toThrow();
  });

  it.each([
    [[action(SportsReviewStatus.PENDING)], SportsReviewStatus.PENDING],
    [[action(SportsReviewStatus.CHANGES_REQUESTED)], SportsReviewStatus.CHANGES_REQUESTED],
    [[action(SportsReviewStatus.REJECTED)], SportsReviewStatus.NOT_REQUIRED],
    [[], SportsReviewStatus.NOT_REQUIRED],
    [[action(SportsReviewStatus.APPROVED)], SportsReviewStatus.APPROVED],
  ])('resolves aggregate review status', (actions, expected) => {
    expect(service.review(actions)).toBe(expected);
  });

  it('parses a valid reschedule interval', () => {
    const startDate = sportsTestDate(60_000);
    const endDate = sportsTestDate(120_000);
    expect(service.dates({ startDate: startDate.toISOString(), endDate: endDate.toISOString() })).toEqual({
      startDate,
      endDate,
    });
  });

  it.each([
    {},
    { startDate: 'invalid', endDate: sportsTestDate(120_000).toISOString() },
    { startDate: sportsTestDate(60_000).toISOString(), endDate: 'invalid' },
    { startDate: sportsTestDate(60_000).toISOString(), endDate: sportsTestDate(60_000).toISOString() },
  ])('rejects invalid reschedule intervals', (payload) => {
    expect(() => service.dates(payload)).toThrow('Informe início e fim válidos para reagendar a partida.');
  });
});

function action(reviewStatus: SportsReviewStatus) {
  return sportsProjectionAction({ reviewStatus });
}
