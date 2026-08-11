import { ForbiddenException } from '@nestjs/common';
import { SportsDuplicationService } from './sports-duplication.service';
import { SportsTeamDuplicationService } from './sports-team-duplication.service';

describe('SportsDuplicationService', () => {
  const actor = { sub: 'admin-1' };

  it('checks the destination MajorEvent freeze before cloning a tournament', async () => {
    const frozen = {
      assertMajorEventMutable: jest.fn().mockRejectedValue(new ForbiddenException()),
    };
    const prisma = { $transaction: jest.fn() };
    const service = createService(prisma, {}, frozen);

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
      const service = createService(prisma, {}, frozen);

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

  it('copies logo metadata only when cloning a team with includeLogo enabled', async () => {
    const createdTeam = { id: 'team-2', name: 'Equipe clonada' };
    const tx = {
      sportsTeam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'team-1',
          name: 'Equipe original',
          institution: 'Instituição',
          logoObjectKey: 'sports/team-1/logo.png',
          logoSha256: 'abc123',
          logoMimeType: 'image/png',
          logoSizeBytes: 1234,
          representatives: [],
          members: [],
        }),
        create: jest.fn().mockResolvedValue(createdTeam),
      },
      sportsTournament: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tournament-2', majorEventId: 'major-2' }),
      },
    };
    const prisma = {
      sportsTournament: {
        findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-2' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const auditLog = { record: jest.fn() };
    const frozen = { assertMajorEventMutable: jest.fn() };
    const service = createService(prisma, auditLog, frozen);

    await expect(
      service.cloneTeam(
        {
          sourceTeamId: 'team-1',
          destinationTournamentId: 'tournament-2',
          includeLogo: true,
        },
        actor,
      ),
    ).resolves.toEqual(createdTeam);

    expect(tx.sportsTeam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        logoObjectKey: 'sports/team-1/logo.png',
        logoSha256: 'abc123',
        logoMimeType: 'image/png',
        logoSizeBytes: 1234,
      }),
    });
  });

  function createService(prisma: object, auditLog: object, frozen: object): SportsDuplicationService {
    const teamDuplicator = new SportsTeamDuplicationService(
      prisma as never,
      {} as never,
      auditLog as never,
      frozen as never,
    );
    return new SportsDuplicationService(prisma as never, auditLog as never, frozen as never, teamDuplicator);
  }
});
