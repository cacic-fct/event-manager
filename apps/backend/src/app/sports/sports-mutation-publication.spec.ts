import { SportsLifecycleMutationsResolver } from './sports-lifecycle-mutations.resolver';
import { SportsTeamMutationsResolver } from './sports-team-mutations.resolver';

describe('sports mutation publication boundaries', () => {
  const actor = { sub: 'admin-1' };
  const context = { req: { user: actor } };

  it('returns a successful delete after the committed mutation when publication fails', async () => {
    const admin = {
      deleteTournament: jest.fn().mockResolvedValue(undefined),
    };
    const mutationEvents = {
      publishForEntity: jest.fn().mockRejectedValue(new Error('broker unavailable')),
    };
    const resolver = new SportsLifecycleMutationsResolver(
      { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      { getAuthenticatedUser: jest.fn().mockReturnValue(actor) } as never,
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

    await expect(resolver.deleteTournament('tournament-1', 4, context as never)).resolves.toBe(true);

    expect(admin.deleteTournament).toHaveBeenCalledWith('tournament-1', 4, actor);
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('TOURNAMENT', 'tournament-1', true);
  });

  it('publishes category-role changes by registration id and still returns when publication fails', async () => {
    const admin = {
      assignCategoryRole: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
    };
    const mutationEvents = {
      publishForEntity: jest.fn().mockRejectedValue(new Error('broker unavailable')),
    };
    const resolver = new SportsTeamMutationsResolver(
      { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      { getAuthenticatedUser: jest.fn().mockReturnValue(actor) } as never,
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

    await expect(
      resolver.assignCategoryRole(
        { registrationId: 'registration-1', teamMemberId: 'member-1', role: 'PLAYER' } as never,
        context as never,
      ),
    ).resolves.toBe('assignment-1');

    expect(admin.assignCategoryRole).toHaveBeenCalledWith(
      { registrationId: 'registration-1', teamMemberId: 'member-1', role: 'PLAYER' },
      actor,
    );
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('REGISTRATION', 'registration-1', true);
  });

  it('authorizes participant team replacement in the participant tournament scope', async () => {
    const admin = {
      setParticipantTeam: jest.fn().mockResolvedValue({ id: 'participant-1' }),
    };
    const policy = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const resolver = new SportsTeamMutationsResolver(
      policy as never,
      {} as never,
      { sportsTournamentParticipant: { findFirst: jest.fn().mockResolvedValue({ tournamentId: 'tournament-1' }) } } as never,
      { getAuthenticatedUser: jest.fn().mockReturnValue(actor) } as never,
      admin as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { publishForEntity: jest.fn() } as never,
    );

    await expect(
      resolver.setParticipantTeam({ participantId: 'participant-1', teamId: 'team-2' }, context as never),
    ).resolves.toBe('participant-1');

    expect(policy.assertPermissions).toHaveBeenCalledWith(actor, expect.any(Array), {
      sportsTournamentId: 'tournament-1',
    });
    expect(admin.setParticipantTeam).toHaveBeenCalledWith('participant-1', 'team-2', actor);
  });
});
