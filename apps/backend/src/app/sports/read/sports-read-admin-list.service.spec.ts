import { SportsReadAdminListService } from './sports-read-admin-list.service';

describe('SportsReadAdminListService', () => {
  const prisma = {
    sportsTournament: {
      findMany: jest.fn(),
    },
  };
  const authorization = {
    accessibleEventTargets: jest.fn(),
  };

  const tournamentRecord = {
    id: 'tournament-1',
    majorEventId: 'major-event-1',
    status: 'DRAFT',
    scoringMode: 'PER_SPORT',
    selfSubscriptionEnabled: false,
    selfSubscriptionAllowNoTeam: false,
    selfSubscriptionAllowNoCategory: false,
    allowPlayerMultipleTeams: false,
    revision: 1,
    finishedAt: null,
    createdAt: new Date('2026-08-13T12:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-08-13T12:00:00.000Z'),
    updatedById: null,
    deletedAt: null,
    majorEvent: {
      id: 'major-event-1',
      name: 'Major event',
      emoji: '🏆',
      startDate: new Date('2026-08-13T12:00:00.000Z'),
      endDate: new Date('2026-08-14T12:00:00.000Z'),
      isPaymentRequired: false,
    },
    _count: {
      categories: 2,
      teams: 1,
      playerApplications: 3,
    },
    categories: [{ _count: { matches: 4, registrations: 5 } }],
    teams: [{ _count: { changeRequests: 6 } }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authorization.accessibleEventTargets.mockResolvedValue(null);
    prisma.sportsTournament.findMany.mockResolvedValue([tournamentRecord]);
  });

  it('counts only valid pending team change requests without a deletedAt filter', async () => {
    const result = await new SportsReadAdminListService(prisma as never, authorization as never).adminTournamentList(
      undefined,
      {},
    );

    expect(result).toEqual([
      expect.objectContaining({
        categoryCount: 2,
        teamCount: 1,
        pendingApplicationCount: 3,
        pendingReviewCount: 15,
      }),
    ]);

    const query = prisma.sportsTournament.findMany.mock.calls[0]?.[0];
    expect(query.select.teams.select._count.select.changeRequests.where).toEqual({
      status: { in: ['PENDING', 'CONFLICT', 'CHANGES_REQUESTED'] },
      team: { tournament: {} },
    });
  });

  it('preserves the full-tournament scope for queue counts', async () => {
    authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set<string>(),
      eventGroupIds: new Set(['event-group-1']),
      majorEventIds: new Set<string>(),
    });

    await new SportsReadAdminListService(prisma as never, authorization as never).adminTournamentList(
      undefined,
      {},
    );

    const query = prisma.sportsTournament.findMany.mock.calls[0]?.[0];
    expect(query.select._count.select.playerApplications.where).toEqual({
      deletedAt: null,
      status: 'PENDING',
      tournament: { majorEventId: { in: [] } },
    });
    expect(query.select.teams.select._count.select.changeRequests.where).toEqual({
      status: { in: ['PENDING', 'CONFLICT', 'CHANGES_REQUESTED'] },
      team: { tournament: { majorEventId: { in: [] } } },
    });
  });
});
