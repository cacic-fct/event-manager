import { Prisma, SportsRosterEntryStatus, SportsRosterRole, SportsRosterStatus } from '@prisma/client';
import { sportsApprovedRosterRecord } from '../testing/sports-backend.fixtures';
import { SportsMatchRosterService } from './sports-match-roster.service';

describe('SportsMatchRosterCopyService', () => {
  const tx = {
    sportsMatchRoster: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    sportsMatchRosterEntry: { updateMany: jest.fn(), createMany: jest.fn() },
  };
  const service = new SportsMatchRosterService({} as never, {} as never, {} as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.sportsMatchRosterEntry.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsMatchRosterEntry.createMany.mockResolvedValue({ count: 1 });
  });

  it('does nothing when the winner has no approved source roster', async () => {
    tx.sportsMatchRoster.findFirst.mockResolvedValueOnce(null);

    await service.copyApprovedRosterForWinner(tx as never, 'source-match', 'destination-match', 'winner', 'admin-1');

    expect(tx.sportsMatchRoster.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.sportsMatchRoster.create).not.toHaveBeenCalled();
  });

  it('preserves a manually edited destination roster', async () => {
    tx.sportsMatchRoster.findFirst
      .mockResolvedValueOnce(sportsApprovedRosterRecord())
      .mockResolvedValueOnce({ id: 'destination-roster', manuallyEdited: true, entries: [] });

    await service.copyApprovedRosterForWinner(tx as never, 'source-match', 'destination-match', 'winner', 'admin-1');

    expect(tx.sportsMatchRosterEntry.updateMany).not.toHaveBeenCalled();
    expect(tx.sportsMatchRoster.update).not.toHaveBeenCalled();
  });

  it('creates an approved destination roster and copies approved entries with JSON-null semantics', async () => {
    tx.sportsMatchRoster.findFirst.mockResolvedValueOnce(sportsApprovedRosterRecord()).mockResolvedValueOnce(null);
    tx.sportsMatchRoster.create.mockResolvedValue({ id: 'destination-roster' });

    await service.copyApprovedRosterForWinner(tx as never, 'source-match', 'destination-match', 'winner', 'admin-1');

    expect(tx.sportsMatchRoster.create).toHaveBeenCalledWith({
      data: {
        matchId: 'destination-match',
        registrationId: 'winner',
        status: SportsRosterStatus.APPROVED,
        copiedFromRosterId: 'source-roster',
        createdById: 'admin-1',
        updatedById: 'admin-1',
      },
    });
    expect(tx.sportsMatchRosterEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          rosterId: 'destination-roster',
          registrationMemberId: 'member-1',
          status: SportsRosterEntryStatus.APPROVED,
          role: SportsRosterRole.PLAYER,
          shirtNumber: '10',
          roleMetadata: Prisma.DbNull,
          createdById: 'admin-1',
          updatedById: 'admin-1',
        },
        expect.objectContaining({
          rosterId: 'destination-roster',
          registrationMemberId: 'member-2',
          roleMetadata: { position: 'GOALKEEPER' },
        }),
      ],
    });
  });

  it('replaces an automatically copied destination roster atomically', async () => {
    tx.sportsMatchRoster.findFirst
      .mockResolvedValueOnce(sportsApprovedRosterRecord({ entries: [] }))
      .mockResolvedValueOnce({ id: 'destination-roster', manuallyEdited: false, entries: [{ id: 'old-entry' }] });
    tx.sportsMatchRoster.update.mockResolvedValue({ id: 'destination-roster' });

    await service.copyApprovedRosterForWinner(tx as never, 'source-match', 'destination-match', 'winner', 'admin-1');

    expect(tx.sportsMatchRosterEntry.updateMany).toHaveBeenCalledWith({
      where: { rosterId: 'destination-roster', deletedAt: null },
      data: { deletedAt: expect.any(Date), updatedById: 'admin-1' },
    });
    expect(tx.sportsMatchRoster.update).toHaveBeenCalledWith({
      where: { id: 'destination-roster' },
      data: {
        status: SportsRosterStatus.APPROVED,
        revision: { increment: 1 },
        copiedFromRosterId: 'source-roster',
        updatedById: 'admin-1',
      },
    });
    expect(tx.sportsMatchRosterEntry.createMany).not.toHaveBeenCalled();
  });
});
