import { Permission } from '@cacic-fct/shared-permissions';
import { SportsScoreEntrySource } from '@prisma/client';
import { SportsLifecycleMutationsResolver } from './sports-lifecycle-mutations.resolver';

describe('SportsLifecycleMutationsResolver', () => {
  const actor = {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  };
  const context = { req: { user: actor } };
  const policy = { assertPermissions: jest.fn() };
  const currentUser = { getAuthenticatedUser: jest.fn() };
  const mutationEvents = { publishForEntity: jest.fn() };
  const admin = {
    deleteTournament: jest.fn(),
    deleteCategory: jest.fn(),
    deleteTeam: jest.fn(),
    deleteRegistration: jest.fn(),
    deleteMatch: jest.fn(),
    deleteVenue: jest.fn(),
    deleteOfficial: jest.fn(),
    createTournamentScoreEntry: jest.fn(),
    updateTournamentScoreEntry: jest.fn(),
    deleteTournamentScoreEntry: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser.getAuthenticatedUser.mockReturnValue(actor);
    policy.assertPermissions.mockResolvedValue(undefined);
    mutationEvents.publishForEntity.mockResolvedValue(undefined);
    for (const method of Object.values(admin)) {
      method.mockResolvedValue(undefined);
    }
  });

  it.each([
    ['deleteTournament', 'TOURNAMENT', Permission.SportsTournament.Delete, 'sportsTournamentId'],
    ['deleteCategory', 'CATEGORY', Permission.SportsCategory.Delete, 'sportsCategoryId'],
    ['deleteTeam', 'TEAM', Permission.SportsTeam.Delete, 'sportsTeamId'],
    ['deleteRegistration', 'REGISTRATION', Permission.SportsRegistration.Delete, 'sportsRegistrationId'],
    ['deleteMatch', 'MATCH', Permission.SportsMatch.Delete, 'sportsMatchId'],
    ['deleteOfficial', 'OFFICIAL', Permission.SportsOfficial.Delete, 'sportsOfficialAssignmentId'],
  ] as const)('authorizes and publishes %s', async (method, entity, permission, targetKey) => {
    const resolver = createResolver();
    const invoke = (resolver as unknown as Record<string, unknown>)[method] as (
      id: string,
      expectedRevision: number,
      requestContext: unknown,
    ) => Promise<boolean>;

    await expect(invoke.call(resolver, 'entity-1', 4, context)).resolves.toBe(true);

    expect(policy.assertPermissions).toHaveBeenCalledWith(actor, [permission], { [targetKey]: 'entity-1' });
    expect((admin[method] as jest.Mock)).toHaveBeenCalledWith('entity-1', 4, actor);
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith(entity, 'entity-1', true);
  });

  it('passes the tournament scope through score-entry mutations and publishes the resulting entity', async () => {
    admin.createTournamentScoreEntry.mockResolvedValue({ id: 'score-entry-1' });
    admin.updateTournamentScoreEntry.mockResolvedValue({ id: 'score-entry-2' });
    const resolver = createResolver();

    await expect(
      resolver.createTournamentScoreEntry(
        {
          tournamentId: 'tournament-1',
          categoryId: 'category-1',
          teamId: 'team-1',
          source: SportsScoreEntrySource.MANUAL,
          points: 3,
          reason: 'Ajuste',
        } as never,
        context as never,
      ),
    ).resolves.toBe('score-entry-1');
    await expect(
      resolver.updateTournamentScoreEntry(
        {
          id: 'score-entry-1',
          tournamentId: 'tournament-1',
          expectedRevision: 2,
          points: 4,
        } as never,
        context as never,
      ),
    ).resolves.toBe('score-entry-2');

    expect(policy.assertPermissions).toHaveBeenNthCalledWith(
      1,
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: 'tournament-1' },
    );
    expect(admin.createTournamentScoreEntry).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentId: 'tournament-1' }),
      actor,
    );
    expect(admin.updateTournamentScoreEntry).toHaveBeenCalledWith(
      'score-entry-1',
      expect.objectContaining({ tournamentId: 'tournament-1' }),
      actor,
    );
    expect(mutationEvents.publishForEntity).toHaveBeenNthCalledWith(1, 'SCORE_ENTRY', 'score-entry-1', true);
    expect(mutationEvents.publishForEntity).toHaveBeenNthCalledWith(2, 'SCORE_ENTRY', 'score-entry-2', true);
  });

  it('uses the tournament scope for venue deletion and publishes the venue invalidation', async () => {
    const resolver = createResolver();

    await expect(resolver.deleteVenue('venue-1', 'tournament-1', 6, context as never)).resolves.toBe(true);

    expect(policy.assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: 'tournament-1' },
    );
    expect(admin.deleteVenue).toHaveBeenCalledWith('venue-1', 6, actor, 'tournament-1');
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('VENUE', 'venue-1', true);
  });

  it('soft-deletes score entries only after tournament-scoped authorization', async () => {
    const resolver = createResolver();

    await expect(resolver.deleteTournamentScoreEntry('score-entry-1', 'tournament-1', 3, context as never)).resolves.toBe(
      true,
    );

    expect(policy.assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: 'tournament-1' },
    );
    expect(admin.deleteTournamentScoreEntry).toHaveBeenCalledWith('score-entry-1', 'tournament-1', 3, actor);
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('SCORE_ENTRY', 'score-entry-1', true);
  });

  function createResolver(): SportsLifecycleMutationsResolver {
    return new SportsLifecycleMutationsResolver(
      policy as never,
      {} as never,
      {} as never,
      currentUser as never,
      admin as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      mutationEvents as never,
    );
  }
});
