import { SportsReadRepresentativeService } from './sports-read-representative.service';

describe('SportsReadRepresentativeService', () => {
  const prisma = {
    sportsTeam: { findFirst: jest.fn() },
    sportsTeamMember: { findMany: jest.fn() },
    sportsRegistration: { findMany: jest.fn() },
    sportsMatch: { findMany: jest.fn() },
    sportsPlayerApplication: { count: jest.fn() },
  };
  const publicReader = { mapPublicTeam: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sportsTeamMember.findMany.mockResolvedValue([]);
    prisma.sportsRegistration.findMany.mockResolvedValue([]);
    prisma.sportsMatch.findMany.mockResolvedValue([]);
  });

  it('returns only the count of organization-reviewable applications for the team', async () => {
    prisma.sportsTeam.findFirst.mockResolvedValue({
      id: 'team-1',
      name: 'Equipe 1',
      institution: null,
      logoSha256: null,
      revision: 3,
      changeRequests: [],
    });
    prisma.sportsPlayerApplication.count.mockResolvedValue(4);

    const service = new SportsReadRepresentativeService(prisma as never, publicReader as never);
    const result = await service.representativeTeamWorkspace('team-1', 'person-1');

    expect(prisma.sportsPlayerApplication.count).toHaveBeenCalledWith({
      where: {
        requestedTeamId: 'team-1',
        status: { in: ['PENDING', 'CHANGES_REQUESTED'] },
        deletedAt: null,
        tournament: { deletedAt: null },
        requestedTeam: { deletedAt: null },
        applicantPerson: { deletedAt: null },
      },
    });
    expect(result.joinQueueCount).toBe(4);
    expect(result).not.toHaveProperty('joinQueue');
  });
});
