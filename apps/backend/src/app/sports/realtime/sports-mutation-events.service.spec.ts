import { SportsMutationEventsService } from './sports-mutation-events.service';
import {
  PublicationState,
  SportsCategoryStatus,
  SportsMatchState,
  SportsReviewStatus,
  SportsTournamentStatus,
} from '@prisma/client';

describe('SportsMutationEventsService', () => {
  const realtime = {
    scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
    publish: jest.fn().mockResolvedValue(undefined),
    publishAutorouteInvalidations: jest.fn().mockResolvedValue(undefined),
  };
  const autorouting = {
    affectedPeopleForMatch: jest.fn().mockResolvedValue([]),
  };
  const dashboardInsights = {
    invalidateCachedInsights: jest.fn().mockResolvedValue(undefined),
  };
  const defaultRedirect = {
    invalidatePeople: jest.fn().mockResolvedValue(undefined),
  };
  const eventEffects = {
    syncEvent: jest.fn().mockResolvedValue(undefined),
    syncEvents: jest.fn().mockResolvedValue(undefined),
    syncEventGroup: jest.fn().mockResolvedValue(undefined),
    syncEventGroups: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes administrator, tournament, and match invalidations', async () => {
    const prisma = {
      sportsMatch: {
        findUnique: jest.fn().mockResolvedValue({
          category: { tournamentId: 'tournament-1' },
        }),
      },
    };
    const service = new SportsMutationEventsService(
      prisma as never,
      realtime as never,
      autorouting as never,
      dashboardInsights as never,
      defaultRedirect as never,
      eventEffects as never,
    );

    await service.publishForEntity('MATCH', 'match-1', true);

    expect(realtime.publish).toHaveBeenCalledTimes(3);
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-tournament:tournament-1',
      expect.objectContaining({
        type: 'INVALIDATE',
        entity: 'MATCH',
        entityId: 'match-1',
        tournamentId: 'tournament-1',
      }),
    );
    expect(realtime.publish).toHaveBeenCalledWith('tournament:tournament-1', expect.any(Object));
    expect(realtime.publish).toHaveBeenCalledWith('match:match-1', expect.any(Object));
  });

  it('keeps queued representative changes out of public streams', async () => {
    const prisma = {
      sportsTeamChangeRequest: {
        findUnique: jest.fn().mockResolvedValue({
          team: { tournamentId: 'tournament-1' },
        }),
      },
    };
    const service = new SportsMutationEventsService(
      prisma as never,
      realtime as never,
      autorouting as never,
      dashboardInsights as never,
      defaultRedirect as never,
      eventEffects as never,
    );

    await service.publishForEntity('TEAM_CHANGE', 'change-1', false);

    expect(realtime.publish).toHaveBeenCalledTimes(1);
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-tournament:tournament-1',
      expect.objectContaining({ entity: 'TEAM_CHANGE' }),
    );
  });

  it('fans team changes out to every affected match stream', async () => {
    const prisma = {
      sportsTeam: {
        findUnique: jest.fn().mockResolvedValue({
          tournamentId: 'tournament-1',
        }),
      },
      sportsMatch: {
        findMany: jest.fn().mockResolvedValue([{ id: 'match-1' }, { id: 'match-2' }]),
      },
    };
    const service = new SportsMutationEventsService(
      prisma as never,
      realtime as never,
      autorouting as never,
      dashboardInsights as never,
      defaultRedirect as never,
      eventEffects as never,
    );

    await service.publishForEntity('TEAM', 'team-1', true);

    expect(prisma.sportsMatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: { tournamentId: 'tournament-1' },
        }),
      }),
    );
    expect(realtime.publish).toHaveBeenCalledWith('match:match-1', expect.any(Object));
    expect(realtime.publish).toHaveBeenCalledWith('match:match-2', expect.any(Object));
  });

  it('coordinates projection cache, route, admin, review, and public effects once', async () => {
    autorouting.affectedPeopleForMatch.mockResolvedValueOnce(['person-1']);
    const service = new SportsMutationEventsService(
      {} as never,
      realtime as never,
      autorouting as never,
      dashboardInsights as never,
      defaultRedirect as never,
      eventEffects as never,
    );

    await service.publishMatchProjection({
      id: 'match-1',
      categoryId: 'category-1',
      state: SportsMatchState.LIVE,
      canonicalState: SportsMatchState.SCHEDULED,
      reviewStatus: SportsReviewStatus.PENDING,
      scoreboard: {},
      revision: 2,
      category: {
        deletedAt: null,
        status: SportsCategoryStatus.ACTIVE,
        tournament: {
          id: 'tournament-1',
          deletedAt: null,
          status: SportsTournamentStatus.LIVE,
          majorEvent: { deletedAt: null, publicationState: PublicationState.PUBLISHED },
        },
      },
      event: { deletedAt: null, publiclyVisible: true, publicationState: PublicationState.PUBLISHED },
    });

    expect(dashboardInsights.invalidateCachedInsights).toHaveBeenCalledTimes(1);
    expect(defaultRedirect.invalidatePeople).toHaveBeenCalledWith(['person-1']);
    expect(realtime.publishAutorouteInvalidations).toHaveBeenCalledWith(['person-1']);
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-tournament:tournament-1',
      expect.objectContaining({ tournamentId: 'tournament-1', revision: 2 }),
    );
    expect(realtime.publish).toHaveBeenCalledWith('match:match-1', expect.any(Object));
    expect(realtime.publish).toHaveBeenCalledWith('tournament:tournament-1', expect.any(Object));
    expect(realtime.publish).toHaveBeenCalledWith('review:match-1', expect.any(Object));
  });
});
