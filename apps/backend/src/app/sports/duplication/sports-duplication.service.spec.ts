import { ForbiddenException } from '@nestjs/common';
import { SportsDuplicationService } from './sports-duplication.service';

describe('SportsDuplicationService', () => {
  const actor = { sub: 'admin-1' };

  it('checks the destination MajorEvent freeze before cloning a tournament', async () => {
    const frozen = {
      assertMajorEventMutable: jest.fn().mockRejectedValue(new ForbiddenException()),
    };
    const prisma = { $transaction: jest.fn() };
    const service = new SportsDuplicationService(prisma as never, {} as never, {} as never, frozen as never);

    await expect(
      service.cloneTournament(
        {
          sourceTournamentId: 'source-1',
          destinationMajorEventId: 'major-2',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-2', actor, 'edit');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['category', 'team'] as const)(
    'resolves and checks the destination tournament before cloning a %s',
    async (kind) => {
      const frozen = {
        assertMajorEventMutable: jest.fn().mockRejectedValue(new ForbiddenException()),
      };
      const prisma = {
        sportsTournament: {
          findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-2' }),
        },
        $transaction: jest.fn(),
      };
      const service = new SportsDuplicationService(prisma as never, {} as never, {} as never, frozen as never);

      const operation =
        kind === 'category'
          ? service.cloneCategory(
              {
                sourceCategoryId: 'category-1',
                destinationTournamentId: 'tournament-2',
              },
              actor,
            )
          : service.cloneTeam(
              {
                sourceTeamId: 'team-1',
                destinationTournamentId: 'tournament-2',
              },
              actor,
            );

      await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
      expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-2', actor, 'edit');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
