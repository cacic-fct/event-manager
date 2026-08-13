import { NotFoundException } from '@nestjs/common';
import { PublicationState, SportsReviewStatus } from '@prisma/client';
import { sportsMatchRecord } from '../testing/sports-backend.fixtures';
import { SportsMutationEventsService } from './sports-mutation-events.service';

describe('SportsMutationEventsService extended behavior', () => {
  const realtime = {
    scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
    publish: jest.fn(),
    publishAutorouteInvalidations: jest.fn(),
  };
  const autorouting = { affectedPeopleForMatch: jest.fn().mockResolvedValue(['person-match']) };
  const dashboardInsights = { invalidateCachedInsights: jest.fn() };
  const defaultRedirect = { invalidatePeople: jest.fn() };
  const eventEffects = {
    syncEvent: jest.fn(),
    syncEvents: jest.fn(),
    syncEventGroup: jest.fn(),
    syncEventGroups: jest.fn(),
  };
  let prisma: ReturnType<typeof prismaClient>;
  let service: SportsMutationEventsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = prismaClient();
    service = new SportsMutationEventsService(
      prisma as never,
      realtime as never,
      autorouting as never,
      dashboardInsights as never,
      defaultRedirect as never,
      eventEffects as never,
    );
  });

  it.each([
    ['TOURNAMENT', 'tournament-1'],
    ['CATEGORY', 'category-1'],
    ['TEAM', 'team-1'],
    ['REGISTRATION', 'registration-1'],
    ['MATCH', 'match-1'],
    ['OFFICIAL', 'official-1'],
    ['REPRESENTATIVE', 'representative-1'],
    ['APPLICATION', 'application-1'],
    ['TEAM_CHANGE', 'change-1'],
    ['ROSTER', 'roster-1'],
    ['VENUE', 'venue-1'],
    ['SCORE_ENTRY', 'score-1'],
  ] as const)('resolves and publishes private %s invalidations', async (entity, id) => {
    await service.publishForEntity(entity, id, false);

    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-tournament:tournament-1',
      expect.objectContaining({ entity, entityId: id, tournamentId: 'tournament-1' }),
    );
  });

  it('synchronizes backing resources for match, category, tournament, and venue mutations', async () => {
    await service.publishForEntity('MATCH', 'match-1', false);
    await service.publishForEntity('CATEGORY', 'category-1', false);
    await service.publishForEntity('TOURNAMENT', 'tournament-1', false);
    await service.publishForEntity('VENUE', 'venue-1', false);

    expect(eventEffects.syncEvent).toHaveBeenCalledWith('event-1');
    expect(eventEffects.syncEventGroup).toHaveBeenCalledWith('event-group-1');
    expect(eventEffects.syncEventGroups).toHaveBeenCalledWith(['event-group-1']);
    expect(eventEffects.syncEvents).toHaveBeenCalledWith(['event-1', 'event-2']);
  });

  it('publishes invalidations for sports resources addressed through their backing records', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue({ id: 'match-1' });
    await service.publishForBackingEvent('event-1');

    expect(realtime.publish).toHaveBeenCalledWith('tournament:tournament-1', expect.any(Object));

    prisma.sportsCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    await service.publishForBackingEventGroup('event-group-1');

    expect(realtime.publish).toHaveBeenCalledWith('tournament:tournament-1', expect.any(Object));
    expect(prisma.sportsMatch.findFirst).toHaveBeenCalledWith({
      where: { eventId: 'event-1', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.sportsCategory.findFirst).toHaveBeenCalledWith({
      where: { eventGroupId: 'event-group-1', deletedAt: null },
      select: { id: true },
    });
  });

  it('does not synchronize missing match or category resources', async () => {
    prisma.sportsMatch.findUnique
      .mockResolvedValueOnce({ category: { tournamentId: 'tournament-1' } })
      .mockResolvedValueOnce(null);
    prisma.sportsCategory.findUnique
      .mockResolvedValueOnce({ tournamentId: 'tournament-1' })
      .mockResolvedValueOnce(null);

    await service.publishForEntity('MATCH', 'match-1', false);
    await service.publishForEntity('CATEGORY', 'category-1', false);

    expect(eventEffects.syncEvent).not.toHaveBeenCalled();
    expect(eventEffects.syncEventGroup).not.toHaveBeenCalled();
  });

  it.each([
    ['MATCH', 'match-1', ['match-1']],
    ['ROSTER', 'roster-1', ['match-roster']],
    ['OFFICIAL', 'official-1', ['match-official']],
    ['OFFICIAL', 'official-category', ['match-1', 'match-2']],
    ['CATEGORY', 'category-1', ['match-1', 'match-2']],
    ['VENUE', 'venue-1', ['match-1', 'match-2']],
    ['REGISTRATION', 'registration-1', ['match-1', 'match-2']],
    ['TEAM', 'team-1', ['match-1', 'match-2']],
    ['TEAM_CHANGE', 'change-1', ['match-1', 'match-2']],
    ['APPLICATION', 'application-1', []],
  ] as const)('publishes affected public match streams for %s', async (entity, id, expectedMatches) => {
    if (id === 'official-category') {
      prisma.sportsOfficialAssignment.findUnique
        .mockResolvedValueOnce({ tournamentId: 'tournament-1' })
        .mockResolvedValueOnce({ personId: 'person-official' })
        .mockResolvedValueOnce({ matchId: null, categoryId: 'category-1' });
    }
    await service.publishForEntity(entity, id, true);

    for (const matchId of expectedMatches) {
      expect(realtime.publish).toHaveBeenCalledWith(`match:${matchId}`, expect.any(Object));
    }
    expect(realtime.publish).toHaveBeenCalledWith('tournament:tournament-1', expect.any(Object));
  });

  it('handles missing roster and team-change fanout records without public match streams', async () => {
    prisma.sportsMatchRoster.findUnique
      .mockResolvedValueOnce({ match: { category: { tournamentId: 'tournament-1' } } })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.sportsTeamChangeRequest.findUnique
      .mockResolvedValueOnce({ team: { tournamentId: 'tournament-1' } })
      .mockResolvedValueOnce({ team: { tournamentId: 'tournament-1' } })
      .mockResolvedValueOnce(null);

    await service.publishForEntity('ROSTER', 'roster-1', true);
    await service.publishForEntity('TEAM_CHANGE', 'change-1', true);

    expect(realtime.publish).not.toHaveBeenCalledWith(expect.stringMatching(/^match:/), expect.any(Object));
  });

  it.each([
    ['OFFICIAL', ['person-official']],
    ['REPRESENTATIVE', ['person-representative']],
    ['ROSTER', ['person-match']],
    ['APPLICATION', []],
  ] as const)('publishes autoroute invalidations for %s', async (entity, people) => {
    await service.publishForEntity(entity, `${entity.toLowerCase()}-1`, false);
    expect(realtime.publishAutorouteInvalidations).toHaveBeenCalledWith(people);
  });

  it('publishes public pending projections and keeps private approved projections scoped to administrators', async () => {
    const publicMatch = sportsMatchRecord({ reviewStatus: SportsReviewStatus.PENDING });
    await service.publishMatchProjection(publicMatch as never);
    expect(realtime.publish).toHaveBeenCalledWith('review:match-1', expect.any(Object));
    expect(realtime.publish).toHaveBeenCalledWith('match:match-1', expect.any(Object));

    jest.clearAllMocks();
    await service.publishMatchProjection(
      sportsMatchRecord({
        reviewStatus: SportsReviewStatus.APPROVED,
        event: { deletedAt: null, publiclyVisible: false, publicationState: PublicationState.DRAFT },
      }) as never,
    );
    expect(realtime.publish).toHaveBeenCalledTimes(1);
    expect(realtime.publish).toHaveBeenCalledWith('admin-tournament:tournament-1', expect.any(Object));
  });

  it.each([
    [true, PublicationState.PUBLISHED, 4],
    [false, PublicationState.DRAFT, 2],
  ])('publishes roster mutation with public=%s', async (publiclyVisible, publicationState, publishCount) => {
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      revision: 4,
      category: { tournamentId: 'tournament-1' },
      event: { deletedAt: null, publiclyVisible, publicationState },
    });

    await service.publishRosterMutation('match-1', 'ROSTER_APPROVED', 'roster-1');

    expect(realtime.publish).toHaveBeenCalledTimes(publishCount);
    expect(defaultRedirect.invalidatePeople).toHaveBeenCalledWith(['person-match']);
  });

  it('ignores roster mutation publication after the match disappears', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue(null);
    await service.publishRosterMutation('missing', 'ROSTER_APPROVED', 'roster-1');
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it('throws a typed not-found error when an invalidation entity disappears', async () => {
    prisma.sportsVenue.findUnique.mockResolvedValue(null);
    await expect(service.publishForEntity('VENUE', 'missing', false)).rejects.toBeInstanceOf(NotFoundException);
  });
});

function prismaClient() {
  const categoryBacking = {
    eventGroupId: 'event-group-1',
    matches: [{ eventId: 'event-1' }, { eventId: 'event-2' }],
  };
  return {
    sportsCategory: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockImplementation(async ({ select }) =>
        'tournamentId' in select ? { tournamentId: 'tournament-1' } : categoryBacking,
      ),
      findMany: jest.fn().mockResolvedValue([categoryBacking]),
    },
    sportsTeam: { findUnique: jest.fn().mockResolvedValue({ tournamentId: 'tournament-1' }) },
    sportsRegistration: { findUnique: jest.fn().mockResolvedValue({ category: { tournamentId: 'tournament-1' } }) },
    sportsMatch: {
      findUnique: jest.fn().mockImplementation(async ({ select }) =>
        'eventId' in select ? { eventId: 'event-1' } : { category: { tournamentId: 'tournament-1' } },
      ),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ id: 'match-1', eventId: 'event-1' }, { id: 'match-2', eventId: 'event-2' }]),
    },
    sportsOfficialAssignment: {
      findUnique: jest.fn().mockImplementation(async ({ select }) => {
        if ('tournamentId' in select) return { tournamentId: 'tournament-1' };
        if ('personId' in select) return { personId: 'person-official' };
        return { matchId: 'match-official', categoryId: null };
      }),
    },
    sportsTeamRepresentative: {
      findUnique: jest.fn().mockImplementation(async ({ select }) =>
        'personId' in select ? { personId: 'person-representative' } : { team: { tournamentId: 'tournament-1' } },
      ),
    },
    sportsPlayerApplication: { findUnique: jest.fn().mockResolvedValue({ tournamentId: 'tournament-1' }) },
    sportsTeamChangeRequest: {
      findUnique: jest.fn().mockImplementation(async ({ select }) =>
        'teamId' in select ? { teamId: 'team-1' } : { team: { tournamentId: 'tournament-1' } },
      ),
    },
    sportsMatchRoster: {
      findUnique: jest.fn().mockImplementation(async ({ select }) =>
        'matchId' in select ? { matchId: 'match-roster' } : { match: { category: { tournamentId: 'tournament-1' } } },
      ),
    },
    sportsVenue: { findUnique: jest.fn().mockResolvedValue({ tournamentId: 'tournament-1' }) },
    sportsTournamentScoreEntry: { findUnique: jest.fn().mockResolvedValue({ tournamentId: 'tournament-1' }) },
  };
}
