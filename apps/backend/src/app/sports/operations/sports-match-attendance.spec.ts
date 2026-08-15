import { SportsMatchState } from '@prisma/client';
import { startSportsMatchCheckInFromAthleteAttendance } from './sports-match-attendance';

describe('sports match attendance phase transition', () => {
  const tx = {
    sportsMatch: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    sportsMatchRosterEntry: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts check-in when a present attendance belongs to an approved match athlete', async () => {
    tx.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      state: SportsMatchState.SCHEDULED,
      canonicalState: SportsMatchState.SCHEDULED,
      revision: 4,
    });
    tx.sportsMatchRosterEntry.findFirst.mockResolvedValue({ id: 'roster-entry-1' });
    tx.sportsMatch.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      startSportsMatchCheckInFromAthleteAttendance({
        tx: tx as never,
        eventId: 'event-1',
        personId: 'athlete-1',
        updatedById: 'collector-1',
      }),
    ).resolves.toBe(true);

    expect(tx.sportsMatchRosterEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'APPROVED',
          roster: expect.objectContaining({ matchId: 'match-1', status: 'APPROVED' }),
          registrationMember: expect.objectContaining({
            eligibility: 'ELIGIBLE',
            teamMember: expect.objectContaining({
              status: 'APPROVED',
              participant: expect.objectContaining({ personId: 'athlete-1', status: 'ACTIVE' }),
            }),
          }),
        }),
      }),
    );
    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'match-1',
        deletedAt: null,
        state: SportsMatchState.SCHEDULED,
        revision: 4,
      },
      data: {
        state: SportsMatchState.CHECK_IN,
        canonicalState: SportsMatchState.CHECK_IN,
        revision: { increment: 1 },
        updatedById: 'collector-1',
      },
    });
  });

  it('does not move an already-started match back to check-in', async () => {
    tx.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      state: SportsMatchState.LIVE,
      canonicalState: SportsMatchState.LIVE,
      revision: 5,
    });

    await expect(
      startSportsMatchCheckInFromAthleteAttendance({
        tx: tx as never,
        eventId: 'event-1',
        personId: 'athlete-1',
      }),
    ).resolves.toBe(false);

    expect(tx.sportsMatchRosterEntry.findFirst).not.toHaveBeenCalled();
    expect(tx.sportsMatch.updateMany).not.toHaveBeenCalled();
  });

  it('does not start check-in for a person outside the approved match roster', async () => {
    tx.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      state: SportsMatchState.SCHEDULED,
      canonicalState: SportsMatchState.SCHEDULED,
      revision: 4,
    });
    tx.sportsMatchRosterEntry.findFirst.mockResolvedValue(null);

    await expect(
      startSportsMatchCheckInFromAthleteAttendance({
        tx: tx as never,
        eventId: 'event-1',
        personId: 'visitor-1',
      }),
    ).resolves.toBe(false);

    expect(tx.sportsMatch.updateMany).not.toHaveBeenCalled();
  });
});
