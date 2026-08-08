import { Permission } from '@cacic-fct/shared-permissions';
import { NotFoundException } from '@nestjs/common';
import { SportsPlayerApplicationReadService } from './sports-player-application-read.service';

describe('SportsPlayerApplicationReadService', () => {
  const prisma = {
    sportsPlayerApplication: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    sportsTournamentParticipant: {
      findMany: jest.fn(),
    },
  };
  const policy = {
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const actor = { sub: 'admin-1' } as never;
  let service: SportsPlayerApplicationReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    policy.assertPermissions.mockResolvedValue(undefined);
    prisma.sportsPlayerApplication.findMany.mockResolvedValue([]);
    prisma.sportsTournamentParticipant.findMany.mockResolvedValue([]);
    service = new SportsPlayerApplicationReadService(
      prisma as never,
      policy as never,
    );
  });

  it('returns a bounded admin review queue with only the required applicant identity', async () => {
    prisma.sportsPlayerApplication.findMany.mockResolvedValue([
      applicationRecord(),
    ]);
    prisma.sportsTournamentParticipant.findMany.mockResolvedValue([
      {
        personId: 'person-1',
        status: 'WAITING_PAYMENT',
        paymentStatus: 'WAITING_PAYMENT',
      },
    ]);

    const result = await service.adminQueue(actor, 'tournament-1');

    expect(policy.assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.SportsRegistration.Read],
      { sportsTournamentId: 'tournament-1' },
    );
    expect(prisma.sportsPlayerApplication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          applicantPerson: { deletedAt: null },
        }),
        take: 200,
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'application-1',
        applicant: {
          personId: 'person-1',
          name: 'Maria da Silva',
        },
        requestedTeam: expect.objectContaining({
          id: 'team-1',
          logoUrl: '/api/sports/teams/team-1/logo/hash-1',
        }),
        participantStatus: 'WAITING_PAYMENT',
        paymentStatus: 'WAITING_PAYMENT',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('identityDocument');
    expect(JSON.stringify(result)).not.toContain('email');
    expect(JSON.stringify(result)).not.toContain('phone');
  });

  it('scopes current-user applications to the resolved person', async () => {
    await service.currentUserApplications('tournament-1', 'person-1');

    expect(prisma.sportsPlayerApplication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          applicantPersonId: 'person-1',
        }),
      }),
    );
    expect(policy.assertPermissions).not.toHaveBeenCalled();
  });

  it('does not disclose whether a deleted or inaccessible application exists', async () => {
    prisma.sportsPlayerApplication.findFirst.mockResolvedValue(null);

    await expect(
      service.adminDetail(actor, 'application-1'),
    ).rejects.toThrow(NotFoundException);
  });
});

function applicationRecord() {
  return {
    id: 'application-1',
    tournamentId: 'tournament-1',
    applicantPersonId: 'person-1',
    applicantPerson: {
      name: 'Maria da Silva',
    },
    requestedTeam: {
      id: 'team-1',
      name: 'Equipe A',
      institution: 'Universidade',
      logoSha256: 'hash-1',
    },
    status: 'PENDING',
    paymentTier: 'Estudante',
    noticeAcceptedAt: new Date('2026-07-01T12:00:00.000Z'),
    reviewedAt: null,
    reviewMessage: null,
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
    updatedAt: new Date('2026-07-01T12:00:00.000Z'),
    categoryChoices: [
      {
        category: {
          id: 'category-1',
          name: 'Futsal',
          division: 'Misto',
        },
      },
    ],
  };
}
