import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { SportsTeamMutationsResolver } from './sports-team-mutations.resolver';

describe('SportsTeamMutationsResolver team boundary operations', () => {
  it('declares scoped permission metadata for every team mutation', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, SportsTeamMutationsResolver.prototype.createTeam)).toEqual([
      Permission.SportsTeam.Create,
    ]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, SportsTeamMutationsResolver.prototype.updateTeam)).toEqual([
      Permission.SportsTeam.Update,
    ]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, SportsTeamMutationsResolver.prototype.createTeamMember),
    ).toEqual([Permission.SportsTeam.Update]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, SportsTeamMutationsResolver.prototype.updateTeamMember),
    ).toEqual([Permission.SportsTeam.Update]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, SportsTeamMutationsResolver.prototype.assignRepresentative),
    ).toEqual([Permission.SportsTeam.AssignRepresentative]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, SportsTeamMutationsResolver.prototype.revokeRepresentative),
    ).toEqual([Permission.SportsTeam.AssignRepresentative]);
  });

  it('creates a team with tournament-scoped authorization and public invalidation', async () => {
    const harness = createHarness();
    const input = { tournamentId: 'tournament-1', name: 'Equipe Azul', institution: 'FCT' };
    harness.admin.createTeam.mockResolvedValue({ id: 'team-1' });

    await expect(harness.resolver.createTeam(input as never, harness.context as never)).resolves.toBe('team-1');

    expect(harness.policy.assertPermissions).toHaveBeenCalledWith(
      harness.actor,
      [Permission.SportsTeam.Create],
      { sportsTournamentId: 'tournament-1' },
    );
    expect(harness.admin.createTeam).toHaveBeenCalledWith(input, harness.actor);
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('TEAM', 'team-1', true);
  });

  it('updates a team with team-scoped authorization and exact optimistic-concurrency input', async () => {
    const harness = createHarness();
    const input = { id: 'team-1', expectedRevision: 4, name: 'Equipe Verde', institution: null };
    harness.admin.updateTeam.mockResolvedValue({ id: 'team-1' });

    await expect(harness.resolver.updateTeam(input as never, harness.context as never)).resolves.toBe('team-1');

    expect(harness.policy.assertPermissions).toHaveBeenCalledWith(
      harness.actor,
      [Permission.SportsTeam.Update],
      { sportsTeamId: 'team-1' },
    );
    expect(harness.admin.updateTeam).toHaveBeenCalledWith('team-1', input, harness.actor);
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('TEAM', 'team-1', true);
  });

  it('creates a team member only with an explicit person and invalidates the team publicly', async () => {
    const harness = createHarness();
    const input = { teamId: 'team-1', personId: 'person-1', status: 'APPROVED' };
    harness.admin.createTeamMember.mockResolvedValue({ id: 'member-1' });

    await expect(harness.resolver.createTeamMember(input as never, harness.context as never)).resolves.toBe('member-1');

    expect(harness.policy.assertPermissions).toHaveBeenCalledWith(
      harness.actor,
      [Permission.SportsTeam.Update],
      { sportsTeamId: 'team-1' },
    );
    expect(harness.admin.createTeamMember).toHaveBeenCalledWith('team-1', 'person-1', harness.actor);
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('TEAM', 'member-1', true);
  });

  it('updates a team member using its persisted team scope and approved-status default', async () => {
    const harness = createHarness();
    const input = { id: 'member-1', expectedRevision: 2 };
    harness.prisma.sportsTeamMember.findFirst.mockResolvedValue({ teamId: 'team-1' });
    harness.admin.updateTeamMember.mockResolvedValue({ id: 'member-1' });

    await expect(harness.resolver.updateTeamMember(input as never, harness.context as never)).resolves.toBe('member-1');

    expect(harness.prisma.sportsTeamMember.findFirst).toHaveBeenCalledWith({
      where: { id: 'member-1', deletedAt: null },
      select: { teamId: true },
    });
    expect(harness.policy.assertPermissions).toHaveBeenCalledWith(
      harness.actor,
      [Permission.SportsTeam.Update],
      { sportsTeamId: 'team-1' },
    );
    expect(harness.admin.updateTeamMember).toHaveBeenCalledWith('member-1', 2, 'APPROVED', harness.actor);
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('TEAM', 'member-1', true);
  });

  it('assigns a representative with team scope and private representative invalidation', async () => {
    const harness = createHarness();
    const input = { teamId: 'team-1', personId: 'person-2' };
    harness.admin.assignRepresentative.mockResolvedValue({ id: 'representative-1' });

    await expect(harness.resolver.assignRepresentative(input as never, harness.context as never)).resolves.toBe(
      'representative-1',
    );

    expect(harness.policy.assertPermissions).toHaveBeenCalledWith(
      harness.actor,
      [Permission.SportsTeam.AssignRepresentative],
      { sportsTeamId: 'team-1' },
    );
    expect(harness.admin.assignRepresentative).toHaveBeenCalledWith('team-1', 'person-2', harness.actor);
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('REPRESENTATIVE', 'representative-1', false);
  });

  it('revokes a representative with representative scope and returns a stable success boolean', async () => {
    const harness = createHarness();
    const input = { representativeId: 'representative-1' };

    await expect(harness.resolver.revokeRepresentative(input as never, harness.context as never)).resolves.toBe(true);

    expect(harness.policy.assertPermissions).toHaveBeenCalledWith(
      harness.actor,
      [Permission.SportsTeam.AssignRepresentative],
      { sportsTeamRepresentativeId: 'representative-1' },
    );
    expect(harness.admin.revokeRepresentative).toHaveBeenCalledWith('representative-1', harness.actor);
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('REPRESENTATIVE', 'representative-1', false);
  });

  it('rejects missing members and empty person identities before policy or persistence calls', async () => {
    const harness = createHarness();

    await expect(
      harness.resolver.createTeamMember(
        { teamId: 'team-1', personId: null } as never,
        harness.context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.policy.assertPermissions).not.toHaveBeenCalled();
    expect(harness.admin.createTeamMember).not.toHaveBeenCalled();

    harness.prisma.sportsTeamMember.findFirst.mockResolvedValue(null);
    await expect(
      harness.resolver.updateTeamMember({ id: 'missing-member', expectedRevision: 1 } as never, harness.context as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.policy.assertPermissions).not.toHaveBeenCalled();
    expect(harness.admin.updateTeamMember).not.toHaveBeenCalled();
  });

  it('propagates scoped authorization failures without mutating or publishing', async () => {
    const harness = createHarness();
    const failure = new ForbiddenException('Team permission denied.');
    harness.policy.assertPermissions.mockRejectedValue(failure);

    await expect(
      harness.resolver.updateTeam({ id: 'team-1', expectedRevision: 1 } as never, harness.context as never),
    ).rejects.toBe(failure);

    expect(harness.admin.updateTeam).not.toHaveBeenCalled();
    expect(harness.mutationEvents.publishForEntity).not.toHaveBeenCalled();
  });
});

function createHarness() {
  const actor = { sub: 'admin-user', token: 'token' };
  const context = { req: { user: actor } };
  const policy = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    sportsTeamMember: { findFirst: jest.fn() },
  };
  const currentUser = { getAuthenticatedUser: jest.fn().mockReturnValue(actor) };
  const admin = {
    createTeam: jest.fn(),
    updateTeam: jest.fn(),
    createTeamMember: jest.fn(),
    updateTeamMember: jest.fn(),
    assignRepresentative: jest.fn(),
    revokeRepresentative: jest.fn().mockResolvedValue(undefined),
  };
  const mutationEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
  const resolver = new SportsTeamMutationsResolver(
    policy as never,
    {} as never,
    prisma as never,
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

  return { resolver, actor, context, policy, prisma, admin, mutationEvents };
}
